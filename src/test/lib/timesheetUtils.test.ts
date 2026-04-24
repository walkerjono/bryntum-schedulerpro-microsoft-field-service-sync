import { describe, it, expect } from 'vitest';
import {
    toTimeEntryRow,
    resolveTimeEntries,
    getWeekStart,
    getWeekEnd,
    getWeekDays,
    toISODateString,
    aggregateDayHours,
    buildWeeklySummary,
    validateTimeEntry,
    buildCreatePayload,
    statusBadgeClass,
    getEditableEntries,
    getSubmittableEntries
} from '../../lib/timesheetUtils';
import { TimeEntryStatus, TimeEntryType } from '../../types/timesheet';
import type { D365TimeEntry, TimeEntryRow } from '../../types/timesheet';

// ── Helpers ─────────────────────────────────────────────────────────

function makeRawEntry(overrides: Partial<D365TimeEntry> = {}): D365TimeEntry {
    return {
        msdyn_timeentryid                                                    : 'te-001',
        msdyn_date                                                           : '2026-06-09T00:00:00Z',
        msdyn_duration                                                       : 120,
        msdyn_description                                                    : 'Some work',
        msdyn_type                                                           : TimeEntryType.Work,
        msdyn_entrystatus                                                    : TimeEntryStatus.Draft,
        _msdyn_bookableresource_value                                        : 'res-001',
        _msdyn_project_value                                                 : 'proj-001',
        '_msdyn_project_value@OData.Community.Display.V1.FormattedValue'     : 'Project Alpha',
        _msdyn_projecttask_value                                             : 'task-001',
        '_msdyn_projecttask_value@OData.Community.Display.V1.FormattedValue' : 'Task 1',
        _msdyn_resourcecategory_value                                        : null,

        '@odata.etag'                                                        : 'W/\\"12345\\"',
        ...overrides
    };
}

function makeRow(overrides: Partial<TimeEntryRow> = {}): TimeEntryRow {
    return {
        id              : 'te-001',
        date            : new Date('2026-06-09'),
        durationMinutes : 120,
        durationHours   : 2,
        description     : 'Some work',
        type            : TimeEntryType.Work,
        typeName        : 'Work',
        status          : TimeEntryStatus.Draft,
        statusName      : 'Draft',
        resourceId      : 'res-001',
        projectId       : 'proj-001',
        projectName     : 'Project Alpha',
        taskId          : 'task-001',
        taskName        : 'Task 1',
        assignmentId    : 'assign-001',
        etag            : 'W/\\"12345\\"',
        isEditable      : true,
        ...overrides
    };
}

// ── toTimeEntryRow ──────────────────────────────────────────────────

describe('toTimeEntryRow', () => {
    it('converts a raw D365 record to a TimeEntryRow', () => {
        const row = toTimeEntryRow(makeRawEntry());
        expect(row.id).toBe('te-001');
        expect(row.date).toBeInstanceOf(Date);
        expect(row.durationMinutes).toBe(120);
        expect(row.durationHours).toBe(2);
        expect(row.description).toBe('Some work');
        expect(row.type).toBe(TimeEntryType.Work);
        expect(row.typeName).toBe('Work');
        expect(row.status).toBe(TimeEntryStatus.Draft);
        expect(row.statusName).toBe('Draft');
        expect(row.resourceId).toBe('res-001');
        expect(row.projectId).toBe('proj-001');
        expect(row.projectName).toBe('Project Alpha');
        expect(row.taskId).toBe('task-001');
        expect(row.taskName).toBe('Task 1');
        expect(row.isEditable).toBe(true);
    });

    it('is editable for Draft', () => {
        const row = toTimeEntryRow(makeRawEntry({ msdyn_entrystatus : TimeEntryStatus.Draft }));
        expect(row.isEditable).toBe(true);
    });

    it('is editable for Returned', () => {
        const row = toTimeEntryRow(makeRawEntry({ msdyn_entrystatus : TimeEntryStatus.Returned }));
        expect(row.isEditable).toBe(true);
    });

    it('is not editable for Submitted', () => {
        const row = toTimeEntryRow(makeRawEntry({ msdyn_entrystatus : TimeEntryStatus.Submitted }));
        expect(row.isEditable).toBe(false);
    });

    it('is not editable for Approved', () => {
        const row = toTimeEntryRow(makeRawEntry({ msdyn_entrystatus : TimeEntryStatus.Approved }));
        expect(row.isEditable).toBe(false);
    });

    it('defaults description to empty when null', () => {
        const row = toTimeEntryRow(makeRawEntry({ msdyn_description : null }));
        expect(row.description).toBe('');
    });

    it('defaults projectName to empty when annotation missing', () => {
        const data = makeRawEntry();
        delete (data as Record<string, unknown>)['_msdyn_project_value@OData.Community.Display.V1.FormattedValue'];
        const row = toTimeEntryRow(data);
        expect(row.projectName).toBe('');
    });
});

