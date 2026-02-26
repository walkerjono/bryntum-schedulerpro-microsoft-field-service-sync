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
    calendar: string;
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

/** Combo-box item shape used by Bryntum filter combos. */
export interface ComboItem {
    value: string;
    text: string;
}
