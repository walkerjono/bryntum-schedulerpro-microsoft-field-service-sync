/**
 * Timesheet / time-entry type definitions.
 *
 * Maps to the D365 Project Operations `msdyn_timeentry` entity and
 * provides UI-facing types for the timesheet panel.
 */

// ── D365 OptionSet enums ────────────────────────────────────────────

/** D365 msdyn_timeentry status values (msdyn_entrystatus OptionSet). */
export enum TimeEntryStatus {
    Draft           = 192350000,
    Returned        = 192350001,
    Approved        = 192350002,
    Submitted       = 192350003,
    RecallRequested = 192350004
}

/** D365 msdyn_timeentry type values (msdyn_type OptionSet). */
export enum TimeEntryType {
    Leave      = 1,
    Work       = 192350000,
    Absence    = 192350001,
    Vacation   = 192350002,
    OnBreak    = 192350003,
    Travel     = 192350004,
    Overtime   = 192350005,
    OutOfHours = 192354320
}

// ── Status / Type label lookups ─────────────────────────────────────

export const TIME_ENTRY_STATUS_LABELS: Record<number, string> = {
    [TimeEntryStatus.Draft]           : 'Draft',
    [TimeEntryStatus.Returned]        : 'Returned',
    [TimeEntryStatus.Approved]        : 'Approved',
    [TimeEntryStatus.Submitted]       : 'Submitted',
    [TimeEntryStatus.RecallRequested] : 'Recall Requested'
};

export const TIME_ENTRY_TYPE_LABELS: Record<number, string> = {
    [TimeEntryType.Leave]      : 'Leave',
    [TimeEntryType.Work]       : 'Work',
    [TimeEntryType.Absence]    : 'Absence',
    [TimeEntryType.Vacation]   : 'Vacation',
    [TimeEntryType.OnBreak]    : 'On Break',
    [TimeEntryType.Travel]     : 'Travel',
    [TimeEntryType.Overtime]   : 'Overtime',
    [TimeEntryType.OutOfHours] : 'Out of Hours'
};

/** Entry types that should be treated as internal (no variations). */
export const INTERNAL_ENTRY_TYPES: Set<number> = new Set([
    TimeEntryType.OutOfHours,
    TimeEntryType.Leave
]);

// ── D365 OData response shape ───────────────────────────────────────

/** Raw D365 OData record for `msdyn_timeentry`. */
export interface D365TimeEntry {
    msdyn_timeentryid: string;
    msdyn_date: string;
    msdyn_duration: number;
    msdyn_description: string | null;
    msdyn_type: number;
    msdyn_entrystatus: number;
    _msdyn_bookableresource_value: string;
    _msdyn_project_value: string | null;
    '_msdyn_project_value@OData.Community.Display.V1.FormattedValue'?: string;
    _msdyn_projecttask_value: string | null;
    '_msdyn_projecttask_value@OData.Community.Display.V1.FormattedValue'?: string;
    _msdyn_resourcecategory_value: string | null;
    '@odata.etag'?: string;
}

// ── UI-facing row type ──────────────────────────────────────────────

/** Flat time entry record used in the timesheet panel grid. */
export interface TimeEntryRow {
    id: string;
    date: Date;
    durationMinutes: number;
    durationHours: number;
    description: string;
    type: TimeEntryType;
    typeName: string;
    status: TimeEntryStatus;
    statusName: string;
    resourceId: string;
    projectId: string | null;
    projectName: string;
    taskId: string | null;
    taskName: string;
    assignmentId: string | null;
    etag: string | null;
    isEditable: boolean;
}

// ── Write payloads ──────────────────────────────────────────────────

/** POST body for creating a new time entry in D365. */
export interface CreateTimeEntryPayload {
    msdyn_date: string;
    msdyn_duration: number;
    msdyn_description?: string;
    msdyn_type: number;
    'msdyn_bookableresource@odata.bind': string;
    'msdyn_project@odata.bind'?: string;
    'msdyn_projectTask@odata.bind'?: string;
    'msdyn_resourceCategory@odata.bind'?: string;
}

/** PATCH body for updating an existing time entry. */
export interface UpdateTimeEntryPayload {
    msdyn_duration?: number;
    msdyn_description?: string;
    msdyn_type?: number;
    msdyn_entrystatus?: number;
}

// ── D365 Variation types ────────────────────────────────────────────

/** Raw D365 OData record for `ws_timesheetvariation`. */
export interface D365Variation {
    ws_timesheetvariationid: string;
    ws_remainingtime: number | null;       // stored in minutes
    ws_estimatedenddate: string | null;
    ws_comment: string | null;
    _ws_reasonid_value: string | null;
    '_ws_reasonid_value@OData.Community.Display.V1.FormattedValue'?: string;
    _ws_taskid_value: string | null;
    _ws_projectid_value: string | null;
    _ws_resourceid_value: string | null;
    statuscode: number;
    '@odata.etag'?: string;
}

/** Raw D365 OData record for `ws_timesheetvariationreason`. */
export interface D365VariationReason {
    ws_timesheetvariationreasonid: string;
    ws_name: string;
    statecode: number;
}

/** POST body for creating a variation. */
export interface CreateVariationPayload {
    ws_remainingtime: number;              // minutes
    ws_estimatedenddate?: string;
    ws_comment?: string;
    'ws_ReasonId@odata.bind'?: string;
    'ws_TaskId@odata.bind': string;
    'ws_ProjectId@odata.bind': string;
    'ws_ResourceId@odata.bind': string;
}

