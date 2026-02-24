import { EventModel } from '@bryntum/schedulerpro';

// Custom event model for D365 Project Operations resource assignments
export default class CustomEventModel extends EventModel {
    static $name = 'CustomEventModel';

    static fields = [
        { name : 'id', dataSource : 'msdyn_resourceassignmentid' },
        { name : 'msdyn_resourceassignmentid', type : 'string' },
        { name : 'startDate', dataSource : 'msdyn_start', type : 'date' },
        { name : 'endDate', dataSource : 'msdyn_finish', type : 'date' },
        { name : 'durationUnit', defaultValue : 'hour' },
        { name : 'effort', dataSource : 'msdyn_effort', type : 'number' },
        { name : 'resourceId', dataSource : '_msdyn_bookableresourceid_value' },
        {
            name    : 'name',
            type    : 'string',
            convert : (value, data) => {
                // Use task formatted name, fall back to msdyn_name, then existing value
                return data?.['_msdyn_taskid_value@OData.Community.Display.V1.FormattedValue']
                    || data?.msdyn_name
                    || value
                    || 'Unnamed Assignment';
            }
        },
        {
            name    : 'projectName',
            type    : 'string',
            convert : (value, data) => {
                return data?.msdyn_projectid?.msdyn_subject
                    || data?.['_msdyn_projectid_value@OData.Community.Display.V1.FormattedValue']
                    || value
                    || '';
            }
        },
        {
            name    : 'projectNumber',
            type    : 'string',
            convert : (value, data) => {
                return data?.msdyn_projectid?.ws_projectid
                    || value
                    || '';
            }
        },
        {
            name    : 'clientName',
            type    : 'string',
            convert : (value, data) => {
                return data?.msdyn_projectid?.['_msdyn_customer_value@OData.Community.Display.V1.FormattedValue']
                    || value
                    || '';
            }
        },
        {
            name    : 'etag',
            type    : 'string',
            convert : (_value, data) => {
                const raw = data?.['@odata.etag'];
                return raw ? raw.replace(/\\"/g, '"') : null;
            }
        }
    ];
}
