/**
 * Filter wiring — practice, role, and resource combo listeners.
 *
 * Extracted from main.js's `displayUI()`.
 */

import type { SchedulerPro, ResourceHistogram } from '@bryntum/schedulerpro';
import type { AppWidgetMap } from '../types/bryntum.d';
import { getFlatResources } from './appState';
import { readFilterParams, writeFilterParams, type FilterState } from '../lib/filterUtils';
import { getAllocationStates } from '../lib/schedulingUtils';

// ── Helpers ─────────────────────────────────────────────────────────

type AllocationRow = { resource: { id: string; children?: unknown }; allocation: { percent: number } };

/**
 * Build allocation rows by querying the histogram's async API for each
 * leaf resource.  `getRecordAllocationData(resource)` returns a
 * `ResourceAllocationInfo` whose `.allocation.total[]` array contains
 * one `ResourceAllocationInterval` per visible tick, each carrying
 * `effort`, `maxEffort`, and `units` (the allocation %).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildAllocationRows(store: any, histogram: any): Promise<AllocationRow[]> {
    const rows: AllocationRow[] = [];

    // Collect leaf resources
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leaves: any[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store.forEach((r: any) => {
        if (r.id && r.isLeaf) leaves.push(r);
    });

    if (leaves.length === 0) return rows;

    // Query allocation data for all leaves in parallel
    const promises = leaves.map(async(resource) => {
        try {
            const info = await histogram.getRecordAllocationData(resource);
            // info is ResourceAllocationInfo: { allocation: { total: ResourceAllocationInterval[] } }
            const intervals = info?.allocation?.total;
            if (!Array.isArray(intervals)) return;

            for (const interval of intervals) {
                const maxEffort = interval.maxEffort ?? 0;
                if (maxEffort === 0) continue;
                const percent = (interval.effort / maxEffort) * 100;
                rows.push({
                    resource   : { id : resource.id, children : resource.children },
                    allocation : { percent }
                });
            }
        }
        catch (err) {
            console.warn('[buildAllocationRows] Error for resource', resource.id, err);
        }
    });

    await Promise.all(promises);
    return rows;
}

// ── URL parameter helpers ───────────────────────────────────────────

/** Read filter values from the current URL. */
export function readFiltersFromUrl(): FilterState {
    return readFilterParams(window.location.search);
}

/** Write current filter/zoom state to the URL. */
export function writeFiltersToUrl(
    widgets: AppWidgetMap,
    scheduler: SchedulerPro,
    useRemainingEffort: boolean
): void {
    const practiceCombo = widgets.practiceFilter;
    const roleCombo = widgets.roleFilter;
    const resourceCombo = widgets.resourceFilter;
    const allocationCombo = widgets.allocationFilter;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activeZoomBtn = widgets.viewPresetGroup?.items?.find((b: any) => b.pressed);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activePreset = (activeZoomBtn as any)?.dataset?.preset ?? null;

    writeFilterParams(
        {
            practices  : practiceCombo?.value ?? [],
            roles      : roleCombo?.value ?? [],
            resources  : resourceCombo?.value ?? [],
            useRemainingEffort,
            zoom       : activePreset,
            allocation : (allocationCombo?.value ?? 'all') as string
        },
        window.location.search,
        window.location.pathname,
        (url: string) => window.history.replaceState(null, '', url)
    );
}

// ── Rebuild resource filter items ──────────────────────────────────

/** Rebuild resource combo items based on active practice/role selections. */
export function updateResourceFilterItems(widgets: AppWidgetMap): void {
    const resourceCombo = widgets.resourceFilter;
    if (!resourceCombo) return;

    const practiceCombo = widgets.practiceFilter;
    const roleCombo = widgets.roleFilter;
    let filtered = getFlatResources();

    const pv = practiceCombo?.value;
    const rv = roleCombo?.value;
    if (pv && pv.length > 0) {
        filtered = filtered.filter((r) => pv.includes(r.practiceName));
    }
    if (rv && rv.length > 0) {
        filtered = filtered.filter((r) => rv.includes(r.roleName));
    }

    // Use bookableresourceid as value to handle duplicate names
    const sortedResources = [...filtered]
        .filter((r) => r.name && r.id)
        .sort((a, b) => a.name.localeCompare(b.name));
    resourceCombo.items = sortedResources.map((r) => ({ value : r.id, text : r.name }));

    // Clear any resource selections that are no longer valid
    if (resourceCombo.value && resourceCombo.value.length > 0) {
        const validIds = new Set(sortedResources.map((r) => r.id));
        const validValues = resourceCombo.value.filter((v: string) => validIds.has(v));
        resourceCombo.value = validValues.length > 0 ? validValues : null;
    }
}

