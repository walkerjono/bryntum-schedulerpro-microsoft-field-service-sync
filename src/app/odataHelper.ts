/**
 * Shared Dataverse / OData helpers.
 *
 * Environment-derived API config and the generic paginated fetch
 * function live here so both `crudFunctions.ts` and
 * `timesheetCrud.ts` (or any future CRUD module) can share them
 * without circular imports.
 */

import type { ODataResponse } from '../types/d365';

// ── Dataverse connection config (from env) ──────────────────────────

const crmRegion  = import.meta.env.VITE_CRM_REGION || 'crm6';

/** Base organisation URL, e.g. `https://contoso.api.crm6.dynamics.com` */
export const orgUrl: string =
    `https://${import.meta.env.VITE_MICROSOFT_DYNAMICS_ORG_ID}.api.${crmRegion}.dynamics.com`;

/** Dataverse Web API version, e.g. `v9.2` */
export const apiVersion: string =
    import.meta.env.VITE_DATAVERSE_API_VERSION || 'v9.2';

/** Maximum OData pages before stopping pagination. */
export const maxPages: number =
    Number(import.meta.env.VITE_ODATA_MAX_PAGES) || 20;

// ── Standard OData request headers ──────────────────────────────────

/** Build the baseline headers every Dataverse call needs. */
export function buildHeaders(token: string, extraHeaders?: Record<string, string>): Record<string, string> {
    return {
        'Authorization'    : `Bearer ${token}`,
        'Accept'           : 'application/json',
        'OData-MaxVersion' : '4.0',
        'OData-Version'    : '4.0',
        ...extraHeaders
    };
}

// ── Paginated fetch ─────────────────────────────────────────────────

export interface FetchAllPagesOpts {
    label?: string;
    maxPages?: number;
}

/**
 * Generic paginated OData fetch.
 * Follows `@odata.nextLink` until all pages are consumed or
 * `maxPages` is reached.
 *
 * Returns `{ value: [...allRecords] }` to match the single-page
 * response shape.
 */
export async function fetchAllPages<T>(
    url: string,
    headers: Record<string, string>,
    { label = 'records', maxPages: pageLimit = maxPages }: FetchAllPagesOpts = {}
): Promise<{ value: T[] }> {
    const allRecords: T[] = [];
    let nextUrl: string | null = url;
    let page = 0;

    while (nextUrl) {
        page++;
        if (page > pageLimit) {
            console.warn(`[odata] ⚠ Reached max page limit (${pageLimit}) fetching ${label}. Some records may be missing.`);
            break;
        }

        const response = await fetch(nextUrl, { headers });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[odata] ${label} API Error (page ${page}):`, errorText);
            throw new Error(`Failed to fetch ${label} (page ${page}): ${response.statusText}`);
        }

        const data: ODataResponse<T> = await response.json();
        allRecords.push(...data.value);

        nextUrl = data['@odata.nextLink'] || null;
    }

    console.log(`[odata] Fetched ${page} page(s), ${allRecords.length} ${label} total`);
    return { value : allRecords };
}
