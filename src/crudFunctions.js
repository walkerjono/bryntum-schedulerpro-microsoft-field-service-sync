import { getToken } from './auth.js';

const orgUrl = `https://${import.meta.env.VITE_MICROSOFT_DYNAMICS_ORG_ID}.api.crm6.dynamics.com`;
const apiVersion = 'v9.2';

/**
 * Generic paginated OData fetch.
 * Follows @odata.nextLink until all pages are consumed.
 * Returns { value: [...allRecords] } to match the single-page response shape.
 */
async function fetchAllPages(url, headers, { label = 'records', maxPages = 20 } = {}) {
    const allRecords = [];
    let nextUrl = url;
    let page = 0;

    while (nextUrl) {
        page++;
        if (page > maxPages) {
            console.warn(`[crud] ⚠ Reached max page limit (${maxPages}) fetching ${label}. Some records may be missing.`);
            break;
        }

        const response = await fetch(nextUrl, { headers });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[crud] ${label} API Error (page ${page}):`, errorText);
            throw new Error(`Failed to fetch ${label} (page ${page}): ${response.statusText}`);
        }

        const data = await response.json();
        allRecords.push(...data.value);

        nextUrl = data['@odata.nextLink'] || null;
    }

    console.log(`[crud] Fetched ${page} page(s), ${allRecords.length} ${label} total`);
    return { value: allRecords };
}

export async function getResources() {
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

    return fetchAllPages(url, headers, { label : 'resources' });
}

/**
 * Fetch default bookableresourcecategoryassn records with expanded category.
 * Returns { practiceMap: Map<resourceId, string>, roleMap: Map<resourceId, string> }.
 */
export async function getResourcePractices() {
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

    const data = await fetchAllPages(url, headers, { label : 'resource practices' });

    // Build Map<resourceId, practiceDisplayName> and Map<resourceId, roleName>
    const practiceMap = new Map();
    const roleMap = new Map();
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

export async function getAssignments() {
    console.log('[crud] Fetching assignments…');
    const token = await getToken();

    const url =
        `${orgUrl}/api/data/${apiVersion}/msdyn_resourceassignments?` +
        `$select=msdyn_resourceassignmentid,msdyn_name,msdyn_start,msdyn_finish,msdyn_effort,_msdyn_bookableresourceid_value,_msdyn_taskid_value,_msdyn_projectid_value&` +
        `$expand=msdyn_projectid($select=ws_projectid,msdyn_subject,_msdyn_customer_value),msdyn_taskid($select=msdyn_effortremaining,ws_projecttasknumber)&` +
        `$filter=msdyn_projectid/statecode eq 0`;

    const headers = {
        'Authorization'    : `Bearer ${token}`,
        'Accept'           : 'application/json',
        'OData-MaxVersion' : '4.0',
        'OData-Version'    : '4.0',
        'Prefer'           : 'odata.include-annotations="OData.Community.Display.V1.FormattedValue,Microsoft.Dynamics.CRM.lookuplogicalname"'
    };

    return fetchAllPages(url, headers, { label : 'assignments' });
}
