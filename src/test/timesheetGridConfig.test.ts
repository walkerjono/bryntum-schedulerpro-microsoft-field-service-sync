import { describe, it, expect } from 'vitest';
import {
    buildTimesheetColumns,
    buildTimesheetToolbar,
    buildTimesheetGridConfig,
    formatWeekLabel
} from '../app/timesheetGridConfig';

const MONDAY = new Date('2026-06-08'); // Monday

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── buildTimesheetColumns ───────────────────────────────────────────

describe('buildTimesheetColumns', () => {
    it('returns 11 columns (Project + Task + 7 days + Total + Variation)', () => {
        const cols = buildTimesheetColumns(MONDAY);
        expect(cols).toHaveLength(11);
    });

    it('first two columns are Project and Task', () => {
        const cols = buildTimesheetColumns(MONDAY) as any[];
        expect(cols[0].field).toBe('projectName');
        expect(cols[0].text).toBe('Project');
        expect(cols[0].locked).toBe(true);

        expect(cols[1].field).toBe('taskName');
        expect(cols[1].text).toBe('Task');
        expect(cols[1].locked).toBe(true);
    });

    it('day columns have correct field names day0–day6', () => {
        const cols = buildTimesheetColumns(MONDAY) as any[];
        for (let d = 0; d < 7; d++) {
            expect(cols[2 + d].field).toBe(`day${d}`);
            expect(cols[2 + d].dayIndex).toBe(d);
        }
    });

    it('day column headers include short day name and date', () => {
        const cols = buildTimesheetColumns(MONDAY) as any[];
        // Monday = 08 Jun
        expect(cols[2].text).toContain('Mon');
        expect(cols[2].text).toContain('08');
        // Tuesday = 09 Jun
        expect(cols[3].text).toContain('Tue');
    });

    it('weekend columns have ts-weekend-col class', () => {
        const cols = buildTimesheetColumns(MONDAY) as any[];
        // Sat = index 7 (2+5), Sun = index 8 (2+6)
        expect(cols[7].cls).toBe('ts-weekend-col');
        expect(cols[8].cls).toBe('ts-weekend-col');
        // Weekday should not have the class
        expect(cols[2].cls).toBe('');
    });

    it('day columns have number editors with min/max', () => {
        const cols = buildTimesheetColumns(MONDAY) as any[];
        const editor = cols[2].editor;
        expect(editor.type).toBe('numberfield');
        expect(editor.min).toBe(0);
        expect(editor.max).toBe(24);
        expect(editor.step).toBe(0.25);
    });

    it('total column is read-only', () => {
        const cols = buildTimesheetColumns(MONDAY) as any[];
        const total = cols[9]; // index 9 = after 2+7
        expect(total.field).toBe('rowTotal');
        expect(total.readOnly).toBe(true);
    });

    it('variation column is read-only with no inline editor', () => {
        const cols = buildTimesheetColumns(MONDAY) as any[];
        const variation = cols[10]; // last column
        expect(variation.field).toBe('variationTime');
        expect(variation.readOnly).toBe(true);
        expect(variation.editor).toBe(false);
    });
});

// ── buildTimesheetToolbar ───────────────────────────────────────────

describe('buildTimesheetToolbar', () => {
    it('returns a toolbar-type config', () => {
        const toolbar = buildTimesheetToolbar() as any;
        expect(toolbar.type).toBe('toolbar');
    });

    it('has essential navigation buttons', () => {
        const toolbar = buildTimesheetToolbar() as any;
        const items = toolbar.items;
        expect(items.prevWeekButton).toBeDefined();
        expect(items.nextWeekButton).toBeDefined();
        expect(items.todayButton).toBeDefined();
        expect(items.backButton).toBeDefined();
    });

    it('has save and submit buttons', () => {
        const toolbar = buildTimesheetToolbar() as any;
        const items = toolbar.items;
        expect(items.saveButton).toBeDefined();
        expect(items.saveButton.icon).toContain('save');
        expect(items.submitButton).toBeDefined();
        expect(items.submitButton.icon).toContain('paper-plane');
    });

    it('has a filter text field', () => {
        const toolbar = buildTimesheetToolbar() as any;
        const filter = toolbar.items.filterField;
        expect(filter).toBeDefined();
        expect(filter.type).toBe('textfield');
        expect(filter.clearable).toBe(true);
    });

    it('has an addRowButton', () => {
        const toolbar = buildTimesheetToolbar() as any;
        expect(toolbar.items.addRowButton).toBeDefined();
        expect(toolbar.items.addRowButton.icon).toContain('plus');
    });

    it('has a recall button hidden by default', () => {
        const toolbar = buildTimesheetToolbar() as any;
        expect(toolbar.items.recallButton).toBeDefined();
        expect(toolbar.items.recallButton.hidden).toBe(true);
    });

    it('has a resource combo hidden by default', () => {
        const toolbar = buildTimesheetToolbar() as any;
        expect(toolbar.items.resourceCombo).toBeDefined();
        expect(toolbar.items.resourceCombo.hidden).toBe(true);
    });

    it('has status indicator and approver comments', () => {
        const toolbar = buildTimesheetToolbar() as any;
        expect(toolbar.items.statusIndicator).toBeDefined();
        expect(toolbar.items.approverComments).toBeDefined();
        expect(toolbar.items.approverComments.hidden).toBe(true);
    });
});

