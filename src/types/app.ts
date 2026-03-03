/**
 * Shared application-level types used across the app/ modules.
 */

/** Shape of a flat resource record fed to the SchedulerPro resource store. */
export interface FlatResource {
    id: string;
    name: string;
    imageUrl: string | null;
    practiceName: string;
    roleName: string;
    workingHours: number;
    calendar?: string;
    [key: string]: unknown;
}

/** Tracks which date range has already been fetched from the API. */
export interface FetchedRange {
    start: Date | null;
    end: Date | null;
}

/** Effort-remaining configuration derived from env vars. */
export interface EffortConfig {
    useCurrentWeek: boolean;
    offsetDays: number;
}

/** Friendly view-mode names mapped to Bryntum view-preset ids. */
export type ViewMode = 'day' | 'week' | 'month';

/** Allocation state for filtering — used in histogram bar coloring and filter logic. */
export type AllocationState = 'over' | 'under' | 'balanced' | 'mixed';
