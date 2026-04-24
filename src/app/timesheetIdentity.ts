/**
 * Identity resolution for the timesheet view.
 *
 * Resolves the current user's bookable resource ID via WhoAmI → systemuser →
 * bookableresource chain. Also supports impersonation (acting as another user).
 *
 * D365 API chain:
 *   1. WhoAmI → UserId (systemuser GUID)
 *   2. systemusers(UserId) → internalemailaddress
 *   3. bookableresources?$filter=name eq '{email}' → bookableresourceid
 *
 * For impersonation, the manager selects a resource from a list and
 * overrides the active resource ID.
 */

import { getToken } from './auth';
import { orgUrl, apiVersion, buildHeaders, fetchAllPages } from './odataHelper';

// ── Types ───────────────────────────────────────────────────────────

export interface WhoAmIResponse {
    UserId: string;
    BusinessUnitId: string;
    OrganizationId: string;
}

export interface SystemUser {
    systemuserid: string;
    fullname: string;
    internalemailaddress: string;
    domainname: string;
}

export interface BookableResource {
    bookableresourceid: string;
    name: string;
    resourcetype: number;
    statecode: number;
    _userid_value?: string;
    'name@OData.Community.Display.V1.FormattedValue'?: string;
}

export interface BookableResourceCategoryAssignment {
    _resource_value: string;
    _resourcecategory_value: string;
    msdyn_isdefault: boolean;
    'ResourceCategory'?: {
        name: string;
        ws_practice: string | number | null;
        'ws_practice@OData.Community.Display.V1.FormattedValue'?: string;
    };
}

export interface ResolvedIdentity {
    userId: string;
    userFullName: string;
    userEmail: string;
    resourceId: string;
    resourceName: string;
}

// ── State ───────────────────────────────────────────────────────────

let resolvedIdentity: ResolvedIdentity | null = null;
let impersonatedResourceId: string | null = null;

// ── WhoAmI ──────────────────────────────────────────────────────────

/**
 * Call D365 WhoAmI to get the current logged-in user's system user ID.
 */
export async function whoAmI(): Promise<WhoAmIResponse> {
    const token = await getToken();
    const url = `${orgUrl}/api/data/${apiVersion}/WhoAmI`;
    const headers = buildHeaders(token);

    const response = await fetch(url, { headers });
    if (!response.ok) {
        throw new Error(`WhoAmI failed: ${response.statusText}`);
    }

    return response.json();
}

// ── System User lookup ──────────────────────────────────────────────

/**
 * Fetch a systemuser by ID to get their email and name.
 */
export async function getSystemUser(userId: string): Promise<SystemUser> {
    const token = await getToken();
    const url = `${orgUrl}/api/data/${apiVersion}/systemusers(${userId})?$select=systemuserid,fullname,internalemailaddress,domainname`;
    const headers = buildHeaders(token);

    const response = await fetch(url, { headers });
    if (!response.ok) {
        throw new Error(`Failed to fetch system user ${userId}: ${response.statusText}`);
    }

    return response.json();
}

// ── Bookable Resource lookup ────────────────────────────────────────

/**
 * Find the bookable resource for a given user by matching on the
 * user lookup field or name/email.
 */
export async function resolveBookableResource(userId: string): Promise<BookableResource | null> {
    const token = await getToken();
    const headers = buildHeaders(token, {
        'Prefer' : 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"'
    });

    // Primary lookup: filter by userId (user-type resources)
    const url = `${orgUrl}/api/data/${apiVersion}/bookableresources?$select=bookableresourceid,name,resourcetype,statecode&$filter=_userid_value eq ${userId} and statecode eq 0`;

    const { value } = await fetchAllPages<BookableResource>(url, headers, { label : 'bookable resources' });

    if (value.length > 0) {
        return value[0] ?? null;
    }

    return null;
}

/**
 * Get all active bookable resources (for impersonation dropdown).
 * Fetches user-type resources (resourcetype=3) that are active.
 */
export async function getAllBookableResources(): Promise<BookableResource[]> {
    const token = await getToken();
    const headers = buildHeaders(token, {
        'Prefer' : 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"'
    });

    const url = `${orgUrl}/api/data/${apiVersion}/bookableresources?$select=bookableresourceid,name,resourcetype,statecode&$filter=statecode eq 0 and resourcetype eq 3&$orderby=name asc`;

    const { value } = await fetchAllPages<BookableResource>(url, headers, { label : 'all resources' });
    return value;
}

