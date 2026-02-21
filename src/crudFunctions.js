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