// ── resolveTimeEntries ──────────────────────────────────────────────

describe('resolveTimeEntries', () => {
    it('maps an array of raw records', () => {
        const rows = resolveTimeEntries([makeRawEntry(), makeRawEntry({ msdyn_timeentryid : 'te-002' })]);
        expect(rows).toHaveLength(2);
        expect(rows[0].id).toBe('te-001');
        expect(rows[1].id).toBe('te-002');
    });

    it('returns empty array for empty input', () => {
        expect(resolveTimeEntries([])).toEqual([]);
    });
});

// ── getWeekStart ────────────────────────────────────────────────────

describe('getWeekStart', () => {
    it('returns Monday for a Wednesday', () => {
        // 2026-06-10 is a Wednesday
        const result = getWeekStart(new Date(2026, 5, 10));
        expect(result.getDay()).toBe(1); // Monday
        expect(result.getDate()).toBe(8);
    });

    it('returns same day if already Monday', () => {
        // 2026-06-08 is a Monday
        const result = getWeekStart(new Date(2026, 5, 8));
        expect(result.getDay()).toBe(1);
        expect(result.getDate()).toBe(8);
    });

    it('returns previous Monday for a Sunday', () => {
        // 2026-06-14 is a Sunday
        const result = getWeekStart(new Date(2026, 5, 14));
        expect(result.getDay()).toBe(1);
        expect(result.getDate()).toBe(8);
    });
});

// ── getWeekEnd ──────────────────────────────────────────────────────

describe('getWeekEnd', () => {
    it('returns Sunday of the same week', () => {
        const result = getWeekEnd(new Date(2026, 5, 10)); // Wed Jun 10
        expect(result.getDay()).toBe(0); // Sunday
        expect(result.getDate()).toBe(14);
    });
});

// ── getWeekDays ─────────────────────────────────────────────────────

describe('getWeekDays', () => {
    it('returns exactly 7 days starting from Monday', () => {
        const days = getWeekDays(new Date(2026, 5, 10));
        expect(days).toHaveLength(7);
        expect(days[0].getDay()).toBe(1); // Monday
        expect(days[6].getDay()).toBe(0); // Sunday
    });
});

// ── toISODateString ─────────────────────────────────────────────────

describe('toISODateString', () => {
    it('formats a date as YYYY-MM-DD', () => {
        expect(toISODateString(new Date(2026, 5, 9))).toBe('2026-06-09');
    });

    it('pads single-digit months and days', () => {
        expect(toISODateString(new Date(2026, 0, 5))).toBe('2026-01-05');
    });
});

// ── aggregateDayHours ───────────────────────────────────────────────

describe('aggregateDayHours', () => {
    it('sums hours per day for the given week', () => {
        const weekStart = new Date(2026, 5, 8); // Monday Jun 8
        const entries: TimeEntryRow[] = [
            makeRow({ date : new Date(2026, 5, 8), durationHours : 3 }),
            makeRow({ date : new Date(2026, 5, 8), durationHours : 2 }),
            makeRow({ date : new Date(2026, 5, 10), durationHours : 4 })
        ];
        const result = aggregateDayHours(entries, weekStart);
        expect(result['2026-06-08']).toBe(5);
        expect(result['2026-06-10']).toBe(4);
        expect(result['2026-06-09']).toBe(0);
    });

    it('returns all zeros for empty entries', () => {
        const result = aggregateDayHours([], new Date(2026, 5, 8));
        const values = Object.values(result);
        expect(values).toHaveLength(7);
        expect(values.every((v) => v === 0)).toBe(true);
    });
});

// ── buildWeeklySummary ──────────────────────────────────────────────

describe('buildWeeklySummary', () => {
    it('computes weekTotal and variance', () => {
        const entries: TimeEntryRow[] = [
            makeRow({ date : new Date(2026, 5, 8), durationHours : 8 }),
            makeRow({ date : new Date(2026, 5, 9), durationHours : 7 })
        ];
        const result = buildWeeklySummary(entries, 'res-001', new Date(2026, 5, 8), 40);
        expect(result.weekTotal).toBe(15);
        expect(result.assignedTotal).toBe(40);
        expect(result.variance).toBe(25); // 40 - 15
    });
});

// ── validateTimeEntry ───────────────────────────────────────────────

