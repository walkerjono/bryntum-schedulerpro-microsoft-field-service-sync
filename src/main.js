import { SchedulerPro, ResourceHistogram } from '@bryntum/schedulerpro';
import './style.css';
import { schedulerproConfig, PROJECT_COLORS } from './schedulerproConfig';
import { histogramConfig } from './histogramConfig.js';
import { signIn } from './auth.js';
import {
    getResources,
    getAssignments,
    getResourcePractices
} from './crudFunctions.js';
import CustomEventModel from './lib/CustomEventModel.js';
import CustomResourceModel, {
    loadDefaultImage
} from './lib/CustomResourceModel.js';

const signInLink = document.getElementById('signin');
const loaderContainer = document.querySelector('.loader-container');

// Default from env var; may be overridden by URL param or runtime toggle
let useRemainingEffort = import.meta.env.VITE_USE_EFFORT_REMAINING === 'true';

// Apply URL override immediately so initial data processing uses the correct flag
{
    const effortParam = new URLSearchParams(window.location.search).get('useRemainingEffort');
    if (effortParam != null) {
        useRemainingEffort = effortParam === 'true';
    }
}

// When using effort remaining mode, offset the start date by this many days in the past.
// Set to 0 for current behavior (reset to today), positive values go N days into the past,
// negative values go N days into the future.
const EFFORT_REMAINING_OFFSET_DAYS = 7;

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
    content.style = 'display: flex';

    // ── Fetch data in parallel ──────────────────────────────────────────
    const [resourcesData, assignmentsData, practiceRoleResult] =
    await Promise.all([
        getResources(),
        getAssignments(),
        getResourcePractices().catch((err) => {
            console.warn(
                '[main] Failed to load practices, continuing without practice grouping:',
                err
            );
            return { practiceMap : new Map(), roleMap : new Map() };
        }),
        loadDefaultImage().catch(() => {})
    ]);

    const { practiceMap, roleMap } = practiceRoleResult;
    console.log(
    `[main] Loaded ${resourcesData.value.length} resources, ${assignmentsData.value.length} assignments, ${practiceMap.size} practice mappings, ${roleMap.size} role mappings`
    );

    // ── Helper: count weekdays (Mon–Fri) between two dates ──────────────
    function countWeekdays(start, end) {
        let count = 0;
        const d = new Date(start);
        const endTime = new Date(end).getTime();
        while (d.getTime() < endTime) {
            const day = d.getDay();
            if (day !== 0 && day !== 6) count++;
            d.setDate(d.getDate() + 1);
        }
        return count || 1; // at least 1 to avoid division by zero
    }

    const HOURS_PER_DAY = 8;

    /**
     * Return the later of `date` and the offset date (midnight-normalised).
     * When using remaining effort we assume no past work remains, so the
     * effective start of an assignment is at earliest EFFORT_REMAINING_OFFSET_DAYS days ago.
     */
    function clampStartToToday(date) {
        const offsetDate = new Date();
        offsetDate.setHours(0, 0, 0, 0);
        offsetDate.setDate(offsetDate.getDate() - EFFORT_REMAINING_OFFSET_DAYS);
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        return d.getTime() < offsetDate.getTime() ? offsetDate : d;
    }

    /**
     * Calculate allocation % (units) for a single assignment.
     * Reads the module-level `useRemainingEffort` flag to choose the effort source.
     * When remaining-effort mode is active the start date is clamped to today so
     * effort is spread only over future working days.
     */
    function calcUnits(effort, effortRemaining, startDate, endDate) {
        const effortSource = useRemainingEffort ? (effortRemaining ?? 0) : effort;
        const effectiveStart = useRemainingEffort ? clampStartToToday(startDate) : startDate;
        const workingDays  = countWeekdays(effectiveStart, endDate);
        const workingHours = workingDays * HOURS_PER_DAY;
        return effortSource > 0 ? (effortSource / workingHours) * 100 : 0;
    }

    // ── Resolve events via temporary CustomEventModel (runs convert fns) ─
    const resolvedEvents = [];
    const assignments = [];

    assignmentsData.value.forEach((raw) => {
        const e = new CustomEventModel(raw);

        // Only shift start date for incomplete assignments with remaining effort.
        // Completed assignments (effortRemaining === 0) keep their original D365 dates.
        let effectiveStart = e.startDate;
        if (useRemainingEffort && (e.effortRemaining ?? 0) > 0) {
            effectiveStart = clampStartToToday(e.startDate);
        }
        // Ensure start never exceeds end to avoid scheduling errors
        if (new Date(effectiveStart) > new Date(e.endDate)) {
            effectiveStart = e.endDate;
        }
        // Calculate allocation % so the histogram shows correct effort per tick.
        const units = calcUnits(e.effort, e.effortRemaining, e.startDate, e.endDate);
        // Calculate duration in hours (durationUnit is 'hour')
        const durationHours = (new Date(e.endDate) - new Date(effectiveStart)) / (1000 * 60 * 60);
        resolvedEvents.push({
            id                : e.id,
            startDate         : effectiveStart,
            originalStartDate : e.startDate,
            endDate           : e.endDate,
            duration          : durationHours,
            durationUnit      : 'hour',
            name              : e.name,
            projectName       : e.projectName,
            projectNumber     : e.projectNumber,
            clientName        : e.clientName,
            effort            : e.effort,
            effortRemaining   : e.effortRemaining,
            taskNumber        : e.taskNumber,
            manuallyScheduled : true
        });

        // Units lives on the AssignmentModel, not the EventModel.
        assignments.push({
            id       : `assign-${e.id}`,
            event    : e.id,
            resource : e.resourceId,
            units
        });
    });

    // ── Build a project → colour lookup ─────────────────────────────────
    const projectNames = [
        ...new Set(resolvedEvents.map((e) => e.projectName).filter(Boolean))
    ].sort();
    const projectColorMap = new Map();
    projectNames.forEach((p, i) =>
        projectColorMap.set(p, PROJECT_COLORS[i % PROJECT_COLORS.length])
    );

    // Assign an eventColor per event based on its project
    resolvedEvents.forEach((e) => {
        e.eventColor = projectColorMap.get(e.projectName) || '#888';
    });

    // ── Build flat resource array with pre-baked fields ─────────────────
    const tempResourceModels = resourcesData.value.map(
        (raw) => new CustomResourceModel(raw)
    );
    let flatResources = resourcesData.value.map((raw, i) => {
        const model = tempResourceModels[i];
        const id = raw.bookableresourceid;

        // Resolve imageUrl via the model (uses defaultResourceImageBase64 fallback)
        let imageUrl = null;
        const entityImage = raw.ContactId?.entityimage;
        if (entityImage) {
            imageUrl = `data:image/jpeg;base64,${entityImage}`;
        }
        else {
            // Use model's imageUrl which may have been set by loadDefaultImage
            imageUrl = model.imageUrl || null;
        }

        return {
            id,
            name         : raw.name || 'Unnamed',
            imageUrl,
            practiceName : practiceMap.get(id) || 'Unassigned',
            roleName     : roleMap.get(id) || 'Unassigned',
            workingHours : raw.ws_workinghours ?? 40
        };
    });

    // ── Build working-time calendars ────────────────────────────────────
    // Default business calendar: Mon–Fri, 8h/day (08:00–16:00).
    // unspecifiedTimeIsWorking: false means only the explicit working
    // intervals count — so the engine sees 8h per weekday, not 24h.
    const businessCalendar = {
        id                       : 'business',
        name                     : 'Standard (40h)',
        unspecifiedTimeIsWorking : false,
        intervals                : [
            {
                recurrentStartDate : 'every weekday at 08:00',
                recurrentEndDate   : 'every weekday at 16:00',
                isWorking          : true
            }
        ]
    };

    const calendars = [businessCalendar];

    // Generate per-resource calendars for non-standard working hours
    flatResources.forEach((r) => {
        if (r.workingHours !== 40) {
            const calId = `calendar-${r.id}`;
            const hrsPerDay = r.workingHours / 5;
            const endHour   = Math.floor(8 + hrsPerDay);
            const endMinute = Math.round((hrsPerDay % 1) * 60);
            calendars.push({
                id                       : calId,
                name                     : `Custom (${r.workingHours}h)`,
                unspecifiedTimeIsWorking : false,
                intervals                : [
                    {
                        recurrentStartDate : 'every weekday at 08:00',
                        recurrentEndDate   : `every weekday at ${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`,
                        isWorking          : true
                    }
                ]
            });
            r.calendar = calId;
        }
    });

    // ── Create SchedulerPro (flat store + TreeGroup) ────────────────────
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

    // Wait for the scheduling engine to resolve all data
    await scheduler.project.commitAsync();
    console.log('[main] SchedulerPro initialized');

    // ── Helper: sync filter values to/from URL query parameters ────────
    function readFilterParams() {
        const params = new URLSearchParams(window.location.search);
        const effortParam = params.get('useRemainingEffort');
        return {
            practices          : params.get('practice')?.split(',').filter(Boolean) || [],
            roles              : params.get('role')?.split(',').filter(Boolean) || [],
            resources          : params.get('resource')?.split(',').filter(Boolean) || [],
            useRemainingEffort : effortParam != null ? effortParam === 'true' : null
        };
    }

    function writeFilterParams() {
        const params   = new URLSearchParams(window.location.search);
        const pValues  = practiceCombo?.value;
        const rValues  = roleCombo?.value;
        const resValues = resourceCombo?.value;

        if (pValues && pValues.length > 0) {
            params.set('practice', pValues.join(','));
        }
        else {
            params.delete('practice');
        }

        if (rValues && rValues.length > 0) {
            params.set('role', rValues.join(','));
        }
        else {
            params.delete('role');
        }

        if (resValues && resValues.length > 0) {
            params.set('resource', resValues.join(','));
        }
        else {
            params.delete('resource');
        }

        if (useRemainingEffort) {
            params.set('useRemainingEffort', 'true');
        }
        else {
            params.delete('useRemainingEffort');
        }

        const qs = params.toString();
        const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
        window.history.replaceState(null, '', url);
    }

    const initialParams = readFilterParams();

    // Override env-var default with URL param if present
    if (initialParams.useRemainingEffort != null) {
        useRemainingEffort = initialParams.useRemainingEffort;
    }

    // ── Filter combos (declare early so cascading references work) ────
    const roleCombo     = scheduler.widgetMap.roleFilter;
    const resourceCombo = scheduler.widgetMap.resourceFilter;

    // ── Practice filter ─────────────────────────────────────────────────
    const practiceCombo = scheduler.widgetMap.practiceFilter;
    if (practiceCombo) {
        const practiceNames = [
            ...new Set(flatResources.map((r) => r.practiceName).filter(Boolean))
        ].sort();
        practiceCombo.items = practiceNames.map((p) => ({ value : p, text : p }));

        practiceCombo.on('change', ({ value }) => {
            const store = scheduler.project.resourceStore;
            store.removeFilter('practiceFilter');
            if (value && value.length > 0) {
                store.filter({
                    id       : 'practiceFilter',
                    filterBy : (r) => value.includes(r.practiceName)
                });

                // Auto-expand filtered tree
                scheduler.expandAll();
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

                // Clear any role selections that are no longer valid
                if (roleCombo.value && roleCombo.value.length > 0) {
                    const validValues = roleCombo.value.filter((v) => roleNames.includes(v));
                    roleCombo.value = validValues.length > 0 ? validValues : null;
                }
            }

            // Update resource filter options based on selected practices
            updateResourceFilterItems();

            writeFilterParams();
        });
    }

    // ── Role filter listener ──────────────────────────────────────────
    if (roleCombo) {
        const roleNames = [
            ...new Set(flatResources.map((r) => r.roleName).filter(Boolean))
        ].sort();
        roleCombo.items = roleNames.map((r) => ({ value : r, text : r }));

        roleCombo.on('change', ({ value }) => {
            const store = scheduler.project.resourceStore;
            store.removeFilter('roleFilter');
            if (value && value.length > 0) {
                store.filter({
                    id       : 'roleFilter',
                    filterBy : (r) => value.includes(r.roleName)
                });

                // Auto-expand filtered tree
                scheduler.expandAll();
            }

            // Update resource filter options based on selected roles
            updateResourceFilterItems();

            writeFilterParams();
        });
    }

    // ── Helper: rebuild resource filter items based on active practice/role selections ──
    function updateResourceFilterItems() {
        if (!resourceCombo) return;
        let filtered = flatResources;
        const pv = practiceCombo?.value;
        const rv = roleCombo?.value;
        if (pv && pv.length > 0) {
            filtered = filtered.filter((r) => pv.includes(r.practiceName));
        }
        if (rv && rv.length > 0) {
            filtered = filtered.filter((r) => rv.includes(r.roleName));
        }
        const resourceNames = [
            ...new Set(filtered.map((r) => r.name).filter(Boolean))
        ].sort();
        resourceCombo.items = resourceNames.map((n) => ({ value : n, text : n }));

        // Clear any resource selections that are no longer valid
        if (resourceCombo.value && resourceCombo.value.length > 0) {
            const validValues = resourceCombo.value.filter((v) => resourceNames.includes(v));
            resourceCombo.value = validValues.length > 0 ? validValues : null;
        }
    }

    // ── Resource filter listener ────────────────────────────────────────
    if (resourceCombo) {
        const resourceNames = [
            ...new Set(flatResources.map((r) => r.name).filter(Boolean))
        ].sort();
        resourceCombo.items = resourceNames.map((n) => ({ value : n, text : n }));

        resourceCombo.on('change', ({ value }) => {
            const store = scheduler.project.resourceStore;
            store.removeFilter('resourceFilter');
            if (value && value.length > 0) {
                store.filter({
                    id       : 'resourceFilter',
                    filterBy : (r) => value.includes(r.name)
                });

                // Auto-expand filtered tree
                scheduler.expandAll();
            }
            else {
                // When no resources selected, collapse all (optional)
                // scheduler.getGrid().collapseAll();
            }

            writeFilterParams();
        });
    }

    // ── Restore filters from URL query parameters ───────────────────────
    if (initialParams.practices.length > 0 && practiceCombo) {
        practiceCombo.value = initialParams.practices;
    }
    if (initialParams.roles.length > 0 && roleCombo) {
        roleCombo.value = initialParams.roles;
    }
    if (initialParams.resources.length > 0 && resourceCombo) {
        resourceCombo.value = initialParams.resources;
    }

    // ── Effort / Remaining Effort toggle ────────────────────────────────
    const effortToggle = scheduler.widgetMap.effortToggle;
    if (effortToggle) {
        // Restore toggle state from URL param (or env-var default already applied)
        effortToggle.checked = useRemainingEffort;

        effortToggle.on('change', async({ checked }) => {
            useRemainingEffort = checked;

            // Shift event start dates: clamp to today when remaining-effort is
            // active, or restore the original D365 start date when toggled off.
            // Skip completed assignments (effortRemaining === 0) – they keep D365 dates.
            // IMPORTANT: batch-set startDate + duration together so the engine
            // doesn't recalculate endDate from the old duration.
            const { assignmentStore, eventStore } = scheduler.project;
            eventStore.forEach((event) => {
                if (event.originalStartDate) {
                    const d365End = event.endDate;
                    let newStart;
                    if (checked && (event.effortRemaining ?? 0) > 0) {
                        newStart = clampStartToToday(event.originalStartDate);
                        // Ensure start never exceeds end
                        if (new Date(newStart) > new Date(d365End)) {
                            newStart = d365End;
                        }
                    }
                    else {
                        newStart = event.originalStartDate;
                    }
                    const durationHours = (new Date(d365End) - new Date(newStart)) / (1000 * 60 * 60);
                    event.set({
                        startDate : newStart,
                        duration  : durationHours,
                        endDate   : d365End
                    });
                }
            });

            // Recalculate units for every existing assignment
            assignmentStore.forEach((assignment) => {
                const event = eventStore.getById(assignment.event?.id ?? assignment.event);
                if (event) {
                    assignment.units = calcUnits(
                        event.effort,
                        event.effortRemaining,
                        event.originalStartDate || event.startDate,
                        event.endDate
                    );
                }
            });

            await scheduler.project.commitAsync();
            // Debug: Log all event records after toggle
            writeFilterParams();
            console.log(`[main] Histogram switched to ${checked ? 'remaining effort' : 'total effort'}`);
        });
    }

    // ── Refresh button ──────────────────────────────────────────────────
    const refreshBtn = scheduler.widgetMap.refreshButton;
    if (refreshBtn) {
        refreshBtn.on('click', async() => {
            refreshBtn.disabled = true;
            refreshBtn.icon = 'fa fa-sync fa-spin';
            try {
                console.log('[main] Refreshing data…');

                const [newResources, newAssignments, newPracticeRoleResult] =
                    await Promise.all([
                        getResources(),
                        getAssignments(),
                        getResourcePractices().catch((err) => {
                            console.warn('[main] Failed to refresh practices:', err);
                            return { practiceMap : new Map(), roleMap : new Map() };
                        })
                    ]);

                const { practiceMap: newPracticeMap, roleMap: newRoleMap } = newPracticeRoleResult;

                // Re-resolve events
                const newResolvedEvents = [];
                const newAssignmentRecords = [];

                newAssignments.value.forEach((raw) => {
                    const e = new CustomEventModel(raw);
                    // Only shift start for incomplete assignments with remaining effort
                    let effectiveStart = e.startDate;
                    if (useRemainingEffort && (e.effortRemaining ?? 0) > 0) {
                        effectiveStart = clampStartToToday(e.startDate);
                    }
                    // Ensure start never exceeds end
                    if (new Date(effectiveStart) > new Date(e.endDate)) {
                        effectiveStart = e.endDate;
                    }
                    const units = calcUnits(e.effort, e.effortRemaining, e.startDate, e.endDate);
                    // Calculate duration in hours (durationUnit is 'hour')
                    const durationHours = (new Date(e.endDate) - new Date(effectiveStart)) / (1000 * 60 * 60);
                    newResolvedEvents.push({
                        id                : e.id,
                        startDate         : effectiveStart,
                        originalStartDate : e.startDate,
                        endDate           : e.endDate,
                        duration          : durationHours,
                        durationUnit      : 'hour',
                        name              : e.name,
                        projectName       : e.projectName,
                        projectNumber     : e.projectNumber,
                        clientName        : e.clientName,
                        effort            : e.effort,
                        effortRemaining   : e.effortRemaining,
                        taskNumber        : e.taskNumber,
                        manuallyScheduled : true
                    });

                    newAssignmentRecords.push({
                        id       : `assign-${e.id}`,
                        event    : e.id,
                        resource : e.resourceId,
                        units
                    });
                });

                // Re-apply project colours
                const newProjectNames = [
                    ...new Set(newResolvedEvents.map((e) => e.projectName).filter(Boolean))
                ].sort();
                const newProjectColorMap = new Map();
                newProjectNames.forEach((p, i) =>
                    newProjectColorMap.set(p, PROJECT_COLORS[i % PROJECT_COLORS.length])
                );
                newResolvedEvents.forEach((e) => {
                    e.eventColor = newProjectColorMap.get(e.projectName) || '#888';
                });

                // Re-build flat resources
                const newTempModels = newResources.value.map((raw) => new CustomResourceModel(raw));
                const newFlatResources = newResources.value.map((raw, i) => {
                    const model = newTempModels[i];
                    const id = raw.bookableresourceid;
                    let imageUrl = null;
                    const entityImage = raw.ContactId?.entityimage;
                    if (entityImage) {
                        imageUrl = `data:image/jpeg;base64,${entityImage}`;
                    }
                    else {
                        imageUrl = model.imageUrl || null;
                    }
                    return {
                        id,
                        name         : raw.name || 'Unnamed',
                        imageUrl,
                        practiceName : newPracticeMap.get(id) || 'Unassigned',
                        roleName     : newRoleMap.get(id) || 'Unassigned',
                        workingHours : raw.ws_workinghours ?? 40
                    };
                });

                // Update stores
                scheduler.project.assignmentStore.removeAll();
                scheduler.project.eventStore.removeAll();
                scheduler.project.resourceStore.data = newFlatResources;
                scheduler.project.eventStore.data = newResolvedEvents;
                scheduler.project.assignmentStore.data = newAssignmentRecords;
                await scheduler.project.commitAsync();

                // Refresh practice filter options
                if (practiceCombo) {
                    const updatedPractices = [
                        ...new Set(newFlatResources.map((r) => r.practiceName).filter(Boolean))
                    ].sort();
                    practiceCombo.items = updatedPractices.map((p) => ({ value : p, text : p }));
                }

                // Update flatResources reference so filters use fresh data
                flatResources = newFlatResources;

                // Refresh role filter options
                if (roleCombo) {
                    const updatedRoles = [
                        ...new Set(newFlatResources.map((r) => r.roleName).filter(Boolean))
                    ].sort();
                    roleCombo.items = updatedRoles.map((r) => ({ value : r, text : r }));
                }

                // Refresh resource filter options
                updateResourceFilterItems();

                console.log('[main] Data refreshed successfully');
            }
            catch (err) {
                console.error('[main] Refresh failed:', err);
            }
            finally {
                refreshBtn.icon = 'fa fa-sync';
                refreshBtn.disabled = false;
            }
        });
    }

    // ── Create partnered ResourceHistogram ───────────────────────────────
    const histogram = new ResourceHistogram({
        ...histogramConfig,
        project : scheduler.project,
        partner : scheduler
    });
    console.log('[main] ResourceHistogram initialized');

    // Expose for debugging
    window.schedulerPro = scheduler;
    window.histogram = histogram;
}

if (sessionStorage.getItem('msalAccount')) {
    console.log('[main] Existing session found, restoring UI…');
    displayUI().catch((err) => console.error('[main] displayUI error:', err));
    signInLink.style = 'display: none';
}
else {
    console.log('[main] No session – showing sign-in link');
    signInLink.style = 'display: block';
}

loaderContainer.style = 'display: none';

signInLink.addEventListener('click', displayUI);
