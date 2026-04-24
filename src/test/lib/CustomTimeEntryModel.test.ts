import { describe, it, expect } from 'vitest';
import CustomTimeEntryModel from '../../lib/CustomTimeEntryModel';
import type { D365TimeEntry } from '../../types/timesheet';
import { TimeEntryStatus, TimeEntryType } from '../../types/timesheet';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = any;

// ── Helper: simulate a raw D365 OData record ────────────────────────
function makeD365TimeEntry(overrides: Partial<D365TimeEntry> = {}): D365TimeEntry {
    return {
        msdyn_timeentryid                                                    : 'te-001',
        msdyn_date                                                           : '2026-06-09T00:00:00Z',
        msdyn_duration                                                       : 120,
        msdyn_description                                                    : 'Worked on feature X',
        msdyn_type                                                           : TimeEntryType.Work,
        msdyn_entrystatus                                                    : TimeEntryStatus.Draft,
        _msdyn_bookableresource_value                                        : 'res-001',
        _msdyn_project_value                                                 : 'proj-001',
        '_msdyn_project_value@OData.Community.Display.V1.FormattedValue'     : 'Project Alpha',
        _msdyn_projecttask_value                                             : 'task-001',
        '_msdyn_projecttask_value@OData.Community.Display.V1.FormattedValue' : 'Design Phase',
        _msdyn_resourcecategory_value                                        : 'assign-001',

        '@odata.etag'                                                        : 'W/\\"67890\\"',
        ...overrides
    };
}

