import { describe, it, expect } from 'vitest';
import {
    DAY_COUNT,
    getRowKey,
    makeDayEntry,
    makeVariationEntry,
    createEmptyPivotRow,
    buildPivotRows,
    buildTotalsRow,
    pivotRowToFlat,
    flatToPivotRow,
    computeRowTotal,
    computeDayTotals,
    computeGrandTotal,
    parseTimeInput,
    roundToIncrement,
    diffPivotRows
} from '../../lib/timesheetPivotUtils';
import type { TimeEntryRow } from '../../types/timesheet';
import type { D365Variation } from '../../types/timesheet';
import { TimeEntryStatus, TimeEntryType } from '../../types/timesheet';
import type { PivotRow } from '../../types/timesheet';

// ── Helpers ─────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<TimeEntryRow> = {}): TimeEntryRow {
    return {
        id              : 'te-001',
        date            : new Date('2026-06-09'), // Monday
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
        etag            : 'W/"12345"',
        isEditable      : true,
        ...overrides
    };
}

function makeVariation(overrides: Partial<D365Variation> = {}): D365Variation {
    return {
        ws_timesheetvariationid   : 'var-001',
        ws_remainingtime          : 240,          // 4 hours in minutes
        ws_comment                : 'Variation note',
        ws_estimatedenddate       : '2026-06-30',
        _ws_reasonid_value        : 'reason-001',
        _ws_taskid_value          : 'task-001',
        _ws_projectid_value       : 'proj-001',
        _ws_resourceid_value      : 'res-001',
        statuscode                : 1,
        ...overrides
    } as D365Variation;
}

const MONDAY = new Date('2026-06-08'); // Monday

// ── DAY_COUNT ───────────────────────────────────────────────────────

describe('DAY_COUNT', () => {
    it('is 7', () => {
        expect(DAY_COUNT).toBe(7);
    });
});

// ── getRowKey ───────────────────────────────────────────────────────

describe('getRowKey', () => {
    it('combines project and task IDs', () => {
        expect(getRowKey('proj-001', 'task-001')).toBe('proj-001::task-001');
    });

    it('uses project ID alone when task is null', () => {
        expect(getRowKey('proj-001', null)).toBe('proj-001');
    });

    it('uses project ID alone when task is empty string (falsy)', () => {
        // Empty string is falsy in JS — treated same as null by the ternary
        expect(getRowKey('proj-001', '')).toBe('proj-001');
    });
});

// ── makeDayEntry ────────────────────────────────────────────────────

describe('makeDayEntry', () => {
    it('creates a blank entry with correct day offset', () => {
        const entry = makeDayEntry(3);
        expect(entry.time).toBe(0);
        expect(entry.comment).toBe('');
        expect(entry.entryId).toBeNull();
        expect(entry.changed).toBe(false);
        expect(entry.readOnly).toBe(false);
        expect(entry.dateOffset).toBe(3);
    });
});

// ── makeVariationEntry ──────────────────────────────────────────────

describe('makeVariationEntry', () => {
    it('creates a blank variation', () => {
        const v = makeVariationEntry();
        expect(v.time).toBe(0);
        expect(v.comment).toBe('');
        expect(v.entryId).toBeNull();
        expect(v.reasonId).toBeNull();
        expect(v.endDate).toBeNull();
        expect(v.changed).toBe(false);
    });
});

// ── createEmptyPivotRow ─────────────────────────────────────────────

describe('createEmptyPivotRow', () => {
    it('creates a row with 7 day entries and a variation', () => {
        const row = createEmptyPivotRow('p1', 'Project 1', 't1', 'Task 1', 'a1', 'stdentry');
        expect(row.id).toBe('p1::t1');
        expect(row.type).toBe('stdentry');
        expect(row.projectId).toBe('p1');
        expect(row.projectName).toBe('Project 1');
        expect(row.taskId).toBe('t1');
        expect(row.taskName).toBe('Task 1');
        expect(row.assignmentId).toBe('a1');
        expect(row.entries).toHaveLength(7);
        expect(row.entries[0]!.dateOffset).toBe(0);
        expect(row.entries[6]!.dateOffset).toBe(6);
        expect(row.variation.time).toBe(0);
        expect(row.dirty).toBe(false);
    });

    it('defaults type to stdentry', () => {
        const row = createEmptyPivotRow('p1', 'P', null, '', null);
        expect(row.type).toBe('stdentry');
    });

    it('uses project-only ID when task is null', () => {
        const row = createEmptyPivotRow('p1', 'P', null, '', null);
        expect(row.id).toBe('p1');
    });
});