/** PATCH body for updating a variation. */
export interface UpdateVariationPayload {
    ws_remainingtime?: number;             // minutes
    ws_estimatedenddate?: string;
    ws_comment?: string;
    'ws_ReasonId@odata.bind'?: string;
}

// ── D365 Project / Task types ───────────────────────────────────────

/** D365 project (msdyn_project) — used in project picker. */
export interface D365Project {
    msdyn_projectid: string;
    msdyn_subject: string;
    ws_projectid?: string;
    statecode: number;
}

/** D365 project task — used to populate task pickers per project. */
export interface D365ProjectTask {
    msdyn_projecttaskid: string;
    msdyn_subject: string;
    ws_projecttasknumber?: string;
    _msdyn_project_value: string;
}

/** D365 resource assignment — links resources to project tasks. */
export interface D365ResourceAssignmentLite {
    msdyn_resourceassignmentid: string;
    _msdyn_bookableresourceid_value: string;
    _msdyn_projectid_value: string;
    _msdyn_taskid_value: string | null;
}

// ── D365 Help task types ────────────────────────────────────────────

/** D365 help task (ws_projecthelptasks). */
export interface D365HelpTask {
    ws_projecthelptasksid: string;
    ws_name: string;
    ws_description: string | null;
    ws_hours: number | null;
    ws_startdate: string | null;
    ws_enddate: string | null;
    _ws_project_value: string | null;
    '_ws_project_value@OData.Community.Display.V1.FormattedValue'?: string;
    _ws_resource_value: string | null;
    _ws_reason_value: string | null;
    statecode: number;
}

/** D365 help task reason (ws_projecthelptaskreasons). */
export interface D365HelpTaskReason {
    ws_projecthelptaskreasonsid: string;
    ws_name: string;
    statecode: number;
}

/** POST body for creating a help task. */
export interface CreateHelpTaskPayload {
    ws_name: string;
    ws_description?: string;
    ws_hours: number;
    ws_startdate: string;
    ws_enddate: string;
    'ws_project@odata.bind'?: string;
    'ws_resource@odata.bind': string;
    'ws_reason@odata.bind'?: string;
}

// ── D365 User Timesheet types ───────────────────────────────────────

/** D365 user timesheet (ws_usertimesheet) — weekly submission record. */
export interface D365UserTimesheet {
    ws_usertimesheetid: string;
    ws_name: string | null;
    ws_startdate: string | null;
    ws_enddate: string | null;
    statuscode: number;
    statecode: number;
}

/** User timesheet status values. */
export enum UserTimesheetStatus {
    Draft     = 192350000,
    Submitted = 192350001,
    Approved  = 192350002,
    Completed = 192350003
}

export const USER_TIMESHEET_STATUS_LABELS: Record<number, string> = {
    [UserTimesheetStatus.Draft]     : 'Draft',
    [UserTimesheetStatus.Submitted] : 'Submitted',
    [UserTimesheetStatus.Approved]  : 'Approved',
    [UserTimesheetStatus.Completed] : 'Completed'
};

// ── Pivot data model ────────────────────────────────────────────────

/** A single day cell in the pivot grid. */
export interface DayEntry {
    /** Hours for this day. */
    time: number;
    /** Comment / description. */
    comment: string;
    /** The D365 time entry ID (null for new rows). */
    entryId: string | null;
    /** Whether this cell has been modified. */
    changed: boolean;
    /** Whether this cell is read-only (submitted/approved). */
    readOnly: boolean;
    /** Day offset (0 = Mon, 6 = Sun). */
    dateOffset: number;
}

/**
 * The variation/remaining entry — always index [7] in the entries array.
 * For standard (`stdentry`) rows this holds variation data;
 * for internal (`intentry`) rows this is unused.
 */
export interface VariationEntry {
    /** Remaining hours / variation value. */
    time: number;
    /** Variation comment. */
    comment: string;
    /** Variation record ID (null if new). */
    entryId: string | null;
    /** Variation reason ID. */
    reasonId: string | null;
    /** Variation end date (ISO). */
    endDate: string | null;
    /** Whether this has been modified. */
    changed: boolean;
}

/** Row type discriminator. */
export type PivotRowType = 'stdentry' | 'intentry' | 'total';

/** A single row in the pivot grid — one project/task combination. */
export interface PivotRow {
    /** Unique row identifier (project+task composite). */
    id: string;
    /** Row type. */
    type: PivotRowType;
    /** Project ID. */
    projectId: string;
    /** Project display name. */
    projectName: string;
    /** Task ID (null for project-level entries). */
    taskId: string | null;
    /** Task display name. */
    taskName: string;
    /** Resource assignment ID. */
    assignmentId: string | null;
    /** Mon–Sun day entries (indices 0–6). */
    entries: [DayEntry, DayEntry, DayEntry, DayEntry, DayEntry, DayEntry, DayEntry];
    /** Variation/remaining entry (index 7 conceptually). */
    variation: VariationEntry;
    /** The D365 variation record (if loaded). */
    variationRecord: D365Variation | null;
    /** Whether any cell in this row has been modified. */
    dirty: boolean;
}

// ── Aggregation types ───────────────────────────────────────────────

/** Per-day aggregation: ISO date → total hours. */
export type DayHoursMap = Record<string, number>;

/** Weekly summary for a single resource. */
export interface WeeklySummary {
    resourceId: string;
    weekStart: Date;
    days: DayHoursMap;
    weekTotal: number;
    assignedTotal: number;
    variance: number;   // assigned – actual (positive = under, negative = over)
}
