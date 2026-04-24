import { EventModel, type ModelFieldConfig } from '@bryntum/schedulerpro';
import type { D365TimeEntry } from '../types/timesheet';
import {
    TimeEntryStatus,
    TimeEntryType,
    TIME_ENTRY_STATUS_LABELS,
    TIME_ENTRY_TYPE_LABELS
} from '../types/timesheet';

/**
 * Extended field config that includes the `convert` callback.
 * Matches the pattern used by CustomEventModel.
 */
interface FieldWithConvert extends Omit<ModelFieldConfig, 'convert'> {
    name: string;
    type?: string;
    convert?: (value: unknown, data: D365TimeEntry) => unknown;
}

/**
 * Bryntum model for D365 msdyn_timeentry records.
 *
 * Used in the timesheet panel grid — maps OData fields to friendly
 * property names with fallback chains in `convert` callbacks.
 */
export default class CustomTimeEntryModel extends EventModel {
    static $name = 'CustomTimeEntryModel';

    static fields: FieldWithConvert[] = [
        { name : 'id', dataSource : 'msdyn_timeentryid' },
        {
            name    : 'date',
            type    : 'date',
            convert : (_value: unknown, data: D365TimeEntry) => {
                return data?.msdyn_date ? new Date(data.msdyn_date) : _value ?? null;
            }
        },
        {
            name    : 'durationMinutes',
            type    : 'number',
            convert : (_value: unknown, data: D365TimeEntry) => {
                return data?.msdyn_duration ?? _value ?? 0;
            }
        },
        {
            name    : 'durationHours',
            type    : 'number',
            convert : (_value: unknown, data: D365TimeEntry) => {
                const mins = data?.msdyn_duration ?? 0;
                return mins / 60;
            }
        },
        {
            name    : 'description',
            type    : 'string',
            convert : (_value: unknown, data: D365TimeEntry) => {
                return data?.msdyn_description ?? _value ?? '';
            }
        },
        {
            name    : 'type',
            type    : 'number',
            convert : (_value: unknown, data: D365TimeEntry) => {
                return data?.msdyn_type ?? _value ?? TimeEntryType.Work;
            }
        },
        {
            name    : 'typeName',
            type    : 'string',
            convert : (_value: unknown, data: D365TimeEntry) => {
                const typeVal = data?.msdyn_type ?? TimeEntryType.Work;
                return TIME_ENTRY_TYPE_LABELS[typeVal] ?? 'Work';
            }
        },
        {
            name    : 'status',
            type    : 'number',
            convert : (_value: unknown, data: D365TimeEntry) => {
                return data?.msdyn_entrystatus ?? _value ?? TimeEntryStatus.Draft;
            }
        },
        {
            name    : 'statusName',
            type    : 'string',
            convert : (_value: unknown, data: D365TimeEntry) => {
                const statusVal = data?.msdyn_entrystatus ?? TimeEntryStatus.Draft;
                return TIME_ENTRY_STATUS_LABELS[statusVal] ?? 'Draft';
            }
        },
        {
            name    : 'resourceId',
            type    : 'string',
            convert : (_value: unknown, data: D365TimeEntry) => {
                return data?._msdyn_bookableresource_value ?? _value ?? '';
            }
        },
        {
            name    : 'projectId',
            type    : 'string',
            convert : (_value: unknown, data: D365TimeEntry) => {
                return data?._msdyn_project_value ?? _value ?? null;
            }
        },
        {
            name    : 'projectName',
            type    : 'string',
            convert : (_value: unknown, data: D365TimeEntry) => {
                return data?.['_msdyn_project_value@OData.Community.Display.V1.FormattedValue']
                    ?? _value
                    ?? '';
            }
        },
        {
            name    : 'taskId',
            type    : 'string',
            convert : (_value: unknown, data: D365TimeEntry) => {
                return data?._msdyn_projecttask_value ?? _value ?? null;
            }
        },
        {
            name    : 'taskName',
            type    : 'string',
            convert : (_value: unknown, data: D365TimeEntry) => {
                return data?.['_msdyn_projecttask_value@OData.Community.Display.V1.FormattedValue']
                    ?? _value
                    ?? '';
            }
        },
        {
            name    : 'assignmentId',
            type    : 'string',
            convert : (_value: unknown, data: D365TimeEntry) => {
                return data?._msdyn_resourcecategory_value ?? _value ?? null;
            }
        },
        {
            name    : 'etag',
            type    : 'string',
            convert : (_value: unknown, data: D365TimeEntry) => {
                const raw = data?.['@odata.etag'];
                return raw ? raw.replace(/\\"/g, '"') : null;
            }
        },
        {
            name    : 'isEditable',
            type    : 'boolean',
            convert : (_value: unknown, data: D365TimeEntry) => {
                const status = data?.msdyn_entrystatus ?? TimeEntryStatus.Draft;
                return status === TimeEntryStatus.Draft || status === TimeEntryStatus.Returned;
            }
        }
    ];
}