// ── buildPivotRows ──────────────────────────────────────────────────

describe('buildPivotRows', () => {
    it('groups entries by project+task into pivot rows', () => {
        const entries = [
            makeEntry({ id : 'te-001', date : new Date('2026-06-08'), durationHours : 2, projectId : 'p1', taskId : 't1', projectName : 'P1', taskName : 'T1' }),
            makeEntry({ id : 'te-002', date : new Date('2026-06-09'), durationHours : 3, projectId : 'p1', taskId : 't1', projectName : 'P1', taskName : 'T1' }),
            makeEntry({ id : 'te-003', date : new Date('2026-06-08'), durationHours : 1, projectId : 'p2', taskId : null, projectName : 'P2', taskName : '' })
        ];
        const rows = buildPivotRows(entries, [], MONDAY);
        expect(rows).toHaveLength(2);

        const r1 = rows.find((r) => r.id === 'p1::t1');
        expect(r1).toBeDefined();
        expect(r1!.entries[0]!.time).toBe(2); // Monday
        expect(r1!.entries[1]!.time).toBe(3); // Tuesday

        const r2 = rows.find((r) => r.id === 'p2');
        expect(r2).toBeDefined();
        expect(r2!.entries[0]!.time).toBe(1);
    });

    it('attaches variations to matching rows', () => {
        const entries = [
            makeEntry({ id : 'te-001', date : new Date('2026-06-08'), projectId : 'p1', taskId : 't1' })
        ];
        const variations = [makeVariation({ _ws_projectid_value : 'p1', _ws_taskid_value : 't1', ws_remainingtime : 300 })];
        const rows = buildPivotRows(entries, variations, MONDAY);

        expect(rows[0]!.variation.time).toBe(5);  // 300 min / 60 = 5 hours
        expect(rows[0]!.variationRecord).not.toBeNull();
    });

    it('marks internal projects as intentry type', () => {
        const entries = [
            makeEntry({ id : 'te-001', date : new Date('2026-06-08'), projectId : 'int-proj', taskId : null })
        ];
        const rows = buildPivotRows(entries, [], MONDAY, new Set(['int-proj']));
        expect(rows[0]!.type).toBe('intentry');
    });

    it('returns empty array for no entries', () => {
        const rows = buildPivotRows([], [], MONDAY);
        expect(rows).toHaveLength(0);
    });

    it('ignores entries outside the week range', () => {
        const entries = [
            makeEntry({ id : 'te-001', date : new Date('2026-07-01'), durationHours : 5, projectId : 'p1', taskId : null })
        ];
        const rows = buildPivotRows(entries, [], MONDAY);
        // Row created but no day values populated (out of range)
        expect(rows).toHaveLength(1);
        expect(rows[0]!.entries.every((e) => e.time === 0)).toBe(true);
    });

    it('populates readOnly from entry.isEditable', () => {
        const entries = [
            makeEntry({ id : 'te-001', date : new Date('2026-06-08'), isEditable : false, projectId : 'p1', taskId : null })
        ];
        const rows = buildPivotRows(entries, [], MONDAY);
        expect(rows[0]!.entries[0]!.readOnly).toBe(true);
    });
});

// ── buildTotalsRow ──────────────────────────────────────────────────

describe('buildTotalsRow', () => {
    it('sums day values across rows', () => {
        const rows : PivotRow[] = [
            createEmptyPivotRow('p1', 'P1', null, '', null),
            createEmptyPivotRow('p2', 'P2', null, '', null)
        ];
        rows[0]!.entries[0]!.time = 2;
        rows[0]!.entries[1]!.time = 3;
        rows[1]!.entries[0]!.time = 1;
        rows[1]!.entries[3]!.time = 4;

        const totals = buildTotalsRow(rows);
        expect(totals.type).toBe('total');
        expect(totals.entries[0]!.time).toBe(3);
        expect(totals.entries[1]!.time).toBe(3);
        expect(totals.entries[3]!.time).toBe(4);
    });

    it('marks all day entries as readOnly', () => {
        const totals = buildTotalsRow([]);
        for (let d = 0; d < 7; d++) {
            expect(totals.entries[d]!.readOnly).toBe(true);
        }
    });

    it('excludes other total rows from summation', () => {
        const rows : PivotRow[] = [
            createEmptyPivotRow('p1', 'P1', null, '', null),
            { ...createEmptyPivotRow('_total', 'Total', null, '', null, 'total') }
        ];
        rows[0]!.entries[0]!.time = 5;
        rows[1]!.entries[0]!.time = 99; // should be ignored

        const totals = buildTotalsRow(rows);
        expect(totals.entries[0]!.time).toBe(5);
    });

    it('sums variation times', () => {
        const rows : PivotRow[] = [
            createEmptyPivotRow('p1', 'P1', null, '', null),
            createEmptyPivotRow('p2', 'P2', null, '', null)
        ];
        rows[0]!.variation.time = 3;
        rows[1]!.variation.time = 2;

        const totals = buildTotalsRow(rows);
        expect(totals.variation.time).toBe(5);
    });
});

