/**
 * Application entry point.
 *
 * This is the slim orchestrator that wires together the decomposed
 * modules under app/.  It replaces the monolithic main.js.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { SchedulerPro } from '@bryntum/schedulerpro';
import './style.css';
import { schedulerproConfig } from './app/schedulerproConfig';
import { histogramConfig } from './app/histogramConfig';
import { signIn } from './app/auth';
import CustomEventModel from './lib/CustomEventModel';
import CustomResourceModel from './lib/CustomResourceModel';
import {
    getUseRemainingEffort,
    setUseRemainingEffort,
    HOURS_PER_DAY
} from './app/appState';
import { loadInitialData, attachDateRangeListener } from './app/dataLoader';
import {
    readFiltersFromUrl,
    wireFilters,
    autoExpandForFilters
} from './app/filterManager';
import {
    wireZoomButtons,
    wireViewPresetGroup,
    wireEffortToggle,
    wireRefreshButton,
    createHistogram
} from './app/uiSetup';
import type { AppWidgetMap } from './types/bryntum.d';

const signInLink = typeof document !== 'undefined' ? document.getElementById('signin') : null;
const loaderContainer = typeof document !== 'undefined' ? document.querySelector('.loader-container') as HTMLElement | null : null;

async function displayUI(): Promise<void> {
    console.log('[main] displayUI() called');
    const account = sessionStorage.getItem('msalAccount');
    if (!account) {
        console.log('[main] No account in sessionStorage, triggering sign-in…');
        await signIn();
    }
    console.log('[main] Authenticated – loading data…');
    signInLink!.style.display = 'none';
    const content = document.getElementById('content')!;
    content.style.display = 'flex';

    // ── Read URL filter state ───────────────────────────────────────
    const initialParams = readFiltersFromUrl();
    if (initialParams.useRemainingEffort != null) {
        setUseRemainingEffort(initialParams.useRemainingEffort);
    }

    // ── Fetch initial data ──────────────────────────────────────────
    const { flatResources, resolvedEvents, assignments, calendars } =
        await loadInitialData();

    // ── Create SchedulerPro ─────────────────────────────────────────
    const scheduler = new SchedulerPro({
        ...schedulerproConfig,
        project : {
            calendar      : 'business',
            hoursPerDay   : HOURS_PER_DAY,
            daysPerWeek   : 5,
            calendars,
            resourceStore : {
                modelClass : CustomResourceModel,
                data       : flatResources,
                sorters    : [
                    { field : 'practiceName', ascending : true },
                    { field : 'roleName', ascending : true },
                    { field : 'name', ascending : true }
                ]
            },
            eventStore : {
                modelClass : CustomEventModel,
                data       : resolvedEvents
            },
            assignmentStore : {
                data : assignments
            }
        }
    });

    await (scheduler as any).project.commitAsync();
    console.log('[main] SchedulerPro initialized');

    // ── Gather widgets ──────────────────────────────────────────────
    const widgets: AppWidgetMap = {
        practiceFilter  : (scheduler as any).widgetMap.practiceFilter,
        roleFilter      : (scheduler as any).widgetMap.roleFilter,
        resourceFilter  : (scheduler as any).widgetMap.resourceFilter,
        effortToggle    : (scheduler as any).widgetMap.effortToggle,
        refreshButton   : (scheduler as any).widgetMap.refreshButton,
        zoomInButton    : (scheduler as any).widgetMap.zoomInButton,
        zoomOutButton   : (scheduler as any).widgetMap.zoomOutButton,
        viewPresetGroup : (scheduler as any).widgetMap.viewPresetGroup
    };

    // ── Wire viewport-based incremental fetch ───────────────────────
    attachDateRangeListener(scheduler);

    // ── Create partnered ResourceHistogram ───────────────────────────
    const histogram = createHistogram(scheduler, histogramConfig);

    // ── Wire filters ────────────────────────────────────────────────
    wireFilters(scheduler, histogram, widgets, getUseRemainingEffort(), initialParams);

    // ── Wire zoom / preset buttons ──────────────────────────────────
    wireZoomButtons(scheduler, widgets);
    wireViewPresetGroup(scheduler, widgets, initialParams);

    // ── Wire effort toggle + refresh ────────────────────────────────
    wireEffortToggle(scheduler, widgets);
    wireRefreshButton(scheduler, widgets);

    // ── Auto-expand tree if filters were restored ───────────────────
    autoExpandForFilters(scheduler, histogram, widgets);

    // Expose for debugging
    (window as any).schedulerPro = scheduler;
    (window as any).histogram = histogram;
}

// ── Boot sequence ───────────────────────────────────────────────────
if (typeof document !== 'undefined' && signInLink) {
    if (sessionStorage.getItem('msalAccount')) {
        console.log('[main] Existing session found, restoring UI…');
        displayUI().catch((err) => console.error('[main] displayUI error:', err));
        signInLink.style.display = 'none';
    }
    else {
        console.log('[main] No session – showing sign-in link');
        signInLink.style.display = 'block';
    }

    if (loaderContainer) loaderContainer.style.display = 'none';

    signInLink.addEventListener('click', displayUI);
}
