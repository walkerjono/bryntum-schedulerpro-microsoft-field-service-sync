/**
 * Pure utility functions for the timesheet feature.
 *
 * All functions are stateless and side-effect-free so they can be
 * unit-tested easily (following the schedulingUtils.ts pattern).
 */

import type {
    D365TimeEntry,
    TimeEntryRow,
    WeeklySummary,
    DayHoursMap,
    CreateTimeEntryPayload
} from '../types/timesheet';
import {
    TimeEntryStatus,
    TimeEntryType,
    TIME_ENTRY_STATUS_LABELS,
    TIME_ENTRY_TYPE_LABELS
} from '../types/timesheet';

// ── Mapping D365 → UI rows ──────────────────────────────────────────

/**
 * Convert a raw D365 OData time entry to a flat UI row.
 */
export function toTimeEntryRow(raw: D365TimeEntry): TimeEntryRow {
    const status = raw.msdyn_entrystatus ?? TimeEntryStatus.Draft;
    const type   = raw.msdyn_type ?? TimeEntryType.Work;
    const durationMinutes = raw.msdyn_duration ?? 0;

    return {
        id            : raw.msdyn_timeentryid,
        date          : new Date(raw.msdyn_date),
        durationMinutes,
        durationHours : durationMinutes / 60,
        description   : raw.msdyn_description ?? '',
        type          : type as TimeEntryType,
        typeName      : TIME_ENTRY_TYPE_LABELS[type] ?? 'Work',
        status        : status as TimeEntryStatus,
        statusName    : TIME_ENTRY_STATUS_LABELS[status] ?? 'Draft',
        resourceId    : raw._msdyn_bookableresource_value,
        projectId     : raw._msdyn_project_value ?? null,
        projectName   : raw['_msdyn_project_value@OData.Community.Display.V1.FormattedValue'] ?? '',
        taskId        : raw._msdyn_projecttask_value ?? null,
        taskName      : raw['_msdyn_projecttask_value@OData.Community.Display.V1.FormattedValue'] ?? '',
        assignmentId  : null,
        etag          : raw['@odata.etag'] ?? null,
        isEditable    : status === TimeEntryStatus.Draft || status === TimeEntryStatus.Returned
    };
}

/**
 * Convert an array of raw D365 records to TimeEntryRow[].
 */
export function resolveTimeEntries(rawRecords: D365TimeEntry[]): TimeEntryRow[] {
    return rawRecords.map(toTimeEntryRow);
}

// ── Week helpers ─────────────────────────────────────────────────────

/**
 * Get the Monday at the start of the week containing `date`.
 */
export function getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    // Sunday = 0, so shift: Sun→-6, Mon→0, Tue→-1, …, Sat→-5
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

/**
 * Get the Sunday at the end of the week containing `date`.
 */
export function getWeekEnd(date: Date): Date {
    const monday = getWeekStart(date);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return sunday;
}

/**
 * Generate an array of 7 Date objects (Mon → Sun) for the week
 * containing `date`.
 */
export function getWeekDays(date: Date): Date[] {
    const monday = getWeekStart(date);
    return Array.from({ length : 7 }, (_, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        return d;
    });
}

/**
 * Format a Date as ISO date string (YYYY-MM-DD) using **local** date parts,
 * avoiding UTC-shift issues from `Date.toISOString()`.
 */
