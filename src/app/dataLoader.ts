/**
 * Data loading — initial fetch, incremental viewport fetch, and full refresh.
 *
 * Extracts the async data-loading logic that was previously inline in
 * main.js's `displayUI()`.
 */

import type { SchedulerPro } from '@bryntum/schedulerpro';
import { getResources, getAssignments, getResourcePractices } from './crudFunctions';
import CustomResourceModel, { loadDefaultImage } from '../lib/CustomResourceModel';
import CustomEventModel from '../lib/CustomEventModel';
import { resolveRawAssignments as _resolveRawAssignments, generateCalendars, type ResolvedEvent, type ResolvedAssignment, type CalendarConfig } from '../lib/schedulingUtils';
import type { D365ResourceAssignment } from '../types/d365';
import { schedulerproConfig, VIEWPORT_BUFFER_DAYS } from './schedulerproConfig';
import { clearLeafStateCache } from './histogramConfig';
import type { FlatResource } from '../types/app';
import type { AppWidgetMap } from '../types/bryntum.d';
import {
    getUseRemainingEffort,
    getFetchedRange,
    setFetchedRange,
    getResourceHoursMap,
    setResourceHoursMap,
    setFlatResources,
    getViewportFetchInFlight,
    setViewportFetchInFlight,
    resetProjectColors,
    computeBufferedRange,
    clampStartToToday,
    calcUnits,
    getProjectColor
} from './appState';

// ── Public helpers re-exported for main.ts ──────────────────────────

/** Wrapper that delegates to the extracted pure resolveRawAssignments. */
export function resolveRawAssignments(rawRecords: D365ResourceAssignment[]): { events: ResolvedEvent[]; assignments: ResolvedAssignment[] } {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return _resolveRawAssignments(rawRecords, CustomEventModel as any, {
        useRemainingEffort : getUseRemainingEffort(),
        clampFn            : clampStartToToday,
        calcUnitsFn        : calcUnits,
        getProjectColorFn  : getProjectColor,
        resourceHoursMap   : getResourceHoursMap(),
        hoursPerDay        : Number(import.meta.env.VITE_HOURS_PER_DAY) || 8
    });
}

// ── Initial load ────────────────────────────────────────────────────

export interface InitialLoadResult {
    flatResources: FlatResource[];
    resolvedEvents: ResolvedEvent[];
    assignments: ResolvedAssignment[];
    calendars: CalendarConfig[];
    practiceMap: Map<string, string>;
    roleMap: Map<string, string>;
}

/**
 * Fetch all data needed for the first paint: resources, assignments,
 * practices/roles, and the default resource image.
 */
export async function loadInitialData(): Promise<InitialLoadResult> {
    const initialRange = computeBufferedRange(
        schedulerproConfig.startDate as Date,
        schedulerproConfig.endDate as Date
    );

    const [resourcesData, assignmentsData, practiceRoleResult] =
        await Promise.all([
            getResources(),
            getAssignments({ rangeStart : initialRange.start, rangeEnd : initialRange.end }),
            getResourcePractices().catch((err) => {
                console.warn('[dataLoader] Failed to load practices, continuing without practice grouping:', err);
                return { practiceMap : new Map<string, string>(), roleMap : new Map<string, string>() };
            }),
            loadDefaultImage().catch(() => { /* ignore */ })
        ]);

    // Record what we've fetched
    setFetchedRange({ start : initialRange.start, end : initialRange.end });

    const { practiceMap, roleMap } = practiceRoleResult;
    console.log(
        `[dataLoader] Loaded ${resourcesData.value.length} resources, ${assignmentsData.value.length} assignments, ${practiceMap.size} practice mappings, ${roleMap.size} role mappings`
    );

    // Build resource → weekly-working-hours lookup
    const hoursMap = new Map<string, number>();
    for (const raw of resourcesData.value) {
        const wh = raw.ws_workinghours ?? 40;
        hoursMap.set(raw.bookableresourceid, wh);
    }
    setResourceHoursMap(hoursMap);
    console.log(`[dataLoader] Built resourceHoursMap for ${hoursMap.size} resources (weekly hours)`);

    // Reset colour state for initial load
    resetProjectColors();

    const { events: resolvedEvents, assignments } = _resolveRawAssignments(
        assignmentsData.value,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        CustomEventModel as any,
        {
            useRemainingEffort : getUseRemainingEffort(),
            clampFn            : clampStartToToday,
            calcUnitsFn        : calcUnits,
            getProjectColorFn  : getProjectColor,
            resourceHoursMap   : hoursMap,
            hoursPerDay        : Number(import.meta.env.VITE_HOURS_PER_DAY) || 8
        }
    );

    // Build flat resource array with pre-baked fields
    const tempResourceModels = resourcesData.value.map(
        (raw) => new CustomResourceModel(raw)
    );
    const flatResources: FlatResource[] = resourcesData.value.map((raw, i) => {
        const model = tempResourceModels[i];
        const id = raw.bookableresourceid;

        let imageUrl: string | null = null;
        const entityImage = raw.ContactId?.entityimage;
        if (entityImage) {
            imageUrl = `data:image/jpeg;base64,${entityImage}`;
        }
        else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            imageUrl = (model as any).imageUrl || null;
        }

        return {
            id,
            name         : raw.name || 'Unnamed',
            imageUrl,
            practiceName : practiceMap.get(id) || 'Unassigned',
            roleName     : roleMap.get(id) || 'Unassigned',
            workingHours : raw.ws_workinghours ?? 40,
            calendar     : 'business'
        };
    });

    setFlatResources(flatResources);

    const calendars = generateCalendars(flatResources);

    return { flatResources, resolvedEvents, assignments, calendars, practiceMap, roleMap };
}