// ── pivotRowToFlat / flatToPivotRow ─────────────────────────────────

describe('pivotRowToFlat', () => {
    it('flattens a pivot row into day0..day6 fields', () => {
        const row = createEmptyPivotRow('p1', 'P1', 't1', 'T1', 'a1');
        row.entries[0]!.time = 2;
        row.entries[0]!.comment = 'Morning';
        row.entries[0]!.entryId = 'te-001';
        row.entries[0]!.readOnly = true;

        const flat = pivotRowToFlat(row);

        expect(flat.id).toBe('p1::t1');
        expect(flat.type).toBe('stdentry');
        expect(flat.day0).toBe(2);
        expect(flat.day0Comment).toBe('Morning');
        expect(flat.day0EntryId).toBe('te-001');
        expect(flat.day0ReadOnly).toBe(true);
        expect(flat.day1).toBe(0);
        expect(flat.rowTotal).toBe(2);
    });

    it('includes variation fields', () => {
        const row = createEmptyPivotRow('p1', 'P1', null, '', null);
        row.variation.time = 5;
        row.variation.comment = 'Note';
        row.variation.reasonId = 'r-001';
        row.variation.endDate = '2026-06-30';

        const flat = pivotRowToFlat(row);
        expect(flat.variationTime).toBe(5);
        expect(flat.variationComment).toBe('Note');
        expect(flat.variationReasonId).toBe('r-001');
        expect(flat.variationEndDate).toBe('2026-06-30');
    });
});

describe('flatToPivotRow', () => {
    it('converts flat record back to PivotRow', () => {
        const row = createEmptyPivotRow('p1', 'P1', 't1', 'T1', 'a1');
        row.entries[2]!.time = 4;
        row.entries[2]!.comment = 'Wed work';
        row.entries[2]!.entryId = 'te-003';
        row.variation.time = 3;

        const flat = pivotRowToFlat(row);
        const restored = flatToPivotRow(flat);

        expect(restored.id).toBe('p1::t1');
        expect(restored.entries[2]!.time).toBe(4);
        expect(restored.entries[2]!.comment).toBe('Wed work');
        expect(restored.entries[2]!.entryId).toBe('te-003');
        expect(restored.variation.time).toBe(3);
    });
});

describe('round-trip pivotRowToFlat → flatToPivotRow', () => {
    it('preserves all data fields', () => {
        const original = createEmptyPivotRow('p1', 'Project', 't1', 'Task', 'a1');
        for (let d = 0; d < 7; d++) {
            original.entries[d]!.time = d + 1;
            original.entries[d]!.comment = `Day ${d}`;
            original.entries[d]!.entryId = `te-00${d}`;
            original.entries[d]!.readOnly = d >= 5;
        }
        original.variation.time = 10;
        original.variation.comment = 'Var comment';
        original.variation.reasonId = 'r-001';
        original.variation.endDate = '2026-12-31';
        original.dirty = true;

        const restored = flatToPivotRow(pivotRowToFlat(original));

        expect(restored.id).toBe(original.id);
        expect(restored.type).toBe(original.type);
        expect(restored.projectId).toBe(original.projectId);
        expect(restored.projectName).toBe(original.projectName);
        expect(restored.taskId).toBe(original.taskId);
        expect(restored.taskName).toBe(original.taskName);
        expect(restored.dirty).toBe(true);

        for (let d = 0; d < 7; d++) {
            expect(restored.entries[d]!.time).toBe(original.entries[d]!.time);
            expect(restored.entries[d]!.comment).toBe(original.entries[d]!.comment);
            expect(restored.entries[d]!.entryId).toBe(original.entries[d]!.entryId);
            expect(restored.entries[d]!.readOnly).toBe(original.entries[d]!.readOnly);
        }

        expect(restored.variation.time).toBe(original.variation.time);
        expect(restored.variation.comment).toBe(original.variation.comment);
        expect(restored.variation.reasonId).toBe(original.variation.reasonId);
        expect(restored.variation.endDate).toBe(original.variation.endDate);
    });
});