describe('CustomTimeEntryModel', () => {
    // ── Basic field mapping ──────────────────────────────────────
    it('maps msdyn_timeentryid → id', () => {
        const m = new CustomTimeEntryModel(makeD365TimeEntry());
        expect(m.id).toBe('te-001');
    });

    it('maps msdyn_date → date as Date object', () => {
        const m = new CustomTimeEntryModel(makeD365TimeEntry()) as AnyRecord;
        expect(m.date).toBeInstanceOf(Date);
        expect(m.date.toISOString()).toBe('2026-06-09T00:00:00.000Z');
    });

    it('maps msdyn_duration → durationMinutes', () => {
        const m = new CustomTimeEntryModel(makeD365TimeEntry()) as AnyRecord;
        expect(m.durationMinutes).toBe(120);
    });

    it('computes durationHours from msdyn_duration', () => {
        const m = new CustomTimeEntryModel(makeD365TimeEntry()) as AnyRecord;
        expect(m.durationHours).toBe(2);
    });

    it('maps msdyn_description → description', () => {
        const m = new CustomTimeEntryModel(makeD365TimeEntry()) as AnyRecord;
        expect(m.description).toBe('Worked on feature X');
    });

    it('maps msdyn_type → type', () => {
        const m = new CustomTimeEntryModel(makeD365TimeEntry()) as AnyRecord;
        expect(m.type).toBe(TimeEntryType.Work);
    });

    it('maps msdyn_type → typeName label', () => {
        const m = new CustomTimeEntryModel(makeD365TimeEntry()) as AnyRecord;
        expect(m.typeName).toBe('Work');
    });

    it('maps msdyn_entrystatus → status', () => {
        const m = new CustomTimeEntryModel(makeD365TimeEntry()) as AnyRecord;
        expect(m.status).toBe(TimeEntryStatus.Draft);
    });

    it('maps msdyn_entrystatus → statusName label', () => {
        const m = new CustomTimeEntryModel(makeD365TimeEntry()) as AnyRecord;
        expect(m.statusName).toBe('Draft');
    });

    it('maps _msdyn_bookableresource_value → resourceId', () => {
        const m = new CustomTimeEntryModel(makeD365TimeEntry()) as AnyRecord;
        expect(m.resourceId).toBe('res-001');
    });

    it('maps _msdyn_project_value → projectId', () => {
        const m = new CustomTimeEntryModel(makeD365TimeEntry()) as AnyRecord;
        expect(m.projectId).toBe('proj-001');
    });

    it('maps formatted project name → projectName', () => {
        const m = new CustomTimeEntryModel(makeD365TimeEntry()) as AnyRecord;
        expect(m.projectName).toBe('Project Alpha');
    });

    it('maps _msdyn_projecttask_value → taskId', () => {
        const m = new CustomTimeEntryModel(makeD365TimeEntry()) as AnyRecord;
        expect(m.taskId).toBe('task-001');
    });

    it('maps formatted task name → taskName', () => {
        const m = new CustomTimeEntryModel(makeD365TimeEntry()) as AnyRecord;
        expect(m.taskName).toBe('Design Phase');
    });

    it('maps _msdyn_resourcecategory_value → assignmentId', () => {
        const m = new CustomTimeEntryModel(makeD365TimeEntry()) as AnyRecord;
        expect(m.assignmentId).toBe('assign-001');
    });

    it('maps @odata.etag → etag', () => {
        const m = new CustomTimeEntryModel(makeD365TimeEntry()) as AnyRecord;
        expect(m.etag).toBe('W/"67890"');
    });

    // ── isEditable ──────────────────────────────────────────────
    describe('isEditable', () => {
        it('is true for Draft status', () => {
            const m = new CustomTimeEntryModel(makeD365TimeEntry({ msdyn_entrystatus : TimeEntryStatus.Draft })) as AnyRecord;
            expect(m.isEditable).toBe(true);
        });

        it('is true for Returned status', () => {
            const m = new CustomTimeEntryModel(makeD365TimeEntry({ msdyn_entrystatus : TimeEntryStatus.Returned })) as AnyRecord;
            expect(m.isEditable).toBe(true);
        });

        it('is false for Submitted status', () => {
            const m = new CustomTimeEntryModel(makeD365TimeEntry({ msdyn_entrystatus : TimeEntryStatus.Submitted })) as AnyRecord;
            expect(m.isEditable).toBe(false);
        });

        it('is false for Approved status', () => {
            const m = new CustomTimeEntryModel(makeD365TimeEntry({ msdyn_entrystatus : TimeEntryStatus.Approved })) as AnyRecord;
            expect(m.isEditable).toBe(false);
        });
    });

    // ── Fallback behaviour ──────────────────────────────────────
    describe('fallback values', () => {
        it('defaults description to empty string when null', () => {
            const m = new CustomTimeEntryModel(makeD365TimeEntry({ msdyn_description : null })) as AnyRecord;
            expect(m.description).toBe('');
        });

        it('defaults durationMinutes to 0 when undefined', () => {
            const data = makeD365TimeEntry();
            delete (data as AnyRecord).msdyn_duration;
            const m = new CustomTimeEntryModel(data) as AnyRecord;
            expect(m.durationMinutes).toBe(0);
        });

        it('defaults projectId to null when missing', () => {
            const m = new CustomTimeEntryModel(makeD365TimeEntry({ _msdyn_project_value : null })) as AnyRecord;
            expect(m.projectId).toBeNull();
        });

        it('defaults projectName to empty string when annotation missing', () => {
            const data = makeD365TimeEntry();
            delete (data as AnyRecord)['_msdyn_project_value@OData.Community.Display.V1.FormattedValue'];
            const m = new CustomTimeEntryModel(data) as AnyRecord;
            expect(m.projectName).toBe('');
        });

        it('defaults type to Work when missing', () => {
            const data = makeD365TimeEntry();
            delete (data as AnyRecord).msdyn_type;
            const m = new CustomTimeEntryModel(data) as AnyRecord;
            expect(m.type).toBe(TimeEntryType.Work);
        });

        it('defaults status to Draft when missing', () => {
            const data = makeD365TimeEntry();
            delete (data as AnyRecord).msdyn_entrystatus;
            const m = new CustomTimeEntryModel(data) as AnyRecord;
            expect(m.status).toBe(TimeEntryStatus.Draft);
        });

        it('defaults etag to null when missing', () => {
            const data = makeD365TimeEntry();
            delete (data as AnyRecord)['@odata.etag'];
            const m = new CustomTimeEntryModel(data) as AnyRecord;
            expect(m.etag).toBeNull();
        });
    });

    // ── Type label mapping ──────────────────────────────────────
    describe('typeName labels', () => {
        it('shows "Vacation" for Vacation type', () => {
            const m = new CustomTimeEntryModel(makeD365TimeEntry({ msdyn_type : TimeEntryType.Vacation })) as AnyRecord;
            expect(m.typeName).toBe('Vacation');
        });

        it('shows "Overtime" for Overtime type', () => {
            const m = new CustomTimeEntryModel(makeD365TimeEntry({ msdyn_type : TimeEntryType.Overtime })) as AnyRecord;
            expect(m.typeName).toBe('Overtime');
        });

        it('shows "Travel" for Travel type', () => {
            const m = new CustomTimeEntryModel(makeD365TimeEntry({ msdyn_type : TimeEntryType.Travel })) as AnyRecord;
            expect(m.typeName).toBe('Travel');
        });
    });

    // ── Status label mapping ────────────────────────────────────
    describe('statusName labels', () => {
        it('shows "Submitted" for Submitted status', () => {
            const m = new CustomTimeEntryModel(makeD365TimeEntry({ msdyn_entrystatus : TimeEntryStatus.Submitted })) as AnyRecord;
            expect(m.statusName).toBe('Submitted');
        });

        it('shows "Approved" for Approved status', () => {
            const m = new CustomTimeEntryModel(makeD365TimeEntry({ msdyn_entrystatus : TimeEntryStatus.Approved })) as AnyRecord;
            expect(m.statusName).toBe('Approved');
        });

        it('shows "Recall Requested" for RecallRequested status', () => {
            const m = new CustomTimeEntryModel(makeD365TimeEntry({ msdyn_entrystatus : TimeEntryStatus.RecallRequested })) as AnyRecord;
            expect(m.statusName).toBe('Recall Requested');
        });
    });
});