// ── Wire all filter combos ─────────────────────────────────────────

/**
 * Attach change listeners to all filter combos and restore from URL params.
 */
export function wireFilters(
    scheduler: SchedulerPro,
    histogram: ResourceHistogram,
    widgets: AppWidgetMap,
    useRemainingEffort: boolean,
    initialParams: FilterState
): void {
    const practiceCombo = widgets.practiceFilter;
    const roleCombo = widgets.roleFilter;
    const resourceCombo = widgets.resourceFilter;
    const flatResources = getFlatResources();

    // Helper to write filter state to URL
    const syncUrl = () => writeFiltersToUrl(widgets, scheduler, useRemainingEffort);

    // ── Practice filter ────────────────────────────────────────────
    if (practiceCombo) {
        const practiceNames = [
            ...new Set(flatResources.map((r) => r.practiceName).filter(Boolean))
        ].sort();
        practiceCombo.items = practiceNames.map((p) => ({ value : p, text : p }));

        practiceCombo.on('change', ({ value }: { value: string[] | null }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const store = (scheduler as any).project.resourceStore;
            store.removeFilter('practiceFilter');
            if (value && value.length > 0) {
                store.filter({
                    id       : 'practiceFilter',
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    filterBy : (r: any) => value.includes(r.practiceName)
                });

                setTimeout(() => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (scheduler as any).features.tree.expandToLevel(0);
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (histogram as any).features.tree.expandToLevel(0);
                }, 100);
            }

            // Update role filter options based on selected practices
            if (roleCombo) {
                const filteredResources = (value && value.length > 0)
                    ? flatResources.filter((r) => value.includes(r.practiceName))
                    : flatResources;
                const roleNames = [
                    ...new Set(filteredResources.map((r) => r.roleName).filter(Boolean))
                ].sort();
                roleCombo.items = roleNames.map((r) => ({ value : r, text : r }));

                if (roleCombo.value && roleCombo.value.length > 0) {
                    const validValues = roleCombo.value.filter((v) => roleNames.includes(v));
                    roleCombo.value = validValues.length > 0 ? validValues : null;
                }
            }

            updateResourceFilterItems(widgets);
            syncUrl();
        });
    }

    // ── Role filter ────────────────────────────────────────────────
    if (roleCombo) {
        const roleNames = [
            ...new Set(flatResources.map((r) => r.roleName).filter(Boolean))
        ].sort();
        roleCombo.items = roleNames.map((r) => ({ value : r, text : r }));

        roleCombo.on('change', ({ value }: { value: string[] | null }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const store = (scheduler as any).project.resourceStore;
            store.removeFilter('roleFilter');
            if (value && value.length > 0) {
                store.filter({
                    id       : 'roleFilter',
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    filterBy : (r: any) => value.includes(r.roleName)
                });

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                setTimeout(() => (scheduler as any).expandAll(), 100);
            }

            updateResourceFilterItems(widgets);
            syncUrl();
        });
    }

    // ── Resource filter ────────────────────────────────────────────
    if (resourceCombo) {
        // Use bookableresourceid as value to handle duplicate names
        const sortedResources = [...flatResources]
            .filter((r) => r.name && r.id)
            .sort((a, b) => a.name.localeCompare(b.name));
        resourceCombo.items = sortedResources.map((r) => ({ value : r.id, text : r.name }));

        resourceCombo.on('change', ({ value }: { value: string[] | null }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const store = (scheduler as any).project.resourceStore;
            store.removeFilter('resourceFilter');
            if (value && value.length > 0) {
                store.filter({
                    id       : 'resourceFilter',
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    filterBy : (r: any) => value.includes(r.id)
                });

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                setTimeout(() => (scheduler as any).expandAll(), 100);
            }

            syncUrl();
        });
    }

    // ── Allocation filter ──────────────────────────────────────────
    const allocationCombo = widgets.allocationFilter;
    if (allocationCombo) {
        allocationCombo.on('change', ({ value }: { value: string | null }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const store = (scheduler as any).project.resourceStore;
            store.removeFilter('allocationFilter');

            if (value && value !== 'all') {
                // Async: query histogram API for each leaf resource
                buildAllocationRows(store, histogram).then((rows) => {
                    const allocationMap = getAllocationStates(store, rows);

                    store.filter({
                        id       : 'allocationFilter',
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        filterBy : (r: any) => {
                            const state = allocationMap.get(r.id);
                            return state === value;
                        }
                    });

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    setTimeout(() => (scheduler as any).expandAll(), 100);
                });
            }

            syncUrl();
        });
    }

    // ── Restore filters from URL ───────────────────────────────────
    if (initialParams.practices.length > 0 && practiceCombo) {
        practiceCombo.value = initialParams.practices;
    }
    if (initialParams.roles.length > 0 && roleCombo) {
        roleCombo.value = initialParams.roles;
    }
    if (initialParams.resources.length > 0 && resourceCombo) {
        resourceCombo.value = initialParams.resources;
    }
    if (initialParams.allocation && initialParams.allocation !== 'all' && allocationCombo) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (allocationCombo as any).value = initialParams.allocation;

        // Histogram rows may not be rendered yet at this point.
        // Wait for histogram to render, then apply the allocation filter.

        const applyAllocationFilter = async() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const store = (scheduler as any).project.resourceStore;

            console.log('[filterManager] Applying allocation filter from URL:', initialParams.allocation);

            // Check if histogram has timeAxis with ticks
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (!(histogram as any)?.timeAxis?.ticks || (histogram as any).timeAxis.ticks.length === 0) {
                console.warn('[filterManager] Histogram timeAxis not yet available, deferring allocation filter');
                return false;
            }

            const rows = await buildAllocationRows(store, histogram);
            const allocationMap = getAllocationStates(store, rows);
            console.log('[filterManager] Allocation states computed:', allocationMap.size, 'resources');

            store.filter({
                id       : 'allocationFilter',
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                filterBy : (r: any) => {
                    const state = allocationMap.get(r.id);
                    const matches = state === initialParams.allocation;
                    return matches;
                }
            });
            return true;
        };

        // Try applying immediately (in case histogram is already rendered)
        applyAllocationFilter().then((applied) => {
            if (!applied) {
                // If histogram not ready, wait for renderRows event
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (histogram as any).on('renderRows', () => {
                    console.log('[filterManager] Histogram renderRows fired, applying deferred allocation filter');
                    applyAllocationFilter();
                }, { once : true });
            }
        });
    }
}

// ── Auto-expand tree if filters were restored ──────────────────────

/**
 * Auto-expand tree levels when filters are restored from URL params.
 * Must be called after scheduler + histogram are fully initialised.
 */
export function autoExpandForFilters(
    scheduler: SchedulerPro,
    histogram: ResourceHistogram,
    widgets: AppWidgetMap
): void {
    const hasActiveFilters =
        ((widgets.practiceFilter?.value?.length ?? 0) > 0) ||
        ((widgets.roleFilter?.value?.length ?? 0) > 0) ||
        ((widgets.resourceFilter?.value?.length ?? 0) > 0) ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (widgets.allocationFilter?.value && (widgets.allocationFilter as any).value !== 'all');

    if (hasActiveFilters) {
        setTimeout(() => {
            if ((widgets.practiceFilter?.value?.length ?? 0) > 0) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (scheduler as any).features.tree.expandToLevel(0);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (histogram as any).features.tree.expandToLevel(0);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (scheduler as any).expandAll();
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (histogram as any).expandAll();
            }
        }, 200);
    }
}
