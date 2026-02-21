import { SchedulerPro } from '@bryntum/schedulerpro';
import './style.css';
import { schedulerproConfig } from './schedulerproConfig';
import { signIn } from './auth.js';
import { getResources, getAssignments } from './crudFunctions.js';
import CustomEventModel from './lib/CustomEventModel.js';
import CustomResourceModel, { loadDefaultImage } from './lib/CustomResourceModel.js';
import { buildResourceTree } from './lib/buildResourceTree.js';

const signInLink = document.getElementById('signin');
const loaderContainer = document.querySelector('.loader-container');

// Keep raw data for regrouping without re-fetching
let rawResources = [];
let rawEvents = [];
let currentMode = 'resource'; // 'resource' or 'project'

/**
 * Apply a grouping mode to the scheduler, rebuilding the tree and event mappings.
 */
function applyGrouping(mode) {
    const scheduler = window.schedulerPro;
    if (!scheduler) return;

    currentMode = mode;

    // Build resource records from raw D365 data first, to resolve imageUrl etc.
    const tempResourceStore = scheduler.resourceStore;
    const resolvedResources = rawResources.map(raw => {
        const existing = tempResourceStore.getById(raw.bookableresourceid);
        if (existing) {
            return {
                id       : existing.id,
                name     : existing.name,
                imageUrl : existing.imageUrl
            };
        }
        return { id : raw.bookableresourceid, name : raw.name, imageUrl : null };
    });

    // Build resolved events from the event store (keeps mapped field values)
    const resolvedEvents = rawEvents.map(raw => {
        const id = raw.msdyn_resourceassignmentid;
        const existing = scheduler.eventStore.getById(id);
        if (existing) {
            return {
                id,
                startDate   : existing.startDate,
                endDate     : existing.endDate,
                name        : existing.name,
                projectName : existing.projectName,
                resourceId  : existing.data?.originalResourceId || raw._msdyn_bookableresourceid_value,
                effort      : existing.effort
            };
        }
        return raw;
    });

    const { treeData, remappedEvents, projectColorMap } = buildResourceTree(
        resolvedResources,
        resolvedEvents,
        mode
    );

    // Suspend rendering during data swap to avoid flicker
    scheduler.suspendRefresh();

    scheduler.resourceStore.tree = true;
    scheduler.resourceStore.data = treeData;
    scheduler.eventStore.data = remappedEvents.map(evt => ({
        ...evt,
        originalResourceId : evt.resourceId?.includes?.('____')
            ? evt.resourceId
            : evt.resourceId // preserve for later re-mapping
    }));

    scheduler.resumeRefresh(true);

    // Update toggle button text
    const toggleBtn = scheduler.widgetMap?.groupToggle;
    if (toggleBtn) {
        toggleBtn.text = mode === 'resource' ? 'Group by: Resource' : 'Group by: Project';
    }
}

// Wire up the toolbar toggle callback
window._onGroupToggle = (pressed) => {
    applyGrouping(pressed ? 'project' : 'resource');
};

async function displayUI() {
    console.log('[main] displayUI() called');
    const account = sessionStorage.getItem('msalAccount');
    if (!account) {
        console.log('[main] No account in sessionStorage, triggering sign-in…');
        await signIn();
    }
    console.log('[main] Authenticated – loading data…');
    signInLink.style = 'display: none';
    const content = document.getElementById('content');
    content.style = 'display: block';

    // Display Scheduler Pro after sign in
    // Wait for resources, bookings, and default image to load
    const [resourcesData, assignmentsData] = await Promise.all([
        getResources(),
        getAssignments(),
        loadDefaultImage().catch(() => {})
    ]);
    console.log(`[main] Loaded ${resourcesData.value.length} resources, ${assignmentsData.value.length} assignments`);

    // Store raw data for regrouping
    rawResources = resourcesData.value;
    rawEvents = assignmentsData.value;

    // Build initial tree from raw D365 data
    // First, create temporary mapped resources to resolve imageUrls
    const tempResourceModels = rawResources.map(raw => new CustomResourceModel(raw));
    const resolvedResources = tempResourceModels.map(r => ({
        id       : r.id,
        name     : r.name,
        imageUrl : r.imageUrl
    }));

    // Create temporary mapped events to resolve field values
    const tempEventModels = rawEvents.map(raw => new CustomEventModel(raw));
    const resolvedEvents = tempEventModels.map(e => ({
        id          : e.id,
        startDate   : e.startDate,
        endDate     : e.endDate,
        name        : e.name,
        projectName : e.projectName,
        resourceId  : e.resourceId,
        effort      : e.effort
    }));

    const { treeData, remappedEvents } = buildResourceTree(
        resolvedResources,
        resolvedEvents,
        currentMode
    );

    // Initialize Scheduler Pro with tree data
    window.schedulerPro = new SchedulerPro({
        ...schedulerproConfig,
        resourceStore : {
            tree       : true,
            modelClass : CustomResourceModel,
            data       : treeData
        },
        eventStore : {
            modelClass : CustomEventModel,
            data       : remappedEvents
        }
    });
    console.log('[main] SchedulerPro initialized');
}

if (sessionStorage.getItem('msalAccount')) {
    console.log('[main] Existing session found, restoring UI…');
    displayUI().catch(err => console.error('[main] displayUI error:', err));
    signInLink.style = 'display: none';
}
else {
    console.log('[main] No session – showing sign-in link');
    signInLink.style = 'display: block';
}

loaderContainer.style = 'display: none';

signInLink.addEventListener('click', displayUI);
