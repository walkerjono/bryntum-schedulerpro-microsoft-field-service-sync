/**
 * Mutable application state — centralises values that were previously
 * scattered as module-level `let` variables in main.js.
 *
 * Every piece of state is exposed via explicit getters/setters so the
 * rest of the app never touches the variables directly.
 */

import type { FlatResource, FetchedRange, EffortConfig } from '../types/app';
import { PROJECT_COLORS, VIEWPORT_BUFFER_DAYS } from './schedulerproConfig';
import {
    computeBufferedRange as _computeBufferedRange,
    clampStartToToday as _clampStartToToday,
    calcUnits as _calcUnits,
    getProjectColor as _getProjectColor,
    type CalcUnitsOpts
} from '../lib/schedulingUtils';

// ── Effort configuration (derived from env vars, read-only at runtime) ──

const EFFORT_REMAINING_OFFSET_RAW: string =
    (import.meta.env.VITE_EFFORT_REMAINING_OFFSET_DAYS || '7').trim();

export const EFFORT_REMAINING_USE_CURRENT_WEEK: boolean =
    EFFORT_REMAINING_OFFSET_RAW.toLowerCase() === 'current_week';

export const EFFORT_REMAINING_OFFSET_DAYS: number =
    EFFORT_REMAINING_USE_CURRENT_WEEK ? 0 : (Number(EFFORT_REMAINING_OFFSET_RAW) || 7);

export const HOURS_PER_DAY: number =
    Number(import.meta.env.VITE_HOURS_PER_DAY) || 8;

export const effortConfig: EffortConfig = {
    useCurrentWeek : EFFORT_REMAINING_USE_CURRENT_WEEK,
    offsetDays     : EFFORT_REMAINING_OFFSET_DAYS
};

// ── Mutable state ───────────────────────────────────────────────────

let useRemainingEffort: boolean =
    import.meta.env.VITE_USE_EFFORT_REMAINING === 'true';

// Apply URL override immediately so initial data processing uses the correct flag
if (typeof window !== 'undefined') {
    const effortParam = new URLSearchParams(window.location.search).get('useRemainingEffort');
    if (effortParam != null) {
        useRemainingEffort = effortParam === 'true';
    }
}

let fetchedRange: FetchedRange = { start : null, end : null };

let projectColorMap = new Map<string, string>();
let projectColorNextIndex = 0;

let resourceHoursMap = new Map<string, number>();

let flatResources: FlatResource[] = [];

let viewportFetchInFlight = false;

// ── Getters / Setters ───────────────────────────────────────────────

export function getUseRemainingEffort(): boolean {
    return useRemainingEffort;
}
export function setUseRemainingEffort(value: boolean): void {
    useRemainingEffort = value;
}

export function getFetchedRange(): FetchedRange {
    return fetchedRange;
}
export function setFetchedRange(range: FetchedRange): void {
    fetchedRange = range;
}

export function getResourceHoursMap(): Map<string, number> {
    return resourceHoursMap;
}
export function setResourceHoursMap(map: Map<string, number>): void {
    resourceHoursMap = map;
}

export function getFlatResources(): FlatResource[] {
    return flatResources;
}
export function setFlatResources(resources: FlatResource[]): void {
    flatResources = resources;
}

export function getViewportFetchInFlight(): boolean {
    return viewportFetchInFlight;
}
export function setViewportFetchInFlight(value: boolean): void {
    viewportFetchInFlight = value;
}

export function resetProjectColors(): void {
    projectColorMap = new Map();
    projectColorNextIndex = 0;
}

// ── Derived helpers (thin wrappers over schedulingUtils) ────────────

/**
 * Compute the buffered date window for OData queries.
 */
export function computeBufferedRange(start: Date, end: Date): { start: Date; end: Date } {
    return _computeBufferedRange(start, end, VIEWPORT_BUFFER_DAYS);
}

/** Stable project colour assignment. */
const _projectColorIndex = { value : 0 };
export function getProjectColor(projectName: string | null): string {
    _projectColorIndex.value = projectColorNextIndex;
    const result = _getProjectColor(projectName, projectColorMap, _projectColorIndex, PROJECT_COLORS);
    projectColorNextIndex = _projectColorIndex.value;
    return result;
}

/** Clamp a start date to today (for effort-remaining mode). */
export function clampStartToToday(date: Date | string): Date {
    const result = _clampStartToToday(date, {
        useCurrentWeek : EFFORT_REMAINING_USE_CURRENT_WEEK,
        offsetDays     : EFFORT_REMAINING_OFFSET_DAYS
    });
    return result instanceof Date ? result : new Date(result);
}

/** Calculate assignment units. */
export function calcUnits(
    effort: number,
    effortRemaining: number | null,
    startDate: Date | string,
    endDate: Date | string,
    resourceId?: string
): number {
    const opts: CalcUnitsOpts = {
        useRemainingEffort,
        hoursPerDay : HOURS_PER_DAY,
        resourceHoursMap,
        resourceId,
        clampFn     : clampStartToToday
    };
    return _calcUnits(effort, effortRemaining, startDate, endDate, opts);
}