// ── Incremental viewport fetch ──────────────────────────────────────

/**
 * Fetch assignments for an unfetched date slice and merge them into
 * the live stores without replacing existing data.
 */
export async function fetchAndMergeRange(
    scheduler: SchedulerPro,
    newStart: Date,
    newEnd: Date
): Promise<void> {
    if (getViewportFetchInFlight()) return;
    setViewportFetchInFlight(true);

    try {
        console.log(`[dataLoader] Incremental fetch: ${newStart.toISOString()} → ${newEnd.toISOString()}`);
        const data = await getAssignments({ rangeStart : newStart, rangeEnd : newEnd });
        const { events: newEvents, assignments: newAssignments } = resolveRawAssignments(data.value);

        // Deduplicate — only add events we don't already have
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const eventStore = (scheduler as any).project.eventStore;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const assignmentStore = (scheduler as any).project.assignmentStore;
        const addedEvents: ResolvedEvent[] = [];
        const addedAssigns: ResolvedAssignment[] = [];

        for (const evt of newEvents) {
            if (!eventStore.getById(evt.id)) {
                addedEvents.push(evt);
            }
        }
        for (const asgn of newAssignments) {
            if (!assignmentStore.getById(asgn.id)) {
                addedAssigns.push(asgn);
            }
        }

        if (addedEvents.length > 0) {
            eventStore.add(addedEvents);
            assignmentStore.add(addedAssigns);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (scheduler as any).project.commitAsync();
            console.log(`[dataLoader] Merged ${addedEvents.length} new events`);
        }

        // Extend the fetched-range watermark
        const fetched = getFetchedRange();
        setFetchedRange({
            start : new Date(Math.min(fetched.start!.getTime(), newStart.getTime())),
            end   : new Date(Math.max(fetched.end!.getTime(), newEnd.getTime()))
        });
    }
    catch (err) {
        console.error('[dataLoader] Incremental fetch failed:', err);
    }
    finally {
        setViewportFetchInFlight(false);
    }
}

// ── Full refresh ────────────────────────────────────────────────────

/**
 * Re-fetch all data and replace the stores. Called by the refresh button.
 */
