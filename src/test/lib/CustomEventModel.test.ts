import { describe, it, expect } from 'vitest';
import CustomEventModel from '../../lib/CustomEventModel';
import type { D365ResourceAssignment } from '../../types/d365';

// Bryntum models set field values as dynamic instance properties (via static `fields`).
// TS doesn't expose these on the class type, so we use a permissive record for access.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = any;

// ── Helper: simulate a raw D365 OData record ────────────────────────
function makeD365Record(overrides: Partial<D365ResourceAssignment> = {}): D365ResourceAssignment {
    return {
        msdyn_resourceassignmentid                                      : 'assign-001',
        msdyn_start                                                     : '2026-03-01T08:00:00Z',
        msdyn_finish                                                    : '2026-03-15T17:00:00Z',
        msdyn_effort                                                    : 40,
        _msdyn_bookableresourceid_value                                 : 'res-001',
        msdyn_name                                                      : 'Fallback Name',
        '_msdyn_taskid_value@OData.Community.Display.V1.FormattedValue' : 'Task Display Name',
        msdyn_projectid                                                 : {
            msdyn_subject                                                     : 'Project Alpha',
            ws_projectid                                                      : 'P-100',
            '_msdyn_customer_value@OData.Community.Display.V1.FormattedValue' : 'Acme Corp'
        },
        msdyn_taskid : {
            msdyn_effortremaining : 20,
            ws_projecttasknumber  : 'T-55'
        },
        '@odata.etag' : 'W/\\"12345\\"',
        ...overrides
    };
}

