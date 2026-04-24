import { describe, it, expect } from 'vitest';
import TimesheetRowModel from '../../lib/TimesheetRowModel';

// ── Construction & defaults ─────────────────────────────────────────

describe('TimesheetRowModel', () => {
    describe('defaults', () => {
        it('has default type "stdentry"', () => {
            const row = new TimesheetRowModel();
            expect(row.get('type')).toBe('stdentry');
        });

        it('defaults day fields to 0', () => {
            const row = new TimesheetRowModel();
            for (let d = 0; d < 7; d++) {
                expect(row.get(`day${d}`)).toBe(0);
            }
        });

        it('defaults rowTotal to 0', () => {
            const row = new TimesheetRowModel();
            expect(row.get('rowTotal')).toBe(0);
        });

        it('defaults variation fields', () => {
            const row = new TimesheetRowModel();
            expect(row.get('variationTime')).toBe(0);
            expect(row.get('variationComment')).toBe('');
            expect(row.get('variationEntryId')).toBeNull();
            expect(row.get('variationReasonId')).toBeNull();
        });

        it('defaults dirty to false', () => {
            const row = new TimesheetRowModel();
            expect(row.get('dirty')).toBe(false);
        });
    });

    describe('construction with data', () => {
        it('accepts initial data', () => {
            const row = new TimesheetRowModel({
                type        : 'intentry',
                projectId   : 'p1',
                projectName : 'Project Alpha',
                taskId      : 't1',
                taskName    : 'Task 1',
                day0        : 2,
                day1        : 3
            });
            expect(row.get('type')).toBe('intentry');
            expect(row.get('projectId')).toBe('p1');
            expect(row.get('day0')).toBe(2);
            expect(row.get('day1')).toBe(3);
            expect(row.get('day2')).toBe(0); // default
        });
    });

    // ── Getters ─────────────────────────────────────────────────────

    describe('rowType', () => {
        it('returns the type field', () => {
            const row = new TimesheetRowModel({ type : 'helptask' });
            expect(row.rowType).toBe('helptask');
        });

        it('defaults to stdentry', () => {
            const row = new TimesheetRowModel();
            expect(row.rowType).toBe('stdentry');
        });
    });

    describe('isTotalsRow', () => {
        it('returns true for total type', () => {
            const row = new TimesheetRowModel({ type : 'total' });
            expect(row.isTotalsRow).toBe(true);
        });

        it('returns false for non-total type', () => {
            const row = new TimesheetRowModel({ type : 'stdentry' });
            expect(row.isTotalsRow).toBe(false);
        });
    });

    describe('isInternalRow', () => {
        it('returns true for intentry type', () => {
            const row = new TimesheetRowModel({ type : 'intentry' });
            expect(row.isInternalRow).toBe(true);
        });

        it('returns false otherwise', () => {
            const row = new TimesheetRowModel({ type : 'stdentry' });
            expect(row.isInternalRow).toBe(false);
        });
    });

    describe('project / task', () => {
        it('returns project and task names', () => {
            const row = new TimesheetRowModel({ projectName : 'Alpha', taskName : 'Build' });
            expect(row.project).toBe('Alpha');
            expect(row.task).toBe('Build');
        });

        it('defaults to empty strings', () => {
            const row = new TimesheetRowModel();
            expect(row.project).toBe('');
            expect(row.task).toBe('');
        });
    });

    // ── recalculateTotal ────────────────────────────────────────────

    describe('recalculateTotal', () => {
        it('sums day0–day6 into rowTotal', () => {
            const row = new TimesheetRowModel({
                day0 : 1, day1 : 2, day2 : 3, day3 : 4, day4 : 5, day5 : 0, day6 : 0
            });
            row.recalculateTotal();
            expect(row.get('rowTotal')).toBe(15);
        });

        it('handles all zeros', () => {
            const row = new TimesheetRowModel();
            row.recalculateTotal();
            expect(row.get('rowTotal')).toBe(0);
        });

        it('recalculates after a day field change', () => {
            const row = new TimesheetRowModel({ day0 : 2 });
            row.recalculateTotal();
            expect(row.get('rowTotal')).toBe(2);

            row.set('day0', 5);
            row.recalculateTotal();
            expect(row.get('rowTotal')).toBe(5);
        });
    });

    // ── isDayReadOnly ───────────────────────────────────────────────

    describe('isDayReadOnly', () => {
        it('returns false by default', () => {
            const row = new TimesheetRowModel();
            expect(row.isDayReadOnly(0)).toBe(false);
            expect(row.isDayReadOnly(6)).toBe(false);
        });

        it('returns true when set', () => {
            const row = new TimesheetRowModel({ day3ReadOnly : true });
            expect(row.isDayReadOnly(3)).toBe(true);
            expect(row.isDayReadOnly(2)).toBe(false);
        });
    });

    // ── getDayEntryId ───────────────────────────────────────────────

    describe('getDayEntryId', () => {
        it('returns null by default', () => {
            const row = new TimesheetRowModel();
            expect(row.getDayEntryId(0)).toBeNull();
        });

        it('returns the entry ID when set', () => {
            const row = new TimesheetRowModel({ day2EntryId : 'te-123' });
            expect(row.getDayEntryId(2)).toBe('te-123');
        });
    });

    // ── getDayComment ───────────────────────────────────────────────

    describe('getDayComment', () => {
        it('returns empty string by default', () => {
            const row = new TimesheetRowModel();
            expect(row.getDayComment(0)).toBe('');
        });

        it('returns the comment when set', () => {
            const row = new TimesheetRowModel({ day4Comment : 'Worked late' });
            expect(row.getDayComment(4)).toBe('Worked late');
        });
    });

    // ── set method ──────────────────────────────────────────────────

    describe('set', () => {
        it('updates a single field', () => {
            const row = new TimesheetRowModel();
            row.set('day0', 8);
            expect(row.get('day0')).toBe(8);
        });

        it('updates multiple fields via object', () => {
            const row = new TimesheetRowModel();
            row.set({ day0 : 3, day1 : 4, dirty : true });
            expect(row.get('day0')).toBe(3);
            expect(row.get('day1')).toBe(4);
            expect(row.get('dirty')).toBe(true);
        });
    });
});
