import { getToken } from './auth';
import { fetchAllPages, orgUrl, apiVersion } from './odataHelper';
import type { D365BookableResource, D365ResourceAssignment, D365ResourceCategoryAssignment } from '../types/d365';

export async function getResources(): Promise<{ value: D365BookableResource[] }> {
    console.log('[crud] Fetching resources…');
    const token = await getToken();

    // only Active bookable resources of type "User" (resourcetype eq 3) are relevant for scheduling
    const url =
        `${orgUrl}/api/data/${apiVersion}/bookableresources?` +
        `$filter=statecode eq 0 and resourcetype eq 3&` +
        `$select=bookableresourceid,name,ws_workinghours&` +
        `$expand=ContactId($select=contactid,entityimage)`;

    const headers = {
        'Authorization'    : `Bearer ${token}`,
        'Accept'           : 'application/json',
        'OData-MaxVersion' : '4.0',
        'OData-Version'    : '4.0'
    };

    return fetchAllPages<D365BookableResource>(url, headers, { label : 'resources' });
}

/**
 * Fetch default bookableresourcecategoryassn records with expanded category.
 * Returns { practiceMap: Map<resourceId, string>, roleMap: Map<resourceId, string> }.
 */
export async function getResourcePractices(): Promise<{ practiceMap: Map<string, string>; roleMap: Map<string, string> }> {
    console.log('[crud] Fetching resource practices…');
    const token = await getToken();

    const url =
        `${orgUrl}/api/data/${apiVersion}/bookableresourcecategoryassns?` +
        `$filter=msdyn_isdefault eq true&` +
        `$select=_resource_value,_resourcecategory_value&` +
        `$expand=ResourceCategory($select=bookableresourcecategoryid,name,ws_practice)`;

    const headers = {
        'Authorization'    : `Bearer ${token}`,
        'Accept'           : 'application/json',
        'OData-MaxVersion' : '4.0',
        'OData-Version'    : '4.0',
        'Prefer'           : 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"'
    };

    const data = await fetchAllPages<D365ResourceCategoryAssignment>(url, headers, { label : 'resource practices' });

    // Build Map<resourceId, practiceDisplayName> and Map<resourceId, roleName>
    const practiceMap = new Map<string, string>();
    const roleMap = new Map<string, string>();
    for (const assn of data.value) {
        const resourceId = assn._resource_value;
        const category = assn.ResourceCategory;
        if (resourceId && category) {
            // Use the formatted annotation value for ws_practice, fall back to raw value
            const practiceLabel = category['ws_practice@OData.Community.Display.V1.FormattedValue']
                || category.ws_practice
                || null;
            if (practiceLabel) {
                practiceMap.set(resourceId, String(practiceLabel));
            }

            // Role name from the bookableresourcecategory.name field
            const roleName = category.name || 'Unassigned';
            roleMap.set(resourceId, String(roleName));
        }
    }

    console.log(`[crud] Built practice map for ${practiceMap.size} resources, role map for ${roleMap.size} resources`);
    return { practiceMap, roleMap };
}

/**
 * Fetch resource assignments from D365.
 * When `rangeStart` and `rangeEnd` are provided the OData query adds a date
 * overlap filter so only assignments that intersect the given window are
 * returned — significantly reducing payload for large organisations.
 */
export async function getAssignments({ rangeStart, rangeEnd }: { rangeStart?: Date; rangeEnd?: Date } = {}): Promise<{ value: D365ResourceAssignment[] }> {
    console.log('[crud] Fetching assignments…');
    const token = await getToken();

    let filter = 'msdyn_projectid/statecode eq 0';

    if (rangeStart && rangeEnd) {
        // Overlap query: assignment finishes after range start AND starts before range end
        const isoStart = rangeStart.toISOString();
        const isoEnd   = rangeEnd.toISOString();
        filter += ` and msdyn_finish ge ${isoStart} and msdyn_start le ${isoEnd}`;
        console.log(`[crud] Date filter: ${isoStart} → ${isoEnd}`);
    }

    const url =
        `${orgUrl}/api/data/${apiVersion}/msdyn_resourceassignments?` +
        `$select=msdyn_resourceassignmentid,msdyn_name,msdyn_start,msdyn_finish,msdyn_effort,_msdyn_bookableresourceid_value,_msdyn_taskid_value,_msdyn_projectid_value&` +
        `$expand=msdyn_projectid($select=ws_projectid,msdyn_subject,_msdyn_customer_value),msdyn_taskid($select=msdyn_effortremaining,ws_projecttasknumber)&` +
        `$filter=${filter}`;

    const headers = {
        'Authorization'    : `Bearer ${token}`,
        'Accept'           : 'application/json',
        'OData-MaxVersion' : '4.0',
        'OData-Version'    : '4.0',
        'Prefer'           : 'odata.include-annotations="OData.Community.Display.V1.FormattedValue,Microsoft.Dynamics.CRM.lookuplogicalname"'
    };

    return fetchAllPages<D365ResourceAssignment>(url, headers, { label : 'assignments' });
}
