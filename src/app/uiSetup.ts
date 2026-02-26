/**
 * UI setup — zoom buttons, effort toggle, refresh button, histogram.
 *
 * Extracted from main.js's `displayUI()`.
 */

import { SchedulerPro, ResourceHistogram } from '@bryntum/schedulerpro';
import type { AppWidgetMap, BryntumButton } from '../types/bryntum.d';
import {
    getUseRemainingEffort,
    setUseRemainingEffort,
    clampStartToToday,
    calcUnits
} from './appState';
import { refreshAllData } from './dataLoader';
import { writeFiltersToUrl, updateResourceFilterItems } from './filterManager';
import type { FilterState } from '../lib/filterUtils';

// ── Zoom buttons ────────────────────────────────────────────────────

export function wireZoomButtons(
    scheduler: SchedulerPro,
    widgets: AppWidgetMap
): void {
    const zoomInBtn = widgets.zoomInButton;
    const zoomOutBtn = widgets.zoomOutButton;

    if (zoomInBtn) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        zoomInBtn.on('click', () => (scheduler as any).zoomIn());
    }
    if (zoomOutBtn) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        zoomOutBtn.on('click', () => (scheduler as any).zoomOut());
    }
}

// ── Zoom preset button group ────────────────────────────────────────

export function wireViewPresetGroup(
    scheduler: SchedulerPro,
    widgets: AppWidgetMap,
    initialParams: FilterState
): void {
    const viewPresetGroup = widgets.viewPresetGroup;
    if (!viewPresetGroup) return;

    // Restore zoom preset from URL param
    if (initialParams.zoom) {
        const targetBtn = viewPresetGroup.items.find(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (b: any) => b.dataset?.preset === initialParams.zoom
        );
        if (targetBtn) {
            targetBtn.pressed = true;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (scheduler as any).viewPreset = initialParams.zoom;
        }
    }

    viewPresetGroup.on('toggle', ({ source, pressed }: { source: BryntumButton; pressed: boolean }) => {
        if (pressed && source.dataset?.preset) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (scheduler as any).viewPreset = source.dataset.preset;
            writeFiltersToUrl(widgets, scheduler, getUseRemainingEffort());
            console.log(`[uiSetup] Zoom preset changed to ${source.dataset.preset}`);
        }
    });
}

// ── Effort toggle ───────────────────────────────────────────────────

export function wireEffortToggle(
    scheduler: SchedulerPro,
    widgets: AppWidgetMap
): void {
    const effortToggle = widgets.effortToggle;
    if (!effortToggle) return;

    effortToggle.checked = getUseRemainingEffort();

    effortToggle.on('change', async({ checked }: { checked: boolean }) => {
        setUseRemainingEffort(checked);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { assignmentStore, eventStore } = (scheduler as any).project;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        eventStore.forEach((event: any) => {
            if (event.originalStartDate) {
                const d365End = event.endDate;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                let newStart: any;
                if (checked && (event.effortRemaining ?? 0) > 0) {
                    newStart = clampStartToToday(event.originalStartDate);
                    if (new Date(newStart) > new Date(d365End)) {
                        newStart = d365End;
                    }
                }
                else {
                    newStart = event.originalStartDate;
                }
                const durationHours = (new Date(d365End).getTime() - new Date(newStart).getTime()) / (1000 * 60 * 60);
                event.set({
                    startDate : newStart,
                    duration  : durationHours,
                    endDate   : d365End
                });
            }
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        assignmentStore.forEach((assignment: any) => {
            const event = eventStore.getById(assignment.event?.id ?? assignment.event);
            if (event) {
                assignment.units = calcUnits(
                    event.effort,
                    event.effortRemaining,
                    event.originalStartDate || event.startDate,
                    event.endDate,
                    assignment.resource?.id ?? assignment.resource
                );
            }
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (scheduler as any).project.commitAsync();
        writeFiltersToUrl(widgets, scheduler, checked);
        console.log(`[uiSetup] Histogram switched to ${checked ? 'remaining effort' : 'total effort'}`);
    });
}

// ── Refresh button ──────────────────────────────────────────────────

export function wireRefreshButton(
    scheduler: SchedulerPro,
    widgets: AppWidgetMap
): void {
    const refreshBtn = widgets.refreshButton;
    if (!refreshBtn) return;

    refreshBtn.on('click', async() => {
        refreshBtn.disabled = true;
        refreshBtn.icon = 'fa fa-sync fa-spin';
        try {
            await refreshAllData(scheduler, widgets);
            updateResourceFilterItems(widgets);
        }
        catch (err) {
            console.error('[uiSetup] Refresh failed:', err);
        }
        finally {
            refreshBtn.icon = 'fa fa-sync';
            refreshBtn.disabled = false;
        }
    });
}

// ── Histogram creation + one-time refresh ───────────────────────────

export function createHistogram(
    scheduler: SchedulerPro,
    histogramConfig: Record<string, unknown>
): ResourceHistogram {
    const histogram = new ResourceHistogram({
        ...histogramConfig,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        project : (scheduler as any).project,
        partner : scheduler
    });
    console.log('[uiSetup] ResourceHistogram initialized');

    // One-time refresh so the leaf-state cache is populated for parent bar colors
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (histogram as any).on('renderRows', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setTimeout(() => (histogram as any).refresh(), 0);
    }, { once : true });

    return histogram;
}