// ── buildTimesheetGridConfig ────────────────────────────────────────

describe('buildTimesheetGridConfig', () => {
    it('returns a config with columns and store', () => {
        const cfg = buildTimesheetGridConfig(MONDAY) as any;
        expect(cfg.columns).toBeDefined();
        expect(Array.isArray(cfg.columns)).toBe(true);
        expect(cfg.store).toBeDefined();
        expect(cfg.store.data).toEqual([]);
    });

    it('includes passed data in store', () => {
        const data = [{ id : 'row1', type : 'stdentry' }] as any;
        const cfg = buildTimesheetGridConfig(MONDAY, data) as any;
        expect(cfg.store.data).toBe(data);
    });

    it('enables cellEdit and disables sort/group', () => {
        const cfg = buildTimesheetGridConfig(MONDAY) as any;
        expect(cfg.features.cellEdit).toBeDefined();
        expect(cfg.features.sort).toBe(false);
        expect(cfg.features.group).toBe(false);
    });

    it('enables stripe feature', () => {
        const cfg = buildTimesheetGridConfig(MONDAY) as any;
        expect(cfg.features.stripe).toBe(true);
    });

    it('has a getRowClass function', () => {
        const cfg = buildTimesheetGridConfig(MONDAY) as any;
        expect(typeof cfg.getRowClass).toBe('function');
    });

    describe('getRowClass', () => {
        it('returns ts-row-totals for total rows', () => {
            const cfg = buildTimesheetGridConfig(MONDAY) as any;
            const cls = cfg.getRowClass({ record : { type : 'total' } });
            expect(cls).toContain('ts-row-totals');
        });

        it('returns ts-row-helptask for helptask rows', () => {
            const cfg = buildTimesheetGridConfig(MONDAY) as any;
            const cls = cfg.getRowClass({ record : { type : 'helptask' } });
            expect(cls).toContain('ts-row-helptask');
        });

        it('returns ts-row-dirty for dirty rows', () => {
            const cfg = buildTimesheetGridConfig(MONDAY) as any;
            const cls = cfg.getRowClass({ record : { dirty : true } });
            expect(cls).toContain('ts-row-dirty');
        });

        it('checks get("dirty") when dirty property is falsy', () => {
            const cfg = buildTimesheetGridConfig(MONDAY) as any;
            const cls = cfg.getRowClass({ record : { get : () => true } });
            expect(cls).toContain('ts-row-dirty');
        });

        it('returns empty string for a normal undirty row', () => {
            const cfg = buildTimesheetGridConfig(MONDAY) as any;
            const cls = cfg.getRowClass({ record : { type : 'stdentry', dirty : false } });
            expect(cls).toBe('');
        });

        it('combines multiple classes', () => {
            const cfg = buildTimesheetGridConfig(MONDAY) as any;
            // A total row that is somehow dirty
            const cls = cfg.getRowClass({ record : { type : 'total', dirty : true } });
            expect(cls).toContain('ts-row-totals');
            expect(cls).toContain('ts-row-dirty');
        });
    });

    it('uses cell selection mode', () => {
        const cfg = buildTimesheetGridConfig(MONDAY) as any;
        expect(cfg.selectionMode.cell).toBe(true);
        expect(cfg.selectionMode.row).toBe(false);
    });
});

// ── formatWeekLabel ─────────────────────────────────────────────────

describe('formatWeekLabel', () => {
    it('formats a week range', () => {
        const label = formatWeekLabel(MONDAY);
        // Should contain start date "08 Jun" and end date "14 Jun 2026"
        expect(label).toContain('08');
        expect(label).toContain('Jun');
        expect(label).toContain('14');
        expect(label).toContain('2026');
    });

    it('contains a dash separator', () => {
        const label = formatWeekLabel(MONDAY);
        expect(label).toContain('–');
    });
});
