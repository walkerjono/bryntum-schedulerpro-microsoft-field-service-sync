/**
 * D365 environment variable settings loader for the timesheet.
 *
 * Reads configuration from D365 Environment Variable Definitions and
 * Environment Variable Values entities. Falls back to default values
 * if the variables are not defined in the target environment.
 *
 * Settings are cached after first load and persisted to localStorage
 * for faster subsequent loads.
 *
 * Known D365 environment variables used by the original timesheet:
 *   - ws_timesheetsubmitcomplete: 'true'|'false' — whether submit
 *     should also trigger Complete workflow
 *   - ws_timesheetmaxhours: max hours per day (default 24)
 *   - ws_timesheetminincrement: min time increment (default 0.25)
 *   - ws_timesheetinternalproject: comma-separated project IDs that
 *     are "internal" (no variations column)
 */

import { getToken } from './auth';
import { orgUrl, apiVersion, buildHeaders } from './odataHelper';

// ── Types ───────────────────────────────────────────────────────────

export interface TimesheetSettings {
    /** Whether submit should also complete the timesheet. */
    submitAndComplete: boolean;
    /** Maximum hours per single time entry. */
    maxHours: number;
    /** Minimum time increment in hours (e.g. 0.25 = 15 min). */
    minIncrement: number;
    /** Project IDs that are internal (no variations). */
    internalProjectIds: string[];
    /** Timesheet requires project selection. */
    requireProject: boolean;
    /** Timesheet requires task selection for non-internal projects. */
    requireTask: boolean;
    /** Variation reason ID that auto-sets time=0 and endDate=today ("completed" reason). */
    completedReasonId: string | null;
    /** Whether all stdentry rows must have a variation before submit. */
    enforceAllVariations: boolean;
}

interface D365EnvVarDefinition {
    environmentvariabledefinitionid: string;
    schemaname: string;
    displayname: string;
    defaultvalue: string | null;
    type: number;
}

interface D365EnvVarValue {
    environmentvariablevalueid: string;
    _environmentvariabledefinitionid_value: string;
    value: string;
}

// ── Storage key ─────────────────────────────────────────────────────

const STORAGE_KEY = 'ws-timesheet-settings';

// ── Defaults ────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: TimesheetSettings = {
    submitAndComplete    : false,
    maxHours             : 24,
    minIncrement         : 0.25,
    internalProjectIds   : [],
    requireProject       : true,
    requireTask          : false,
    completedReasonId    : null,
    enforceAllVariations : false
};

// ── State ───────────────────────────────────────────────────────────

let cachedSettings: TimesheetSettings | null = null;

// ── D365 env var helpers ────────────────────────────────────────────

/**
 * Fetch environment variable definitions by schema name prefix.
 */
async function fetchEnvVarDefinitions(prefix: string): Promise<D365EnvVarDefinition[]> {
    const token = await getToken();
    const headers = buildHeaders(token);

    const url = `${orgUrl}/api/data/${apiVersion}/environmentvariabledefinitions?$select=environmentvariabledefinitionid,schemaname,displayname,defaultvalue,type&$filter=startswith(schemaname,'${prefix}')`;

    const response = await fetch(url, { headers });
    if (!response.ok) {
        console.warn('[timesheetSettings] Failed to fetch env var definitions:', response.statusText);
        return [];
    }

    const data = await response.json();
    return data.value ?? [];
}

/**
 * Fetch environment variable values for a set of definition IDs.
 */
async function fetchEnvVarValues(definitionIds: string[]): Promise<D365EnvVarValue[]> {
    if (definitionIds.length === 0) return [];

    const token = await getToken();
    const headers = buildHeaders(token);

    const filter = definitionIds
        .map((id) => `_environmentvariabledefinitionid_value eq ${id}`)
        .join(' or ');

    const url = `${orgUrl}/api/data/${apiVersion}/environmentvariablevalues?$select=environmentvariablevalueid,_environmentvariabledefinitionid_value,value&$filter=${filter}`;

    const response = await fetch(url, { headers });
    if (!response.ok) {
        console.warn('[timesheetSettings] Failed to fetch env var values:', response.statusText);
        return [];
    }

    const data = await response.json();
    return data.value ?? [];
}

/**
 * Resolve a D365 env var: value if set, else definition default, else null.
 */