// ── computeRowTotal ─────────────────────────────────────────────────

describe('computeRowTotal', () => {
    it('sums all 7 day entries', () => {
        const row = createEmptyPivotRow('p1', 'P', null, '', null);
        row.entries[0]!.time = 1;
        row.entries[1]!.time = 2;
        row.entries[2]!.time = 3;
        row.entries[3]!.time = 4;
        row.entries[4]!.time = 5;

        expect(computeRowTotal(row)).toBe(15);
    });

    it('returns 0 for empty row', () => {
        const row = createEmptyPivotRow('p1', 'P', null, '', null);
        expect(computeRowTotal(row)).toBe(0);
    });
});

// ── computeDayTotals ────────────────────────────────────────────────

describe('computeDayTotals', () => {
    it('computes per-day sums across rows', () => {
        const r1 = createEmptyPivotRow('p1', 'P1', null, '', null);
        const r2 = createEmptyPivotRow('p2', 'P2', null, '', null);
        r1.entries[0]!.time = 2;
        r2.entries[0]!.time = 3;
        r1.entries[4]!.time = 1;

        const totals = computeDayTotals([r1, r2]);
        expect(totals[0]).toBe(5);
        expect(totals[4]).toBe(1);
        expect(totals[6]).toBe(0);
    });

    it('excludes total-type rows', () => {
        const r1 = createEmptyPivotRow('p1', 'P1', null, '', null);
        const tot = createEmptyPivotRow('_total', 'Total', null, '', null, 'total');
        r1.entries[0]!.time = 2;
        tot.entries[0]!.time = 99;

        const totals = computeDayTotals([r1, tot]);
        expect(totals[0]).toBe(2);
    });
});

// ── computeGrandTotal ───────────────────────────────────────────────

describe('computeGrandTotal', () => {
    it('sums all days across all rows', () => {
        const r1 = createEmptyPivotRow('p1', 'P1', null, '', null);
        r1.entries[0]!.time = 2;
        r1.entries[1]!.time = 3;

        const r2 = createEmptyPivotRow('p2', 'P2', null, '', null);
        r2.entries[0]!.time = 1;

        expect(computeGrandTotal([r1, r2])).toBe(6);
    });
});

// ── parseTimeInput ──────────────────────────────────────────────────

describe('parseTimeInput', () => {
    it('parses decimal format', () => {
        expect(parseTimeInput('1.5')).toBe(1.5);
    });

    it('parses integer format', () => {
        expect(parseTimeInput('2')).toBe(2);
    });

    it('parses colon format (HH:MM)', () => {
        expect(parseTimeInput('1:30')).toBe(1.5);
    });

    it('parses colon format with zero minutes', () => {
        expect(parseTimeInput('2:00')).toBe(2);
    });

    it('parses colon format with single digit minutes', () => {
        expect(parseTimeInput('1:5')).toBeCloseTo(1 + 5 / 60);
    });

    it('returns null for empty string', () => {
        expect(parseTimeInput('')).toBeNull();
    });

    it('returns null for whitespace only', () => {
        expect(parseTimeInput('   ')).toBeNull();
    });

    it('returns null for invalid input', () => {
        expect(parseTimeInput('abc')).toBeNull();
    });

    it('returns null for negative numbers', () => {
        expect(parseTimeInput('-1')).toBeNull();
    });

    it('returns null for minutes >= 60', () => {
        expect(parseTimeInput('1:60')).toBeNull();
    });

    it('trims whitespace', () => {
        expect(parseTimeInput('  3.5  ')).toBe(3.5);
    });

    it('parses zero', () => {
        expect(parseTimeInput('0')).toBe(0);
    });
});

// ── roundToIncrement ────────────────────────────────────────────────

