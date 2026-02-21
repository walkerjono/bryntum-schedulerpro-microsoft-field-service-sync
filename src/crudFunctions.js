import { getToken } from './auth.js';

const orgUrl = `https://${import.meta.env.VITE_MICROSOFT_DYNAMICS_ORG_ID}.api.crm6.dynamics.com`;
const apiVersion = 'v9.2';

export async function getResources() {
    console.log('[crud] Fetching resources…');
    const token = await getToken();

    const response = await fetch(
        `${orgUrl}/api/data/${apiVersion}/bookableresources?` +
        `$select=bookableresourceid,name&` +
        `$expand=ContactId($select=contactid,entityimage)`,
        {
            headers : {
                'Authorization'    : `Bearer ${token}`,
                'Accept'           : 'application/json',
                'OData-MaxVersion' : '4.0',
                'OData-Version'    : '4.0'
            }
        }
    );

    if (!response.ok) {
        throw new Error(`Failed to fetch resources: ${response.statusText}`);
    }

    return await response.json();
}

/**
 * Fetch default bookableresourcecategoryassn records with expanded category to get ws_practice.
 * Returns a map of resourceId → practice display name.
 */
export async function getResourcePractices() {
    console.log('[crud] Fetching resource practices…');
    const token = await getToken();

    const response = await fetch(
        `${orgUrl}/api/data/${apiVersion}/bookableresourcecategoryassns?` +
        `$filter=msdyn_isdefault eq true&` +
        `$select=_resource_value,_resourcecategory_value&` +
        `$expand=ResourceCategory($select=bookableresourcecategoryid,name,ws_practice)`,
        {
            headers : {
                'Authorization'    : `Bearer ${token}`,
                'Accept'           : 'application/json',
                'OData-MaxVersion' : '4.0',
                'OData-Version'    : '4.0',
                'Prefer'           : 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"'
            }
        }
    );

    if (!response.ok) {
        const errorText = await response.text();
        console.error('Resource practices API Error:', errorText);
        throw new Error(`Failed to fetch resource practices: ${response.statusText}`);
    }

    const data = await response.json();

    // Build a Map<resourceId, practiceDisplayName>
    const practiceMap = new Map();
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
        }
    }

    console.log(`[crud] Built practice map for ${practiceMap.size} resources`);
    return practiceMap;
}

export async function getAssignments() {
    console.log('[crud] Fetching assignments…');
    const token = await getToken();

    const response = await fetch(
        `${orgUrl}/api/data/${apiVersion}/msdyn_resourceassignments?` +
        `$select=msdyn_resourceassignmentid,msdyn_name,msdyn_start,msdyn_finish,msdyn_effort,_msdyn_bookableresourceid_value,_msdyn_taskid_value,_msdyn_projectid_value`,
        {
            headers : {
                'Authorization'    : `Bearer ${token}`,
                'Accept'           : 'application/json',
                'OData-MaxVersion' : '4.0',
                'OData-Version'    : '4.0',
                'Prefer'           : 'odata.include-annotations="OData.Community.Display.V1.FormattedValue,Microsoft.Dynamics.CRM.lookuplogicalname"'
            }
        }
    );

    if (!response.ok) {
        const errorText = await response.text();
        console.error('Assignments API Error:', errorText);
        throw new Error(`Failed to fetch assignments: ${response.statusText}`);
    }

    return await response.json();
}
