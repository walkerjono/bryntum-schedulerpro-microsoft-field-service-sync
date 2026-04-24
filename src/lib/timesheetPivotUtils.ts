/**
 * Pure utility functions to transform flat TimeEntryRow[] + D365Variation[]
 * into the pivoted grid data model (PivotRow[]) used by the timesheet view.
 *
 * All functions are stateless and side-effect-free.
 */

import type {
    TimeEntryRow,
    D365Variation,
    PivotRow,
    PivotRowType,
    DayEntry,
    VariationEntry
} from '../types/timesheet';
import { INTERNAL_ENTRY_TYPES } from '../types/timesheet';
import { getWeekDays, toISODateString } from './timesheetUtils';

// ── Helpers ─────────────────────────────────────────────────────────

/** Number of day columns (Mon–Sun). */
export const DAY_COUNT = 7;

/**
 * Generate a unique key for a project+task combination.
 */
export function getRowKey(projectId : string, taskId : string | null) : string {
    return taskId ? `${projectId}::${taskId}` : projectId;
}

/**
 * Create a blank DayEntry for a given day offset.
 */
export function makeDayEntry(dayOffset : number) : DayEntry {
    return {
        time       : 0,
        comment    : '',
        entryId    : null,
        changed    : false,
        readOnly   : false,
        dateOffset : dayOffset
    };
}

/**
 * Create a blank VariationEntry.
 */
export function makeVariationEntry() : VariationEntry {
    return {
        time     : 0,
        comment  : '',
        entryId  : null,
        reasonId : null,
        endDate  : null,
        changed  : false
    };
}

/**
 * Create a blank PivotRow for a given project/task.
 */
export function createEmptyPivotRow(
    projectId   : string,
    projectName : string,
    taskId      : string | null,
    taskName    : string,
    assignmentId : string | null,
    type        : PivotRowType = 'stdentry'
) : PivotRow {
    return {
        id      : getRowKey(projectId, taskId),
        type,
        projectId,
        projectName,
        taskId,
        taskName,
        assignmentId,
        entries : [
            makeDayEntry(0), makeDayEntry(1), makeDayEntry(2),
            makeDayEntry(3), makeDayEntry(4), makeDayEntry(5),
            makeDayEntry(6)
        ],
        variation       : makeVariationEntry(),
        variationRecord : null,
        dirty           : false
    };
}

// ── Build pivot rows ────────────────────────────────────────────────

/**
 * Build pivoted rows from flat time entries + variations.
 *
 * Groups entries by project+task, maps each to a Mon–Sun DayEntry[7],
 * and attaches the matching variation (if any) from the first time entry
 * in the group that has one.
 *
 * @param entries          Flat time entries for the week.
 * @param variations       Variation records linked to time entries.
 * @param weekStart        Monday of the target week.
 * @param internalProjectIds  Set of project IDs that are internal (no variations).
 */
export function buildPivotRows(
    entries            : TimeEntryRow[],
    variations         : D365Variation[],
    weekStart          : Date,
    internalProjectIds : Set<string> = new Set()
) : PivotRow[] {
    const weekDays = getWeekDays(weekStart);
    const dayKeys  = weekDays.map(toISODateString);

    // Index variations by project+task key (variations bind to task/project, not entries)
    const variationByKey = new Map<string, D365Variation>();
    for (const v of variations) {
        const vKey = getRowKey(v._ws_projectid_value ?? '', v._ws_taskid_value ?? null);
        variationByKey.set(vKey, v);
    }

    // Group entries by project+task
    const rowMap = new Map<string, PivotRow>();

    for (const entry of entries) {
        const pid = entry.projectId ?? '';
        const tid = entry.taskId ?? null;
        const key = getRowKey(pid, tid);

        let row = rowMap.get(key);
        if (!row) {
            const isInternal = internalProjectIds.has(pid) || INTERNAL_ENTRY_TYPES.has(entry.type);
            row = createEmptyPivotRow(
                pid,
                entry.projectName,
                tid,
                entry.taskName,
                entry.assignmentId,
                isInternal ? 'intentry' : 'stdentry'
            );
            rowMap.set(key, row);
        }

        // Find day index (0–6)
        const entryDateStr = toISODateString(entry.date);
        const dayIndex     = dayKeys.indexOf(entryDateStr);
        if (dayIndex < 0) continue; // Out of range

        // Populate the day entry
        const dayEntry = row.entries[dayIndex]!;
        dayEntry.time    = entry.durationHours;
        dayEntry.comment  = entry.description;
        dayEntry.entryId  = entry.id;
        dayEntry.readOnly = !entry.isEditable;

        // Attach variation if exists (matched by project+task key)
        const rowKey = getRowKey(pid, tid);
        const variation = variationByKey.get(rowKey);
        if (variation && row.type === 'stdentry') {
            row.variation = {
                time     : (variation.ws_remainingtime ?? 0) / 60,   // minutes → hours
                comment  : variation.ws_comment ?? '',
                entryId  : variation.ws_timesheetvariationid,
                reasonId : variation._ws_reasonid_value ?? null,
                endDate  : variation.ws_estimatedenddate ?? null,
                changed  : false
            };
            row.variationRecord = variation;
        }
    }

    return [...rowMap.values()];
}

