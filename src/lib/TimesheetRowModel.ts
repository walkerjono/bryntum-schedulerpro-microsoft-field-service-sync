/**
 * Bryntum Model subclass for timesheet pivot rows.
 *
 * Each record represents one project/task row in the timesheet grid
 * with day0–day6 (Mon–Sun) hour fields and variation data.
 *
 * The Model is used with Bryntum Grid (via @bryntum/schedulerpro which
 * includes the full Grid API).
 */

import { Model, type ModelFieldConfig } from '@bryntum/schedulerpro';

/** Day field names generated for 0–6 (Mon–Sun). */
const dayFields : ModelFieldConfig[] = [];

for (let d = 0; d < 7; d++) {
    dayFields.push(
        { name : `day${d}`,         type : 'number',  defaultValue : 0 },
        { name : `day${d}Comment`,  type : 'string',  defaultValue : '' },
        { name : `day${d}EntryId`,  type : 'string',  defaultValue : null },
        { name : `day${d}ReadOnly`, type : 'boolean', defaultValue : false }
    );
}

/**
 * Model for a single pivot row in the timesheet grid.
 *
 * Static fields are merged with `dayFields` at class definition time.
 * Bryntum Grid cell-edit reads/writes these fields directly.
 */
export default class TimesheetRowModel extends Model {
    static $name = 'TimesheetRowModel';

    static fields : ModelFieldConfig[] = [
        // Identity
        { name : 'type',         type : 'string',  defaultValue : 'stdentry' },
        { name : 'projectId',    type : 'string',  defaultValue : '' },
        { name : 'projectName',  type : 'string',  defaultValue : '' },
        { name : 'taskId',       type : 'string',  defaultValue : null },
        { name : 'taskName',     type : 'string',  defaultValue : '' },
        { name : 'assignmentId', type : 'string',  defaultValue : null },

        // Row total (managed externally after each edit)
        { name : 'rowTotal',     type : 'number',  defaultValue : 0 },

        // Dirty flag
        { name : 'dirty',        type : 'boolean', defaultValue : false },

        // Day columns (day0–day6 with Comment, EntryId, ReadOnly)
        ...dayFields,

        // Variation fields
        { name : 'variationTime',     type : 'number',  defaultValue : 0 },
        { name : 'variationComment',  type : 'string',  defaultValue : '' },
        { name : 'variationEntryId',  type : 'string',  defaultValue : null },
        { name : 'variationReasonId', type : 'string',  defaultValue : null },
        { name : 'variationEndDate',  type : 'string',  defaultValue : null },
        { name : 'variationChanged',  type : 'boolean', defaultValue : false }
    ];

    // ── Convenience getters ─────────────────────────────────────────

    /** Row type discriminator. */
    get rowType() : string {
        return (this.get('type') as string) ?? 'stdentry';
    }

    /** Whether this row is the totals row. */
    get isTotalsRow() : boolean {
        return this.rowType === 'total';
    }

    /** Whether this is an internal project row (no variations). */
    get isInternalRow() : boolean {
        return this.rowType === 'intentry';
    }

    /** Project display name. */
    get project() : string {
        return (this.get('projectName') as string) ?? '';
    }

    /** Task display name. */
    get task() : string {
        return (this.get('taskName') as string) ?? '';
    }

    /**
     * Recompute and set `rowTotal` from day0–day6.
     * Call this after any day field edit.
     */
    recalculateTotal() : void {
        let total = 0;
        for (let d = 0; d < 7; d++) {
            total += (this.get(`day${d}`) as number) ?? 0;
        }
        this.set('rowTotal', total);
    }

    /**
     * Check if a specific day is read-only.
     */
    isDayReadOnly(dayIndex : number) : boolean {
        return (this.get(`day${dayIndex}ReadOnly`) as boolean) ?? false;
    }

    /**
     * Get the time entry ID for a specific day.
     */
    getDayEntryId(dayIndex : number) : string | null {
        return (this.get(`day${dayIndex}EntryId`) as string | null) ?? null;
    }

    /**
     * Get the comment for a specific day.
     */
    getDayComment(dayIndex : number) : string {
        return (this.get(`day${dayIndex}Comment`) as string) ?? '';
    }
}
