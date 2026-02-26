/**
 * URL filter parameter utilities — extracted from main.js for testability.
 *
 * Reads and writes filter state (practice, role, resource, effort toggle,
 * zoom preset) to/from URL query parameters.
 */

import type { ViewMode } from '../types/app';

export interface FilterState {
    practices: string[];
    roles: string[];
    resources: string[];
    useRemainingEffort: boolean | null;
    zoom: string | null;
}

/**
 * Read filter values from a URL search string.
 */
export function readFilterParams(searchString: string): FilterState {
    const params = new URLSearchParams(searchString);
    const effortParam = params.get('useRemainingEffort');
    return {
        practices          : params.get('practice')?.split(',').filter(Boolean) || [],
        roles              : params.get('role')?.split(',').filter(Boolean) || [],
        resources          : params.get('resource')?.split(',').filter(Boolean) || [],
        useRemainingEffort : effortParam != null ? effortParam === 'true' : null,
        zoom               : params.get('zoom') || null
    };
}

/**
 * Write filter values to URL query parameters.
 */
export function writeFilterParams(
    state: FilterState,
    currentSearch: string,
    pathname: string,
    replaceStateFn: (url: string) => void
): void {
    const params = new URLSearchParams(currentSearch);

    if (state.practices && state.practices.length > 0) {
        params.set('practice', state.practices.join(','));
    }
    else {
        params.delete('practice');
    }

    if (state.roles && state.roles.length > 0) {
        params.set('role', state.roles.join(','));
    }
    else {
        params.delete('role');
    }

    if (state.resources && state.resources.length > 0) {
        params.set('resource', state.resources.join(','));
    }
    else {
        params.delete('resource');
    }

    if (state.useRemainingEffort) {
        params.set('useRemainingEffort', 'true');
    }
    else {
        params.delete('useRemainingEffort');
    }

    // Persist zoom only when it differs from the env-var default
    const defaultPreset = import.meta.env.VITE_DEFAULT_VIEW_MODE
        ? ({ day : 'weekAndDayLetter', week : 'weekAndMonth', month : 'monthAndYear' } satisfies Record<ViewMode, string>)[
            (import.meta.env.VITE_DEFAULT_VIEW_MODE || 'day').toLowerCase() as ViewMode
        ] || 'weekAndDayLetter'
        : 'weekAndDayLetter';

    if (state.zoom && state.zoom !== defaultPreset) {
        params.set('zoom', state.zoom);
    }
    else {
        params.delete('zoom');
    }

    const qs = params.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    replaceStateFn(url);
}