describe('validateTimeEntry', () => {
    it('passes for valid input', () => {
        const result = validateTimeEntry(2, new Date());
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('fails for zero duration', () => {
        const result = validateTimeEntry(0, new Date());
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Duration must be greater than 0.');
    });

    it('fails for negative duration', () => {
        const result = validateTimeEntry(-1, new Date());
        expect(result.valid).toBe(false);
    });

    it('fails for duration exceeding max', () => {
        const result = validateTimeEntry(25, new Date(), { maxHours : 24 });
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('cannot exceed 24');
    });

    it('fails for null date', () => {
        const result = validateTimeEntry(2, null);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('A valid date is required.');
    });

    it('fails for invalid date', () => {
        const result = validateTimeEntry(2, new Date('invalid'));
        expect(result.valid).toBe(false);
    });

    it('fails for non-increment duration', () => {
        const result = validateTimeEntry(1.1, new Date(), { minIncrement : 0.25 });
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('increments of 0.25');
    });

    it('passes for 0.25 increment', () => {
        const result = validateTimeEntry(1.75, new Date(), { minIncrement : 0.25 });
        expect(result.valid).toBe(true);
    });
});

// ── buildCreatePayload ──────────────────────────────────────────────

describe('buildCreatePayload', () => {
    it('builds a minimal payload', () => {
        const payload = buildCreatePayload('res-001', new Date(2026, 5, 9), 2);
        expect(payload.msdyn_date).toBe('2026-06-09');
        expect(payload.msdyn_duration).toBe(120);
        expect(payload.msdyn_type).toBe(TimeEntryType.Work);
        expect(payload['msdyn_bookableresource@odata.bind']).toBe('/bookableresources(res-001)');
    });

    it('includes optional fields when provided', () => {
        const payload = buildCreatePayload('res-001', new Date(2026, 5, 9), 4, {
            description : 'Test desc',
            type        : TimeEntryType.Overtime,
            projectId   : 'proj-001',
            taskId      : 'task-001'
        });
        expect(payload.msdyn_description).toBe('Test desc');
        expect(payload.msdyn_type).toBe(TimeEntryType.Overtime);
        expect(payload['msdyn_project@odata.bind']).toBe('/msdyn_projects(proj-001)');
        expect(payload['msdyn_projectTask@odata.bind']).toBe('/msdyn_projecttasks(task-001)');
    });

    it('omits description when not provided', () => {
        const payload = buildCreatePayload('res-001', new Date(2026, 5, 9), 2);
        expect(payload.msdyn_description).toBeUndefined();
    });
});

// ── statusBadgeClass ────────────────────────────────────────────────

describe('statusBadgeClass', () => {
    it('returns "draft" for Draft', () => {
        expect(statusBadgeClass(TimeEntryStatus.Draft)).toBe('draft');
    });

    it('returns "submitted" for Submitted', () => {
        expect(statusBadgeClass(TimeEntryStatus.Submitted)).toBe('submitted');
    });

    it('returns "approved" for Approved', () => {
        expect(statusBadgeClass(TimeEntryStatus.Approved)).toBe('approved');
    });

    it('returns "returned" for Returned', () => {
        expect(statusBadgeClass(TimeEntryStatus.Returned)).toBe('returned');
    });

    it('returns "recall-requested" for RecallRequested', () => {
        expect(statusBadgeClass(TimeEntryStatus.RecallRequested)).toBe('recall-requested');
    });
});

// ── getEditableEntries / getSubmittableEntries ──────────────────────

describe('getEditableEntries', () => {
    it('returns only Draft and Returned entries', () => {
        const entries = [
            makeRow({ id : '1', status : TimeEntryStatus.Draft, isEditable : true }),
            makeRow({ id : '2', status : TimeEntryStatus.Submitted, isEditable : false }),
            makeRow({ id : '3', status : TimeEntryStatus.Returned, isEditable : true }),
            makeRow({ id : '4', status : TimeEntryStatus.Approved, isEditable : false })
        ];
        const editable = getEditableEntries(entries);
        expect(editable.map((e) => e.id)).toEqual(['1', '3']);
    });
});

describe('getSubmittableEntries', () => {
    it('returns only Draft entries', () => {
        const entries = [
            makeRow({ id : '1', status : TimeEntryStatus.Draft }),
            makeRow({ id : '2', status : TimeEntryStatus.Returned }),
            makeRow({ id : '3', status : TimeEntryStatus.Draft })
        ];
        const submittable = getSubmittableEntries(entries);
        expect(submittable.map((e) => e.id)).toEqual(['1', '3']);
    });
});