export async function refreshAllData(
    scheduler: SchedulerPro,
    widgets: AppWidgetMap
): Promise<void> {
    clearLeafStateCache();
    console.log('[dataLoader] Refreshing data…');

    // Use current visible range + buffer for the refresh fetch
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const visRange = (scheduler as any).visibleDateRange || {};
    const refreshRange = computeBufferedRange(
        visRange.startDate || schedulerproConfig.startDate,
        visRange.endDate || schedulerproConfig.endDate
    );

    const [newResources, newAssignments, newPracticeRoleResult] =
        await Promise.all([
            getResources(),
            getAssignments({ rangeStart : refreshRange.start, rangeEnd : refreshRange.end }),
            getResourcePractices().catch((err) => {
                console.warn('[dataLoader] Failed to refresh practices:', err);
                return { practiceMap : new Map<string, string>(), roleMap : new Map<string, string>() };
            })
        ]);

    const { practiceMap: newPracticeMap, roleMap: newRoleMap } = newPracticeRoleResult;

    // Rebuild resource hours map
    const hoursMap = new Map<string, number>();
    for (const raw of newResources.value) {
        const wh = raw.ws_workinghours ?? 40;
        hoursMap.set(raw.bookableresourceid, wh / 5);
    }
    setResourceHoursMap(hoursMap);
    console.log(`[dataLoader] Rebuilt resourceHoursMap for ${hoursMap.size} resources`);

    // Re-resolve events
    const { events: newResolvedEvents, assignments: newAssignmentRecords } =
        resolveRawAssignments(newAssignments.value);

    // Re-build flat resources
    const newTempModels = newResources.value.map((raw) => new CustomResourceModel(raw));
    const newFlatResources: FlatResource[] = newResources.value.map((raw, i) => {
        const model = newTempModels[i];
        const id = raw.bookableresourceid;
        let imageUrl: string | null = null;
        const entityImage = raw.ContactId?.entityimage;
        if (entityImage) {
            imageUrl = `data:image/jpeg;base64,${entityImage}`;
        }
        else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            imageUrl = (model as any).imageUrl || null;
        }
        return {
            id,
            name         : raw.name || 'Unnamed',
            imageUrl,
            practiceName : newPracticeMap.get(id) || 'Unassigned',
            roleName     : newRoleMap.get(id) || 'Unassigned',
            workingHours : raw.ws_workinghours ?? 40,
            calendar     : 'business'
        };
    });

    // Update stores
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const project = (scheduler as any).project;
    project.assignmentStore.removeAll();
    project.eventStore.removeAll();
    project.resourceStore.data = newFlatResources;
    project.eventStore.data = newResolvedEvents;
    project.assignmentStore.data = newAssignmentRecords;
    await project.commitAsync();

    // Reset viewport fetch watermark
    setFetchedRange({ start : refreshRange.start, end : refreshRange.end });

    // Update flatResources reference
    setFlatResources(newFlatResources);

    // Refresh filter combo options
    const practiceCombo = widgets.practiceFilter;
    if (practiceCombo) {
        const updatedPractices = [
            ...new Set(newFlatResources.map((r) => r.practiceName).filter(Boolean))
        ].sort();
        practiceCombo.items = updatedPractices.map((p) => ({ value : p, text : p }));
    }

    const roleCombo = widgets.roleFilter;
    if (roleCombo) {
        const updatedRoles = [
            ...new Set(newFlatResources.map((r) => r.roleName).filter(Boolean))
        ].sort();
        roleCombo.items = updatedRoles.map((r) => ({ value : r, text : r }));
    }

    // Resource filter refresh is handled by filterManager
    console.log('[dataLoader] Data refreshed successfully');
}

// ── Debounced dateRangeChange wiring ────────────────────────────────

/**
 * Attach the debounced `dateRangeChange` listener that triggers
 * incremental viewport fetches.
 */
export function attachDateRangeListener(scheduler: SchedulerPro): void {
    let timer: ReturnType<typeof setTimeout> | null = null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (scheduler as any).on('dateRangeChange', ({ new: newRange }: { new: { startDate: Date; endDate: Date } }) => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            const fetched = getFetchedRange();
            if (!fetched.start) return;

            const visStart = new Date(newRange.startDate);
            const visEnd = new Date(newRange.endDate);

            const halfBuffer = VIEWPORT_BUFFER_DAYS / 2;
            const thresholdStart = new Date(fetched.start);
            thresholdStart.setDate(thresholdStart.getDate() + halfBuffer);
            const thresholdEnd = new Date(fetched.end!);
            thresholdEnd.setDate(thresholdEnd.getDate() - halfBuffer);

            if (visStart < thresholdStart || visEnd > thresholdEnd) {
                const desired = computeBufferedRange(visStart, visEnd);
                fetchAndMergeRange(scheduler, desired.start, desired.end);
            }
        }, 400);
    });
}