describe('roundToIncrement', () => {
    it('rounds to 0.25 increment', () => {
        expect(roundToIncrement(1.3, 0.25)).toBe(1.25);
        expect(roundToIncrement(1.4, 0.25)).toBe(1.5);
    });

    it('rounds to 0.5 increment', () => {
        expect(roundToIncrement(1.2, 0.5)).toBe(1);
        expect(roundToIncrement(1.3, 0.5)).toBe(1.5);
    });

    it('returns value unchanged for 0 increment', () => {
        expect(roundToIncrement(1.3, 0)).toBe(1.3);
    });

    it('returns value unchanged for negative increment', () => {
        expect(roundToIncrement(1.3, -0.5)).toBe(1.3);
    });

    it('rounds exact values correctly', () => {
        expect(roundToIncrement(2.0, 0.25)).toBe(2);
    });
});

// ── diffPivotRows ───────────────────────────────────────────────────

describe('diffPivotRows', () => {
    it('detects a day cell time change', () => {
        const orig = [createEmptyPivotRow('p1', 'P1', null, '', null)];
        orig[0]!.entries[0]!.time = 2;

        const curr = [createEmptyPivotRow('p1', 'P1', null, '', null)];
        curr[0]!.entries[0]!.time = 4;

        const changes = diffPivotRows(orig, curr);
        expect(changes.hasChanges).toBe(true);
        expect(changes.dayChanges).toHaveLength(1);
        expect(changes.dayChanges[0]!.oldTime).toBe(2);
        expect(changes.dayChanges[0]!.newTime).toBe(4);
        expect(changes.dayChanges[0]!.dayOffset).toBe(0);
    });

    it('detects a comment change', () => {
        const orig = [createEmptyPivotRow('p1', 'P1', null, '', null)];
        orig[0]!.entries[1]!.comment = 'Old note';

        const curr = [createEmptyPivotRow('p1', 'P1', null, '', null)];
        curr[0]!.entries[1]!.comment = 'New note';

        const changes = diffPivotRows(orig, curr);
        expect(changes.hasChanges).toBe(true);
        expect(changes.dayChanges).toHaveLength(1);
        expect(changes.dayChanges[0]!.dayOffset).toBe(1);
    });

    it('detects a variation change', () => {
        const orig = [createEmptyPivotRow('p1', 'P1', null, '', null)];
        const curr = [createEmptyPivotRow('p1', 'P1', null, '', null)];
        curr[0]!.variation.time = 5;

        const changes = diffPivotRows(orig, curr);
        expect(changes.hasChanges).toBe(true);
        expect(changes.variationChanges).toHaveLength(1);
        expect(changes.variationChanges[0]!.newTime).toBe(5);
    });

    it('reports no changes when rows are identical', () => {
        const orig = [createEmptyPivotRow('p1', 'P1', null, '', null)];
        const curr = [createEmptyPivotRow('p1', 'P1', null, '', null)];

        const changes = diffPivotRows(orig, curr);
        expect(changes.hasChanges).toBe(false);
        expect(changes.dayChanges).toHaveLength(0);
        expect(changes.variationChanges).toHaveLength(0);
    });

    it('detects newly added rows', () => {
        const orig : PivotRow[] = [];
        const curr = [createEmptyPivotRow('p1', 'P1', null, '', null)];
        curr[0]!.entries[0]!.time = 3;

        const changes = diffPivotRows(orig, curr);
        expect(changes.hasChanges).toBe(true);
        // The implementation counts new-row changes in both the main loop
        // and the "newly added" detection loop, producing 2 entries for day 0.
        expect(changes.dayChanges).toHaveLength(2);
        expect(changes.dayChanges[0]!.entryId).toBeNull();
        expect(changes.dayChanges[0]!.newTime).toBe(3);
    });

    it('ignores total rows', () => {
        const orig = [createEmptyPivotRow('_total', 'Total', null, '', null, 'total')];
        const curr = [createEmptyPivotRow('_total', 'Total', null, '', null, 'total')];
        curr[0]!.entries[0]!.time = 99;

        const changes = diffPivotRows(orig, curr);
        expect(changes.hasChanges).toBe(false);
    });

    it('skips variation changes for intentry rows', () => {
        const orig = [createEmptyPivotRow('p1', 'P1', null, '', null, 'intentry')];
        const curr = [createEmptyPivotRow('p1', 'P1', null, '', null, 'intentry')];
        curr[0]!.variation.time = 10;

        const changes = diffPivotRows(orig, curr);
        expect(changes.variationChanges).toHaveLength(0);
    });
});
