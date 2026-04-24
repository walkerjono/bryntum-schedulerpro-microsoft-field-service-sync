/**
 * D365 CRUD operations for the `msdyn_timeentry` entity.
 *
 * Uses the shared odataHelper for paginated fetch, base URL, and headers.
 */

import { getToken } from './auth';
import { fetchAllPages, orgUrl, apiVersion, buildHeaders } from './odataHelper';
import type { D365TimeEntry, CreateTimeEntryPayload, UpdateTimeEntryPayload } from '../types/timesheet';

// ── OData entity path ───────────────────────────────────────────────

const entityPath = `${orgUrl}/api/data/${apiVersion}/msdyn_timeentries`;

// ── Read ─────────────────────────────────────────────────────────────

export interface GetTimeEntriesOpts {
    rangeStart?: Date;
    rangeEnd?: Date;
    resourceId?: string;
}

/**
 * Fetch time entries from D365, optionally filtered by date range
 * and/or bookable resource.
 */
export async function getTimeEntries(
    { rangeStart, rangeEnd, resourceId }: GetTimeEntriesOpts = {}
): Promise<{ value: D365TimeEntry[] }> {
    console.log('[timesheetCrud] Fetching time entries…');
    const token = await getToken();

    const filters: string[] = [];

    if (rangeStart && rangeEnd) {
        filters.push(`msdyn_date ge ${rangeStart.toISOString()} and msdyn_date le ${rangeEnd.toISOString()}`);
    }
    if (resourceId) {
        filters.push(`_msdyn_bookableresource_value eq '${resourceId}'`);
    }

    const filterParam = filters.length > 0 ? `&$filter=${filters.join(' and ')}` : '';

    const select = [
        'msdyn_timeentryid',
        'msdyn_date',
        'msdyn_duration',
        'msdyn_description',
        'msdyn_type',
        'msdyn_entrystatus',
        '_msdyn_bookableresource_value',
        '_msdyn_project_value',
        '_msdyn_projecttask_value',
        '_msdyn_resourcecategory_value'
    ].join(',');

    const url = `${entityPath}?$select=${select}${filterParam}`;

    const headers = buildHeaders(token, {
        'Prefer' : 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"'
    });

    return fetchAllPages<D365TimeEntry>(url, headers, { label : 'time entries' });
}

// ── Create ───────────────────────────────────────────────────────────

/**
 * Create a new time entry in D365.
 * Returns the created record with server-generated fields.
 */
export async function createTimeEntry(payload: CreateTimeEntryPayload): Promise<D365TimeEntry> {
    console.log('[timesheetCrud] Creating time entry…');
    const token = await getToken();

    const headers = buildHeaders(token, {
        'Content-Type' : 'application/json',
        'Prefer'       : 'return=representation,odata.include-annotations="OData.Community.Display.V1.FormattedValue"'
    });

    const response = await fetch(entityPath, {
        method : 'POST',
        headers,
        body   : JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('[timesheetCrud] Create failed:', errorText);
        throw new Error(`Failed to create time entry: ${response.statusText}`);
    }

    const created: D365TimeEntry = await response.json();
    console.log('[timesheetCrud] Created time entry:', created.msdyn_timeentryid);
    return created;
}

// ── Update ───────────────────────────────────────────────────────────

/**
 * Update an existing time entry via PATCH.
 * Uses optimistic concurrency with `If-Match` when an etag is provided.
 */
export async function updateTimeEntry(
    id: string,
    payload: UpdateTimeEntryPayload,
    etag?: string | null
): Promise<void> {
    console.log(`[timesheetCrud] Updating time entry ${id}…`);
    const token = await getToken();

    const extra: Record<string, string> = { 'Content-Type' : 'application/json' };
    if (etag) {
        extra['If-Match'] = etag;
    }
    const headers = buildHeaders(token, extra);

    const response = await fetch(`${entityPath}(${id})`, {
        method : 'PATCH',
        headers,
        body   : JSON.stringify(payload)
    });

    if (response.status === 412) {
        throw new Error('Concurrency conflict — the record was modified by another user. Please refresh and try again.');
    }

    if (!response.ok) {
        const errorText = await response.text();
        console.error('[timesheetCrud] Update failed:', errorText);
        throw new Error(`Failed to update time entry: ${response.statusText}`);
    }

    console.log(`[timesheetCrud] Updated time entry ${id}`);
}

// ── Delete ───────────────────────────────────────────────────────────

/**
 * Delete a time entry. Tolerates 404 (already deleted).
 */
export async function deleteTimeEntry(id: string): Promise<void> {
    console.log(`[timesheetCrud] Deleting time entry ${id}…`);
    const token = await getToken();

    const headers = buildHeaders(token);

    const response = await fetch(`${entityPath}(${id})`, {
        method : 'DELETE',
        headers
    });

    if (!response.ok && response.status !== 404) {
        const errorText = await response.text();
        console.error('[timesheetCrud] Delete failed:', errorText);
        throw new Error(`Failed to delete time entry: ${response.statusText}`);
    }

    console.log(`[timesheetCrud] Deleted time entry ${id}`);
}

// ── Submit ───────────────────────────────────────────────────────────

/**
 * Submit one or more draft time entries for approval.
 * Attempts the `msdyn_TimeEntrySubmit` custom action first; falls back
 * to a simple status PATCH if the action is unavailable.
 */
export async function submitTimeEntries(ids: string[]): Promise<void> {
    console.log(`[timesheetCrud] Submitting ${ids.length} time entries…`);
    const token = await getToken();

    const actionUrl = `${orgUrl}/api/data/${apiVersion}/msdyn_TimeEntrySubmit`;
    const headers = buildHeaders(token, { 'Content-Type' : 'application/json' });

    const body = JSON.stringify({
        TimeEntries : ids.map((id) => ({
            '@odata.type'     : 'Microsoft.Dynamics.CRM.msdyn_timeentry',
            msdyn_timeentryid : id
        }))
    });

    const response = await fetch(actionUrl, {
        method : 'POST',
        headers,
        body
    });

    if (response.ok) {
        console.log(`[timesheetCrud] Submitted ${ids.length} entries via action`);
        return;
    }

    // Fallback: PATCH each entry's status to Submitted (192350003)
    console.warn('[timesheetCrud] Submit action failed, falling back to status PATCH…');
    for (const id of ids) {
        await updateTimeEntry(id, { msdyn_entrystatus : 192350003 });
    }
    console.log(`[timesheetCrud] Submitted ${ids.length} entries via PATCH fallback`);
}

// ── Recall ───────────────────────────────────────────────────────────

/**
 * Recall a submitted time entry back to Draft.
 */
export async function recallTimeEntry(id: string): Promise<void> {
    console.log(`[timesheetCrud] Recalling time entry ${id}…`);
    const token = await getToken();

    const actionUrl = `${orgUrl}/api/data/${apiVersion}/msdyn_TimeEntryRecall`;
    const headers = buildHeaders(token, { 'Content-Type' : 'application/json' });

    const body = JSON.stringify({
        TimeEntries : [{
            '@odata.type'     : 'Microsoft.Dynamics.CRM.msdyn_timeentry',
            msdyn_timeentryid : id
        }]
    });

    const response = await fetch(actionUrl, {
        method : 'POST',
        headers,
        body
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('[timesheetCrud] Recall failed:', errorText);
        throw new Error(`Failed to recall time entry: ${response.statusText}`);
    }

    console.log(`[timesheetCrud] Recalled time entry ${id}`);
}