// ── Build totals row ────────────────────────────────────────────────

/**
 * Create a "total" row that sums all day columns across rows.
 */
export function buildTotalsRow(rows : PivotRow[]) : PivotRow {
    const totals = createEmptyPivotRow('_total', 'Total', null, '', null, 'total');
    totals.id = '_total';

    for (const row of rows) {
        if (row.type === 'total') continue;
        for (let d = 0; d < DAY_COUNT; d++) {
            totals.entries[d]!.time += row.entries[d]!.time;
        }
        totals.variation.time += row.variation.time;
    }

    // Totals row is always read-only
    for (let d = 0; d < DAY_COUNT; d++) {
        totals.entries[d]!.readOnly = true;
    }

    return totals;
}

// ── Flatten / unflatten for Bryntum Store ───────────────────────────

/**
 * Shape of a flattened pivot record for Bryntum Grid Store.
 * Day fields are named `day0`..`day6` with auxiliary `day0Comment`, etc.
 */
export interface FlatPivotRecord {
    id              : string;
    type            : PivotRowType;
    projectId       : string;
    projectName     : string;
    taskId          : string | null;
    taskName        : string;
    assignmentId    : string | null;
    rowTotal        : number;
    dirty           : boolean;
    // Day fields (0–6 = Mon–Sun)
    day0            : number;
    day1            : number;
    day2            : number;
    day3            : number;
    day4            : number;
    day5            : number;
    day6            : number;
    day0Comment     : string;
    day1Comment     : string;
    day2Comment     : string;
    day3Comment     : string;
    day4Comment     : string;
    day5Comment     : string;
    day6Comment     : string;
    day0EntryId     : string | null;
    day1EntryId     : string | null;
    day2EntryId     : string | null;
    day3EntryId     : string | null;
    day4EntryId     : string | null;
    day5EntryId     : string | null;
    day6EntryId     : string | null;
    day0ReadOnly    : boolean;
    day1ReadOnly    : boolean;
    day2ReadOnly    : boolean;
    day3ReadOnly    : boolean;
    day4ReadOnly    : boolean;
    day5ReadOnly    : boolean;
    day6ReadOnly    : boolean;
    // Variation
    variationTime     : number;
    variationComment  : string;
    variationEntryId  : string | null;
    variationReasonId : string | null;
    variationEndDate  : string | null;
    variationChanged  : boolean;
}

/**
 * Convert a PivotRow to a flat record suitable for Bryntum Store.
 */