export function toISODateString(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// ── Aggregation ──────────────────────────────────────────────────────

/**
 * Aggregate time entries into a per-day hours map for a given week.
 * Keys are ISO date strings (YYYY-MM-DD), values are total hours.
 */
export function aggregateDayHours(entries: TimeEntryRow[], weekStart: Date): DayHoursMap {
    const days = getWeekDays(weekStart);
    const map: DayHoursMap = {};

    // Seed all 7 days with 0
    for (const day of days) {
        map[toISODateString(day)] = 0;
    }

    for (const entry of entries) {
        const key = toISODateString(entry.date);
        if (key in map) {
            map[key] = (map[key] ?? 0) + entry.durationHours;
        }
    }

    return map;
}

/**
 * Build a weekly summary for a resource.
 */
export function buildWeeklySummary(
    entries: TimeEntryRow[],
    resourceId: string,
    weekStart: Date,
    assignedHours: number
): WeeklySummary {
    const days = aggregateDayHours(entries, weekStart);
    const weekTotal = Object.values(days).reduce((sum, h) => sum + h, 0);

    return {
        resourceId,
        weekStart,
        days,
        weekTotal,
        assignedTotal : assignedHours,
        variance      : assignedHours - weekTotal
    };
}

// ── Validation ───────────────────────────────────────────────────────

export interface ValidationResult {
    valid: boolean;
    errors: string[];
}

/**
 * Validate a time entry before creating/updating.
 */
export function validateTimeEntry(
    durationHours: number,
    date: Date | null,
    options: { maxHours?: number; minIncrement?: number } = {}
): ValidationResult {
    const { maxHours = 24, minIncrement = 0.25 } = options;
    const errors: string[] = [];

    if (!date || isNaN(date.getTime())) {
        errors.push('A valid date is required.');
    }

    if (durationHours <= 0) {
        errors.push('Duration must be greater than 0.');
    }

    if (durationHours > maxHours) {
        errors.push(`Duration cannot exceed ${maxHours} hours.`);
    }

    if (minIncrement > 0) {
        const remainder = Math.round((durationHours % minIncrement) * 1000) / 1000;
        if (remainder !== 0) {
            errors.push(`Duration must be in increments of ${minIncrement} hours.`);
        }
    }

    return { valid : errors.length === 0, errors };
}

// ── Payload builders ─────────────────────────────────────────────────

/**
 * Build a D365 `CreateTimeEntryPayload` from user inputs.
 */
export function buildCreatePayload(
    resourceId: string,
    date: Date,
    durationHours: number,
    options: {
        description?: string;
        type?: TimeEntryType;
        projectId?: string;
        taskId?: string;
        resourceCategoryId?: string;
    } = {}
): CreateTimeEntryPayload {
    const durationMinutes = Math.round(durationHours * 60);

    const payload: CreateTimeEntryPayload = {
        msdyn_date                          : toISODateString(date),
        msdyn_duration                      : durationMinutes,
        msdyn_type                          : options.type ?? TimeEntryType.Work,
        'msdyn_bookableresource@odata.bind' : `/bookableresources(${resourceId})`
    };

    if (options.description) {
        payload.msdyn_description = options.description;
    }

    if (options.projectId) {
        payload['msdyn_project@odata.bind'] = `/msdyn_projects(${options.projectId})`;
    }

    if (options.taskId) {
        payload['msdyn_projectTask@odata.bind'] = `/msdyn_projecttasks(${options.taskId})`;
    }

    if (options.resourceCategoryId) {
        payload['msdyn_resourceCategory@odata.bind'] = `/bookableresourcecategories(${options.resourceCategoryId})`;
    }

    return payload;
}

// ── Status helpers ───────────────────────────────────────────────────

/**
 * Return the CSS class suffix for a given time entry status.
 * Used for colour-coded badges in the grid.
 */
export function statusBadgeClass(status: TimeEntryStatus): string {
    switch (status) {
        case TimeEntryStatus.Draft:           return 'draft';
        case TimeEntryStatus.Submitted:       return 'submitted';
        case TimeEntryStatus.Approved:        return 'approved';
        case TimeEntryStatus.Returned:        return 'returned';
        case TimeEntryStatus.RecallRequested: return 'recall-requested';
        default:                              return 'draft';
    }
}

/**
 * Filter entries by editable status (Draft or Returned).
 */
export function getEditableEntries(entries: TimeEntryRow[]): TimeEntryRow[] {
    return entries.filter((e) => e.isEditable);
}

/**
 * Filter entries that are ready to submit (Draft only).
 */
export function getSubmittableEntries(entries: TimeEntryRow[]): TimeEntryRow[] {
    return entries.filter((e) => e.status === TimeEntryStatus.Draft);
}
