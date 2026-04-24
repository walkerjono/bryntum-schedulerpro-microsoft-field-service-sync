/**
 * Timesheet-specific mutable state.
 *
 * Follows the same getter/setter pattern as appState.ts so the rest
 * of the app never touches the variables directly.
 */

import type { TimeEntryRow, WeeklySummary } from '../types/timesheet';

// ── Feature flag ────────────────────────────────────────────────────

const timesheetEnabled: boolean =
    import.meta.env.VITE_TIMESHEET_ENABLED === 'true';

export function isTimesheetEnabled(): boolean {
    return timesheetEnabled;
}

// ── Configuration ───────────────────────────────────────────────────

/** Maximum hours that can be entered for a single time entry (default 24). */
export const TIMESHEET_MAX_HOURS: number =
    Number(import.meta.env.VITE_TIMESHEET_MAX_HOURS) || 24;

/** Minimum increment in hours for time entry duration (default 0.25 = 15 min). */
export const TIMESHEET_MIN_INCREMENT: number =
    Number(import.meta.env.VITE_TIMESHEET_MIN_INCREMENT) || 0.25;

// ── Mutable state ───────────────────────────────────────────────────

let timeEntries: TimeEntryRow[] = [];
let selectedResourceId: string | null = null;
let timesheetPanelVisible = false;
let timesheetWeekStart: Date | null = null;
let weeklySummary: WeeklySummary | null = null;
let timesheetLoading = false;

// ── Getters / Setters ───────────────────────────────────────────────

export function getTimeEntries(): TimeEntryRow[] {
    return timeEntries;
}
export function setTimeEntries(entries: TimeEntryRow[]): void {
    timeEntries = entries;
}

export function getSelectedResourceId(): string | null {
    return selectedResourceId;
}
export function setSelectedResourceId(id: string | null): void {
    selectedResourceId = id;
}

export function isTimesheetPanelVisible(): boolean {
    return timesheetPanelVisible;
}
export function setTimesheetPanelVisible(visible: boolean): void {
    timesheetPanelVisible = visible;
}

export function getTimesheetWeekStart(): Date | null {
    return timesheetWeekStart;
}
export function setTimesheetWeekStart(date: Date | null): void {
    timesheetWeekStart = date;
}

export function getWeeklySummary(): WeeklySummary | null {
    return weeklySummary;
}
export function setWeeklySummary(summary: WeeklySummary | null): void {
    weeklySummary = summary;
}

export function isTimesheetLoading(): boolean {
    return timesheetLoading;
}
export function setTimesheetLoading(loading: boolean): void {
    timesheetLoading = loading;
}

// ── Reset ───────────────────────────────────────────────────────────

/** Clear all timesheet state (e.g. on sign-out or resource deselection). */
export function resetTimesheetState(): void {
    timeEntries = [];
    selectedResourceId = null;
    timesheetPanelVisible = false;
    timesheetWeekStart = null;
    weeklySummary = null;
    timesheetLoading = false;
}