export function pivotRowToFlat(row : PivotRow) : FlatPivotRecord {
    const flat : FlatPivotRecord = {
        id                : row.id,
        type              : row.type,
        projectId         : row.projectId,
        projectName       : row.projectName,
        taskId            : row.taskId,
        taskName          : row.taskName,
        assignmentId      : row.assignmentId,
        rowTotal          : 0,
        dirty             : row.dirty,
        day0              : 0, day1              : 0, day2              : 0, day3              : 0, day4              : 0, day5              : 0, day6              : 0,
        day0Comment       : '', day1Comment       : '', day2Comment       : '', day3Comment       : '', day4Comment       : '', day5Comment       : '', day6Comment       : '',
        day0EntryId       : null, day1EntryId       : null, day2EntryId       : null, day3EntryId       : null, day4EntryId       : null, day5EntryId       : null, day6EntryId       : null,
        day0ReadOnly      : false, day1ReadOnly      : false, day2ReadOnly      : false, day3ReadOnly      : false, day4ReadOnly      : false, day5ReadOnly      : false, day6ReadOnly      : false,
        variationTime     : row.variation.time,
        variationComment  : row.variation.comment,
        variationEntryId  : row.variation.entryId,
        variationReasonId : row.variation.reasonId,
        variationEndDate  : row.variation.endDate,
        variationChanged  : row.variation.changed
    };

    let total = 0;
    for (let d = 0; d < DAY_COUNT; d++) {
        const e = row.entries[d]!;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rec = flat as any;
        rec[`day${d}`]         = e.time;
        rec[`day${d}Comment`]  = e.comment;
        rec[`day${d}EntryId`]  = e.entryId;
        rec[`day${d}ReadOnly`] = e.readOnly;
        total += e.time;
    }

    flat.rowTotal = total;
    return flat;
}

/**
 * Convert a flat Bryntum record back to a PivotRow.
 */
export function flatToPivotRow(flat : FlatPivotRecord) : PivotRow {
    const entries : PivotRow['entries'] = [
        makeDayEntry(0), makeDayEntry(1), makeDayEntry(2),
        makeDayEntry(3), makeDayEntry(4), makeDayEntry(5),
        makeDayEntry(6)
    ];

    for (let d = 0; d < DAY_COUNT; d++) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rec = flat as any;
        const de  = entries[d]!;
        de.time     = (rec[`day${d}`] as number) ?? 0;
        de.comment  = (rec[`day${d}Comment`] as string) ?? '';
        de.entryId  = (rec[`day${d}EntryId`] as string | null) ?? null;
        de.readOnly = (rec[`day${d}ReadOnly`] as boolean) ?? false;
    }

    return {
        id           : flat.id,
        type         : flat.type,
        projectId    : flat.projectId,
        projectName  : flat.projectName,
        taskId       : flat.taskId,
        taskName     : flat.taskName,
        assignmentId : flat.assignmentId,
        entries,
        variation    : {
            time     : flat.variationTime,
            comment  : flat.variationComment,
            entryId  : flat.variationEntryId,
            reasonId : flat.variationReasonId,
            endDate  : flat.variationEndDate,
            changed  : flat.variationChanged
        },
        variationRecord : null,
        dirty           : flat.dirty
    };
}

// ── Computation helpers ─────────────────────────────────────────────

/**
 * Compute the row total (sum of day0..day6).
 */
export function computeRowTotal(row : PivotRow) : number {
    let total = 0;
    for (let d = 0; d < DAY_COUNT; d++) {
        total += row.entries[d]!.time;
    }
    return total;
}

/**
 * Compute per-day totals across all rows (excludes the totals row itself).
 */
export function computeDayTotals(rows : PivotRow[]) : number[] {
    const totals = new Array<number>(DAY_COUNT).fill(0);
    for (const row of rows) {
        if (row.type === 'total') continue;
        for (let d = 0; d < DAY_COUNT; d++) {
            totals[d]! += row.entries[d]!.time;
        }
    }
    return totals;
}

/**
 * Compute the grand total across all rows and days.
 */
export function computeGrandTotal(rows : PivotRow[]) : number {
    return computeDayTotals(rows).reduce((s, v) => s + v, 0);
}

// ── Parse user time input ───────────────────────────────────────────

/**
 * Parse a user-entered time string into hours.
 * Supports decimal ("1.5"), colon ("1:30"), and plain integer ("2").
 * Returns null for invalid input.
 */
export function parseTimeInput(input : string) : number | null {
    const trimmed = input.trim();
    if (!trimmed) return null;

    // Try colon format (HH:MM)
    const colonMatch = /^(\d+):(\d{1,2})$/.exec(trimmed);
    if (colonMatch) {
        const hours   = parseInt(colonMatch[1]!, 10);
        const minutes = parseInt(colonMatch[2]!, 10);
        if (minutes >= 60) return null;
        return hours + minutes / 60;
    }

    // Try decimal / integer
    const num = parseFloat(trimmed);
    if (isNaN(num) || num < 0) return null;

    return num;
}