function resolveEnvVar(
    schemaName: string,
    definitions: D365EnvVarDefinition[],
    values: D365EnvVarValue[]
): string | null {
    const def = definitions.find((d) => d.schemaname === schemaName);
    if (!def) return null;

    const val = values.find((v) => v._environmentvariabledefinitionid_value === def.environmentvariabledefinitionid);
    if (val) return val.value;

    return def.defaultvalue;
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Load timesheet settings from D365 environment variables.
 * Caches the result; returns cached copy on subsequent calls.
 */
export async function loadTimesheetSettings(): Promise<TimesheetSettings> {
    if (cachedSettings) return cachedSettings;

    // Try localStorage first for faster load
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored) as TimesheetSettings;
            cachedSettings = { ...DEFAULT_SETTINGS, ...parsed };
            console.log('[timesheetSettings] Loaded from localStorage');
            // Refresh from D365 in the background
            refreshFromD365().catch((err) =>
                console.warn('[timesheetSettings] Background refresh failed:', err)
            );
            return cachedSettings;
        }
    }
    catch {
        // localStorage not available or corrupted
    }

    // Load from D365
    await refreshFromD365();
    return cachedSettings ?? { ...DEFAULT_SETTINGS };
}

/**
 * Refresh settings from D365 environment variables.
 */
async function refreshFromD365(): Promise<void> {
    try {
        console.log('[timesheetSettings] Fetching from D365…');
        const definitions = await fetchEnvVarDefinitions('ws_timesheet');
        const defIds = definitions.map((d) => d.environmentvariabledefinitionid);
        const values = await fetchEnvVarValues(defIds);

        const settings: TimesheetSettings = { ...DEFAULT_SETTINGS };

        // Parse each known setting
        const submitComplete = resolveEnvVar('ws_timesheetsubmitcomplete', definitions, values);
        if (submitComplete != null) {
            settings.submitAndComplete = submitComplete.toLowerCase() === 'true';
        }

        const maxHours = resolveEnvVar('ws_timesheetmaxhours', definitions, values);
        if (maxHours != null) {
            const parsed = parseFloat(maxHours);
            if (!isNaN(parsed) && parsed > 0) settings.maxHours = parsed;
        }

        const minIncrement = resolveEnvVar('ws_timesheetminincrement', definitions, values);
        if (minIncrement != null) {
            const parsed = parseFloat(minIncrement);
            if (!isNaN(parsed) && parsed > 0) settings.minIncrement = parsed;
        }

        const internalProjects = resolveEnvVar('ws_timesheetinternalproject', definitions, values);
        if (internalProjects != null) {
            settings.internalProjectIds = internalProjects
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
        }

        const requireProject = resolveEnvVar('ws_timesheetrequireproject', definitions, values);
        if (requireProject != null) {
            settings.requireProject = requireProject.toLowerCase() !== 'false';
        }

        const requireTask = resolveEnvVar('ws_timesheetrequiretask', definitions, values);
        if (requireTask != null) {
            settings.requireTask = requireTask.toLowerCase() === 'true';
        }

        const completedReasonId = resolveEnvVar('ws_timesheetcompletedreasonid', definitions, values);
        if (completedReasonId != null && completedReasonId.trim()) {
            settings.completedReasonId = completedReasonId.trim();
        }

        const enforceVariations = resolveEnvVar('ws_timesheetenforceallvariations', definitions, values);
        if (enforceVariations != null) {
            settings.enforceAllVariations = enforceVariations.toLowerCase() === 'true';
        }

        cachedSettings = settings;

        // Persist to localStorage
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        }
        catch {
            // localStorage quota or unavailable
        }

        console.log('[timesheetSettings] Settings loaded:', settings);
    }
    catch (err) {
        console.error('[timesheetSettings] Failed to load from D365:', err);
        if (!cachedSettings) {
            cachedSettings = { ...DEFAULT_SETTINGS };
        }
    }
}

/**
 * Get cached settings synchronously (returns defaults if not yet loaded).
 */
export function getTimesheetSettings(): TimesheetSettings {
    return cachedSettings ?? { ...DEFAULT_SETTINGS };
}

/**
 * Clear cached settings (for testing or sign-out).
 */
export function resetTimesheetSettings(): void {
    cachedSettings = null;
    try {
        localStorage.removeItem(STORAGE_KEY);
    }
    catch {
        // ignore
    }
}
