import { EventModel, type ModelFieldConfig } from '@bryntum/schedulerpro';
import type { D365ResourceAssignment } from '../types/d365';

/**
 * Extended field config that includes the `convert` callback.
 * Bryntum's published types omit `convert` from configs (it's a DataField method),
 * but it is fully supported as a config property at runtime.
 */
interface FieldWithConvert extends Omit<ModelFieldConfig, 'convert'> {
    name: string;
    type?: string;
    convert?: (value: unknown, data: D365ResourceAssignment) => unknown;
}

// Custom event model for D365 Project Operations resource assignments
export default class CustomEventModel extends EventModel {
    static $name = 'CustomEventModel';

    // Bryntum reads these at runtime — the `convert` callbacks are intentional
    static fields: FieldWithConvert[] = [
        { name : 'id', dataSource : 'msdyn_resourceassignmentid' },
        { name : 'msdyn_resourceassignmentid', type : 'string' },
        { name : 'startDate', dataSource : 'msdyn_start', type : 'date' },
        { name : 'endDate', dataSource : 'msdyn_finish', type : 'date' },
        { name : 'durationUnit', defaultValue : 'hour' },
        // Prevent the engine from deriving endDate from startDate + duration.
        // We supply both dates from D365 and don't want the engine to move them.
        { name : 'manuallyScheduled', defaultValue : true },
        { name : 'effort', dataSource : 'msdyn_effort', type : 'number' },
        { name : 'resourceId', dataSource : '_msdyn_bookableresourceid_value' },
        {
            name    : 'name',
            type    : 'string',
            convert : (_value: unknown, data: D365ResourceAssignment) => {
                // Use task formatted name, fall back to msdyn_name, then existing value
                return data?.['_msdyn_taskid_value@OData.Community.Display.V1.FormattedValue']
                    || data?.msdyn_name
                    || _value
                    || 'Unnamed Assignment';
            }
        },
        {
            name    : 'projectName',
            type    : 'string',
            convert : (_value: unknown, data: D365ResourceAssignment) => {
                return data?.msdyn_projectid?.msdyn_subject
                    || data?.['_msdyn_projectid_value@OData.Community.Display.V1.FormattedValue']
                    || _value
                    || '';
            }
        },
        {
            name    : 'projectNumber',
            type    : 'string',
            convert : (_value: unknown, data: D365ResourceAssignment) => {
                return data?.msdyn_projectid?.ws_projectid
                    || _value
                    || '';
            }
        },
        {
            name    : 'clientName',
            type    : 'string',
            convert : (_value: unknown, data: D365ResourceAssignment) => {
                return data?.msdyn_projectid?.['_msdyn_customer_value@OData.Community.Display.V1.FormattedValue']
                    || _value
                    || '';
            }
        },
        {
            name    : 'taskNumber',
            type    : 'string',
            convert : (_value: unknown, data: D365ResourceAssignment) => {
                return data?.msdyn_taskid?.ws_projecttasknumber
                    || _value
                    || '';
            }
        },
        {
            name    : 'effortRemaining',
            type    : 'number',
            convert : (_value: unknown, data: D365ResourceAssignment) => {
                return data?.msdyn_taskid?.msdyn_effortremaining ?? _value ?? null;
            }
        },
        {
            name    : 'etag',
            type    : 'string',
            convert : (_value: unknown, data: D365ResourceAssignment) => {
                const raw = data?.['@odata.etag'];
                return raw ? raw.replace(/\\"/g, '"') : null;
            }
        },
        // Stores the original D365 start date so we can restore it when toggling
        // effort-remaining mode off (the visible startDate may be clamped to today).
        { name : 'originalStartDate', type : 'date' }
    ];
}