/**
 * Round a number to the nearest increment (e.g., 0.25).
 */
export function roundToIncrement(value : number, increment : number) : number {
    if (increment <= 0) return value;
    return Math.round(value / increment) * increment;
}

// ── Change detection ────────────────────────────────────────────────

/** Describes a single day-cell change for save operations. */
export interface DayCellChange {
    rowId       : string;
    projectId   : string;
    taskId      : string | null;
    assignmentId : string | null;
    dayOffset   : number;
    entryId     : string | null;
    oldTime     : number;
    newTime     : number;
    oldComment  : string;
    newComment  : string;
}

/** Describes a variation change for save operations. */
export interface VariationChange {
    rowId       : string;
    projectId   : string;
    entryId     : string | null;
    oldTime     : number;
    newTime     : number;
    oldComment  : string;
    newComment  : string;
    reasonId    : string | null;
    endDate     : string | null;
}

/** All changes detected between original and current pivot state. */
export interface PivotChanges {
    dayChanges       : DayCellChange[];
    variationChanges : VariationChange[];
    hasChanges       : boolean;
}

/**
 * Compare original pivot rows with current ones to find changes.
 * Only compares rows by matching IDs.
 */
export function diffPivotRows(
    original : PivotRow[],
    current  : PivotRow[]
) : PivotChanges {
    const dayChanges : DayCellChange[]  = [];
    const variationChanges : VariationChange[] = [];

    const origMap = new Map(original.map((r) => [r.id, r]));

    for (const curr of current) {
        if (curr.type === 'total') continue;

        const orig = origMap.get(curr.id);

        for (let d = 0; d < DAY_COUNT; d++) {
            const ce = curr.entries[d]!;
            const oe = orig?.entries[d];

            const timeChanged    = ce.time !== (oe?.time ?? 0);
            const commentChanged = ce.comment !== (oe?.comment ?? '');

            if (timeChanged || commentChanged) {
                dayChanges.push({
                    rowId        : curr.id,
                    projectId    : curr.projectId,
                    taskId       : curr.taskId,
                    assignmentId : curr.assignmentId,
                    dayOffset    : d,
                    entryId      : ce.entryId,
                    oldTime      : oe?.time ?? 0,
                    newTime      : ce.time,
                    oldComment   : oe?.comment ?? '',
                    newComment   : ce.comment
                });
            }
        }

        // Variation changes
        if (curr.type === 'stdentry') {
            const cv = curr.variation;
            const ov = orig?.variation;

            const vTimeChanged    = cv.time !== (ov?.time ?? 0);
            const vCommentChanged = cv.comment !== (ov?.comment ?? '');
            const vReasonChanged  = cv.reasonId !== (ov?.reasonId ?? null);

            if (vTimeChanged || vCommentChanged || vReasonChanged) {
                variationChanges.push({
                    rowId      : curr.id,
                    projectId  : curr.projectId,
                    entryId    : cv.entryId,
                    oldTime    : ov?.time ?? 0,
                    newTime    : cv.time,
                    oldComment : ov?.comment ?? '',
                    newComment : cv.comment,
                    reasonId   : cv.reasonId,
                    endDate    : cv.endDate
                });
            }
        }
    }

    // Detect newly added rows (in current but not in original)
    for (const curr of current) {
        if (curr.type === 'total') continue;
        if (!origMap.has(curr.id)) {
            for (let d = 0; d < DAY_COUNT; d++) {
                const ce = curr.entries[d]!;
                if (ce.time > 0 || ce.comment) {
                    dayChanges.push({
                        rowId        : curr.id,
                        projectId    : curr.projectId,
                        taskId       : curr.taskId,
                        assignmentId : curr.assignmentId,
                        dayOffset    : d,
                        entryId      : null,
                        oldTime      : 0,
                        newTime      : ce.time,
                        oldComment   : '',
                        newComment   : ce.comment
                    });
                }
            }
        }
    }

    return {
        dayChanges,
        variationChanges,
        hasChanges : dayChanges.length > 0 || variationChanges.length > 0
    };
}