/**
 * Get resource category assignments (roles/practices) for a resource.
 */
export async function getResourceCategories(resourceId: string): Promise<BookableResourceCategoryAssignment[]> {
    const token = await getToken();
    const headers = buildHeaders(token, {
        'Prefer' : 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"'
    });

    const url = `${orgUrl}/api/data/${apiVersion}/bookableresourcecategoryassns?$select=_resource_value,_resourcecategory_value,msdyn_isdefault&$expand=ResourceCategory($select=name,ws_practice)&$filter=_resource_value eq ${resourceId}`;

    const { value } = await fetchAllPages<BookableResourceCategoryAssignment>(url, headers, { label : 'resource categories' });
    return value;
}

// ── Full identity resolution ────────────────────────────────────────

/**
 * Resolve the current user's identity chain:
 * WhoAmI → systemuser → bookableresource.
 *
 * Caches the result after first call.
 */
export async function resolveIdentity(): Promise<ResolvedIdentity> {
    if (resolvedIdentity) return resolvedIdentity;

    console.log('[timesheetIdentity] Resolving identity…');

    // Step 1: WhoAmI
    const whoAmIResult = await whoAmI();
    console.log('[timesheetIdentity] UserId:', whoAmIResult.UserId);

    // Step 2: Get system user details
    const user = await getSystemUser(whoAmIResult.UserId);
    console.log('[timesheetIdentity] User:', user.fullname, user.internalemailaddress);

    // Step 3: Resolve bookable resource
    const resource = await resolveBookableResource(whoAmIResult.UserId);
    if (!resource) {
        throw new Error(`No active bookable resource found for user ${user.fullname} (${user.internalemailaddress}). Please contact your administrator.`);
    }
    console.log('[timesheetIdentity] Resource:', resource.name, resource.bookableresourceid);

    resolvedIdentity = {
        userId       : whoAmIResult.UserId,
        userFullName : user.fullname,
        userEmail    : user.internalemailaddress,
        resourceId   : resource.bookableresourceid,
        resourceName : resource.name
    };

    return resolvedIdentity;
}

// ── Impersonation ───────────────────────────────────────────────────

const IMPERSONATION_STORAGE_KEY = 'ws_impersonateUser';

/**
 * Get the currently active resource ID — either impersonated or
 * the resolved identity's own resource.
 *
 * Falls back to localStorage for cross-refresh persistence (matching
 * original D365 behaviour).
 */
export function getActiveResourceId(): string | null {
    if (impersonatedResourceId) return impersonatedResourceId;

    // Restore from localStorage if available (survives page refresh)
    try {
        const stored = localStorage.getItem(IMPERSONATION_STORAGE_KEY);
        if (stored) {
            impersonatedResourceId = stored;
            return stored;
        }
    }
    catch {
        // localStorage unavailable
    }

    return resolvedIdentity?.resourceId ?? null;
}

/**
 * Check if currently impersonating another user.
 */
export function isImpersonating(): boolean {
    const activeId = getActiveResourceId();
    return activeId != null
        && resolvedIdentity != null
        && activeId !== resolvedIdentity.resourceId;
}

/**
 * Set impersonation to act as another resource.
 * Persists to localStorage so it survives page refresh.
 */
export function setImpersonation(resourceId: string | null): void {
    impersonatedResourceId = resourceId;
    try {
        if (resourceId) {
            localStorage.setItem(IMPERSONATION_STORAGE_KEY, resourceId);
        }
        else {
            localStorage.removeItem(IMPERSONATION_STORAGE_KEY);
        }
    }
    catch {
        // localStorage unavailable
    }
}

/**
 * Clear impersonation, revert to own resource.
 */
export function clearImpersonation(): void {
    impersonatedResourceId = null;
    try {
        localStorage.removeItem(IMPERSONATION_STORAGE_KEY);
    }
    catch {
        // localStorage unavailable
    }
}

/**
 * Get the cached resolved identity (null if not yet resolved).
 */
export function getResolvedIdentity(): ResolvedIdentity | null {
    return resolvedIdentity;
}

/**
 * Clear cached identity (for testing or sign-out).
 */
export function resetIdentity(): void {
    resolvedIdentity = null;
    impersonatedResourceId = null;
    try {
        localStorage.removeItem(IMPERSONATION_STORAGE_KEY);
    }
    catch {
        // localStorage unavailable
    }
}