describe('CustomEventModel', () => {
    // ── Basic field mapping ──────────────────────────────────────
    it('maps msdyn_resourceassignmentid → id', () => {
        const m = new CustomEventModel(makeD365Record());
        expect(m.id).toBe('assign-001');
    });

    it('maps msdyn_start → startDate', () => {
        const m = new CustomEventModel(makeD365Record());
        expect(m.startDate).toBe('2026-03-01T08:00:00Z');
    });

    it('maps msdyn_finish → endDate', () => {
        const m = new CustomEventModel(makeD365Record());
        expect(m.endDate).toBe('2026-03-15T17:00:00Z');
    });

    it('maps msdyn_effort → effort', () => {
        const m = new CustomEventModel(makeD365Record());
        expect(m.effort).toBe(40);
    });

    it('maps _msdyn_bookableresourceid_value → resourceId', () => {
        const m = new CustomEventModel(makeD365Record());
        expect(m.resourceId).toBe('res-001');
    });

    it('sets manuallyScheduled to true by default', () => {
        const m = new CustomEventModel(makeD365Record());
        expect(m.manuallyScheduled).toBe(true);
    });

    it('sets durationUnit to "hour" by default', () => {
        const m = new CustomEventModel(makeD365Record());
        expect(m.durationUnit).toBe('hour');
    });

    // ── name convert fallback chain ─────────────────────────────
    describe('name field convert', () => {
        it('uses formatted task name when present', () => {
            const m = new CustomEventModel(makeD365Record());
            expect(m.name).toBe('Task Display Name');
        });

        it('falls back to msdyn_name when formatted name is absent', () => {
            const data = makeD365Record();
            delete (data as unknown as AnyRecord)['_msdyn_taskid_value@OData.Community.Display.V1.FormattedValue'];
            const m = new CustomEventModel(data);
            expect(m.name).toBe('Fallback Name');
        });

        it('falls back to "Unnamed Assignment" when all sources missing', () => {
            const data = makeD365Record();
            delete (data as unknown as AnyRecord)['_msdyn_taskid_value@OData.Community.Display.V1.FormattedValue'];
            delete (data as unknown as AnyRecord).msdyn_name;
            const m = new CustomEventModel(data);
            expect(m.name).toBe('Unnamed Assignment');
        });
    });

    // ── projectName convert fallback chain ───────────────────────
    describe('projectName field convert', () => {
        it('uses msdyn_subject from expanded project', () => {
            const m = new CustomEventModel(makeD365Record());
            expect((m as AnyRecord).projectName).toBe('Project Alpha');
        });

        it('falls back to formatted project value annotation', () => {
            const data = makeD365Record({ msdyn_projectid : {} as D365ResourceAssignment['msdyn_projectid'] });
            (data as unknown as AnyRecord)['_msdyn_projectid_value@OData.Community.Display.V1.FormattedValue'] = 'Annotated Project';
            const m = new CustomEventModel(data);
            expect((m as AnyRecord).projectName).toBe('Annotated Project');
        });

        it('returns empty string when all project sources missing', () => {
            const data = makeD365Record({ msdyn_projectid : {} as D365ResourceAssignment['msdyn_projectid'] });
            const m = new CustomEventModel(data);
            expect((m as AnyRecord).projectName).toBe('');
        });
    });

    // ── projectNumber convert ────────────────────────────────────
    describe('projectNumber field convert', () => {
        it('extracts ws_projectid from expanded project', () => {
            const m = new CustomEventModel(makeD365Record());
            expect((m as AnyRecord).projectNumber).toBe('P-100');
        });

        it('returns empty string when missing', () => {
            const data = makeD365Record({ msdyn_projectid : {} as D365ResourceAssignment['msdyn_projectid'] });
            const m = new CustomEventModel(data);
            expect((m as AnyRecord).projectNumber).toBe('');
        });
    });

    // ── clientName convert ───────────────────────────────────────
    describe('clientName field convert', () => {
        it('extracts formatted customer value', () => {
            const m = new CustomEventModel(makeD365Record());
            expect((m as AnyRecord).clientName).toBe('Acme Corp');
        });

        it('returns empty string when annotation missing', () => {
            const data = makeD365Record({ msdyn_projectid : {} as D365ResourceAssignment['msdyn_projectid'] });
            const m = new CustomEventModel(data);
            expect((m as AnyRecord).clientName).toBe('');
        });
    });

    // ── taskNumber convert ───────────────────────────────────────
    describe('taskNumber field convert', () => {
        it('extracts ws_projecttasknumber from task', () => {
            const m = new CustomEventModel(makeD365Record());
            expect((m as AnyRecord).taskNumber).toBe('T-55');
        });

        it('returns empty string when task is null', () => {
            const data = makeD365Record({ msdyn_taskid : null });
            const m = new CustomEventModel(data);
            expect((m as AnyRecord).taskNumber).toBe('');
        });
    });

    // ── effortRemaining convert ──────────────────────────────────
    describe('effortRemaining field convert', () => {
        it('extracts remaining effort from task', () => {
            const m = new CustomEventModel(makeD365Record());
            expect((m as AnyRecord).effortRemaining).toBe(20);
        });

        it('returns null when task is null', () => {
            const data = makeD365Record({ msdyn_taskid : null });
            const m = new CustomEventModel(data);
            expect((m as AnyRecord).effortRemaining).toBeNull();
        });

        it('preserves 0 as a valid remaining effort', () => {
            const data = makeD365Record({ msdyn_taskid : { msdyn_effortremaining : 0 } as D365ResourceAssignment['msdyn_taskid'] });
            const m = new CustomEventModel(data);
            expect((m as AnyRecord).effortRemaining).toBe(0);
        });
    });

    // ── etag convert ─────────────────────────────────────────────
    describe('etag field convert', () => {
        it('strips escaped quotes from etag', () => {
            const m = new CustomEventModel(makeD365Record());
            expect((m as AnyRecord).etag).toBe('W/"12345"');
        });

        it('returns null when @odata.etag is missing', () => {
            const data = makeD365Record();
            delete (data as unknown as AnyRecord)['@odata.etag'];
            const m = new CustomEventModel(data);
            expect((m as AnyRecord).etag).toBeNull();
        });
    });

    // ── originalStartDate ────────────────────────────────────────
    it('has originalStartDate field (undefined by default)', () => {
        const m = new CustomEventModel(makeD365Record());
        // originalStartDate has no dataSource and no defaultValue — should be undefined
        expect(m).toHaveProperty('originalStartDate');
    });

    it('declares originalStartDate with type "date" so string values are auto-converted', () => {
        const field = CustomEventModel.fields.find(
            (f) => typeof f === 'object' && f.name === 'originalStartDate'
        );
        expect(field).toBeDefined();
        expect((field as { type?: string }).type).toBe('date');
    });

    // ── originalEndDate ──────────────────────────────────────────
    it('has originalEndDate field (undefined by default)', () => {
        const m = new CustomEventModel(makeD365Record());
        // originalEndDate has no dataSource and no defaultValue — should be undefined
        expect(m).toHaveProperty('originalEndDate');
    });

    it('declares originalEndDate with type "date" so string values are auto-converted', () => {
        const field = CustomEventModel.fields.find(
            (f) => typeof f === 'object' && f.name === 'originalEndDate'
        );
        expect(field).toBeDefined();
        expect((field as { type?: string }).type).toBe('date');
    });
});
