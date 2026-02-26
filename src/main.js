import { SchedulerPro, ResourceHistogram } from '@bryntum/schedulerpro';
import './style.css';
import { schedulerproConfig, PROJECT_COLORS, VIEWPORT_BUFFER_DAYS } from './schedulerproConfig';
import { histogramConfig, clearLeafStateCache } from './histogramConfig.js';
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

// When using effort remaining mode, determine the offset for the effective start date.
// Accepts a number of days (positive = past, negative = future, 0 = today)
// or "current_week" to snap to the Monday of the current week.
const EFFORT_REMAINING_OFFSET_RAW = (import.meta.env.VITE_EFFORT_REMAINING_OFFSET_DAYS || '7').trim();
const EFFORT_REMAINING_USE_CURRENT_WEEK = EFFORT_REMAINING_OFFSET_RAW.toLowerCase() === 'current_week';
const EFFORT_REMAINING_OFFSET_DAYS = EFFORT_REMAINING_USE_CURRENT_WEEK ? 0 : (Number(EFFORT_REMAINING_OFFSET_RAW) || 7);

// ── Viewport-based date filtering state ─────────────────────────────
// Tracks which date range has already been fetched from the API so we
// only request slices we haven't seen yet.
let fetchedRange = { start : null, end : null };

// Mutable project-colour map — survives incremental loads so existing
// colours stay stable as new projects appear during scroll fetches.
let projectColorMap = new Map();
let projectColorNextIndex = 0;

/**
 * Compute the buffered date window for OData queries.
 * Extends the given start/end by VIEWPORT_BUFFER_DAYS on each side.
 */
function computeBufferedRange(start, end) {
    const bufStart = new Date(start);
    bufStart.setDate(bufStart.getDate() - VIEWPORT_BUFFER_DAYS);
    const bufEnd = new Date(end);
    bufEnd.setDate(bufEnd.getDate() + VIEWPORT_BUFFER_DAYS);
    return { start : bufStart, end : bufEnd };
}

/**
 * Assign a colour to a project name (stable across incremental loads).
 * Known projects keep their existing colour; new ones get the next
 * colour from the palette.
 */
function getProjectColor(projectName) {
    if (!projectName) return '#888';
    if (projectColorMap.has(projectName)) return projectColorMap.get(projectName);
    const color = PROJECT_COLORS[projectColorNextIndex % PROJECT_COLORS.length];
    projectColorMap.set(projectName, color);
    projectColorNextIndex++;
    return color;
}

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
    // Use the scheduler's configured start/end + buffer for the initial assignment fetch
    const initialRange = computeBufferedRange(
        schedulerproConfig.startDate,
        schedulerproConfig.endDate
    );

    const [resourcesData, assignmentsData, practiceRoleResult] =
    await Promise.all([
        getResources(),
        getAssignments({ rangeStart : initialRange.start, rangeEnd : initialRange.end }),
        getResourcePractices().catch((err) => {
            console.warn(
                '[main] Failed to load practices, continuing without practice grouping:',
                err
            );
            return { practiceMap : new Map(), roleMap : new Map() };
        }),
        loadDefaultImage().catch(() => {})
    ]);

    // Record what we've fetched so the scroll listener knows the boundary
    fetchedRange = { start : initialRange.start, end : initialRange.end };

    const { practiceMap, roleMap } = practiceRoleResult;
    console.log(
    `[main] Loaded ${resourcesData.value.length} resources, ${assignmentsData.value.length} assignments, ${practiceMap.size} practice mappings, ${roleMap.size} role mappings`
    );

    // ── Build resource → hours-per-day lookup (needed before event resolution) ──
    // Maps resourceId → hoursPerDay so calcUnits uses the resource's actual
    // calendar capacity instead of the global default.
    let resourceHoursMap = new Map();
    for (const raw of resourcesData.value) {
        const wh = raw.ws_workinghours || 40; // || so 0 and null both fall back to 40
        resourceHoursMap.set(raw.bookableresourceid, wh / 5);
    }
    console.log(`[main] Built resourceHoursMap for ${resourceHoursMap.size} resources`);

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

    const HOURS_PER_DAY = Number(import.meta.env.VITE_HOURS_PER_DAY) || 8;

    /**
     * Return the later of `date` and the offset date (midnight-normalised).
     * When using remaining effort we assume no past work remains, so the
     * effective start of an assignment is at earliest the offset date.
     *
     * The offset date is computed as:
     *  - "current_week" → Monday 00:00 of the current week
     *  - A number N     → today minus N days
     */
    function clampStartToToday(date) {
        let offsetDate;
        if (EFFORT_REMAINING_USE_CURRENT_WEEK) {
            offsetDate = new Date();
            offsetDate.setHours(0, 0, 0, 0);
            // getDay(): 0 = Sun, 1 = Mon … 6 = Sat → shift back to Monday
            const dayOfWeek = offsetDate.getDay();
            const daysFromMonday = (dayOfWeek + 6) % 7; // Mon=0 … Sun=6
            offsetDate.setDate(offsetDate.getDate() - daysFromMonday);
        }
        else {
            offsetDate = new Date();
            offsetDate.setHours(0, 0, 0, 0);
            offsetDate.setDate(offsetDate.getDate() - EFFORT_REMAINING_OFFSET_DAYS);
        }
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
    function calcUnits(effort, effortRemaining, startDate, endDate, resourceId) {
        const effortSource = useRemainingEffort ? (effortRemaining ?? 0) : effort;
        const effectiveStart = useRemainingEffort ? clampStartToToday(startDate) : startDate;
        const workingDays  = countWeekdays(effectiveStart, endDate);
        // Use the resource's actual hours-per-day from their calendar,
        // falling back to the global default for unknown resources.
        const hrsPerDay    = resourceHoursMap.get(resourceId) || HOURS_PER_DAY;
        const workingHours = workingDays * hrsPerDay;
        const rawUnits = effortSource > 0 && workingHours > 0 ? (effortSource / workingHours) * 100 : 0;
        return Number.isFinite(rawUnits) ? rawUnits : 0;
    }

    // ── Resolve events via temporary CustomEventModel (runs convert fns) ─
    const resolvedEvents = [];
    const assignments = [];

    assignmentsData.value.forEach((raw) => {
        const e = new CustomEventModel(raw);

        // Skip records with invalid date ranges (bad D365 data)
        if (e.startDate && e.endDate && new Date(e.startDate) > new Date(e.endDate)) {
            console.warn(`[crud] Skipping assignment ${e.id} — startDate (${e.startDate}) > endDate (${e.endDate})`);
            return;
        }

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
        const units = calcUnits(e.effort, e.effortRemaining, e.startDate, e.endDate, e.resourceId);
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
    // Reset colour state for initial load — incremental fetches will append
    projectColorMap = new Map();
    projectColorNextIndex = 0;

    // Assign an eventColor per event based on its project (stable colour fn)
    resolvedEvents.forEach((e) => {
        e.eventColor = getProjectColor(e.projectName);
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
            workingHours : raw.ws_workinghours || 40,
            calendar     : 'business'
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
            const endTimeStr = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
            calendars.push({
                id                       : calId,
                name                     : `Custom (${r.workingHours}h)`,
                unspecifiedTimeIsWorking : false,
                intervals                : [
                    {
                        recurrentStartDate : 'every weekday at 08:00',
                        recurrentEndDate   : `every weekday at ${endTimeStr}`,
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

    // ── Viewport-based incremental fetch ────────────────────────────────
    /**
     * Transform raw D365 assignment records into resolved event + assignment
     * objects ready for the Bryntum stores.  Returns { events, assignments }.
     */
    function resolveRawAssignments(rawRecords) {
        const events = [];
        const assgn  = [];

        rawRecords.forEach((raw) => {
            const e = new CustomEventModel(raw);

            // Skip records with invalid date ranges (bad D365 data)
            if (e.startDate && e.endDate && new Date(e.startDate) > new Date(e.endDate)) {
                console.warn(`[crud] Skipping assignment ${e.id} — startDate (${e.startDate}) > endDate (${e.endDate})`);
                return;
            }

            let effectiveStart = e.startDate;
            if (useRemainingEffort && (e.effortRemaining ?? 0) > 0) {
                effectiveStart = clampStartToToday(e.startDate);
            }
            if (new Date(effectiveStart) > new Date(e.endDate)) {
                effectiveStart = e.endDate;
            }

            const units         = calcUnits(e.effort, e.effortRemaining, e.startDate, e.endDate, e.resourceId);
            const durationHours = (new Date(e.endDate) - new Date(effectiveStart)) / (1000 * 60 * 60);

            events.push({
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
                manuallyScheduled : true,
                eventColor        : getProjectColor(e.projectName)
            });

            assgn.push({
                id       : `assign-${e.id}`,
                event    : e.id,
                resource : e.resourceId,
                units
            });
        });

        return { events, assignments : assgn };
    }

    /**
     * Fetch assignments for an unfetched date slice and merge them into
     * the live stores without replacing existing data.
     */
    let _viewportFetchInFlight = false;

    async function fetchAndMergeRange(newStart, newEnd) {
        if (_viewportFetchInFlight) return;
        _viewportFetchInFlight = true;

        try {
            console.log(`[main] Incremental fetch: ${newStart.toISOString()} → ${newEnd.toISOString()}`);
            const data = await getAssignments({ rangeStart : newStart, rangeEnd : newEnd });
            const { events: newEvents, assignments: newAssignments } = resolveRawAssignments(data.value);

            // Deduplicate — only add events we don't already have
            const eventStore      = scheduler.project.eventStore;
            const assignmentStore = scheduler.project.assignmentStore;
            const addedEvents = [];
            const addedAssigns = [];

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
                await scheduler.project.commitAsync();
                console.log(`[main] Merged ${addedEvents.length} new events`);
            }

            // Extend the fetched-range watermark to the union of old + new
            fetchedRange = {
                start : new Date(Math.min(fetchedRange.start.getTime(), newStart.getTime())),
                end   : new Date(Math.max(fetchedRange.end.getTime(), newEnd.getTime()))
            };
        }
        catch (err) {
            console.error('[main] Incremental fetch failed:', err);
        }
        finally {
            _viewportFetchInFlight = false;
        }
    }

    // ── Debounced dateRangeChange listener ──────────────────────────────
    let _dateRangeTimer = null;

    scheduler.on('dateRangeChange', ({ new: newRange }) => {
        clearTimeout(_dateRangeTimer);
        _dateRangeTimer = setTimeout(() => {
            if (!fetchedRange.start) return;

            const visStart = new Date(newRange.startDate);
            const visEnd   = new Date(newRange.endDate);

            // Does the visible range (minus a small inner margin) exceed
            // what we've already fetched?  Use half the buffer as the
            // threshold so we start fetching before the edge is reached.
            const halfBuffer = VIEWPORT_BUFFER_DAYS / 2;
            const thresholdStart = new Date(fetchedRange.start);
            thresholdStart.setDate(thresholdStart.getDate() + halfBuffer);
            const thresholdEnd = new Date(fetchedRange.end);
            thresholdEnd.setDate(thresholdEnd.getDate() - halfBuffer);

            if (visStart < thresholdStart || visEnd > thresholdEnd) {
                // Compute a new buffered window around the visible range
                const desired = computeBufferedRange(visStart, visEnd);
                fetchAndMergeRange(desired.start, desired.end);
            }
        }, 400);
    });

    // ── Helper: sync filter values to/from URL query parameters ────────
    function readFilterParams() {
        const params = new URLSearchParams(window.location.search);
        const effortParam = params.get('useRemainingEffort');
        return {
            practices          : params.get('practice')?.split(',').filter(Boolean) || [],
            roles              : params.get('role')?.split(',').filter(Boolean) || [],
            resources          : params.get('resource')?.split(',').filter(Boolean) || [],
            useRemainingEffort : effortParam != null ? effortParam === 'true' : null,
            zoom               : params.get('zoom') || null
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

        // Persist active zoom preset
        const activeZoomBtn = scheduler.widgetMap.viewPresetGroup?.items?.find((b) => b.pressed);
        const activePreset = activeZoomBtn?.dataset?.preset;
        if (activePreset && activePreset !== 'weekAndDayLetter') {
            params.set('zoom', activePreset);
        }
        else {
            params.delete('zoom');
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

                // Auto-expand filtered tree to Role level in both scheduler and histogram
                // expandToLevel lives on the Tree feature, not the grid itself
                // Level 0 = expand Practice parents to reveal Role children
                setTimeout(() => {
                    scheduler.features.tree.expandToLevel(0);
                    histogram.features.tree.expandToLevel(0);
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

                // Auto-expand filtered tree (deferred to let TreeGroup rebuild)
                setTimeout(() => scheduler.expandAll(), 100);
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

                // Auto-expand filtered tree (deferred to let TreeGroup rebuild)
                setTimeout(() => scheduler.expandAll(), 100);
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

    // ── Zoom preset button group ────────────────────────────────────────
    const viewPresetGroup = scheduler.widgetMap.viewPresetGroup;
    if (viewPresetGroup) {
        // Restore zoom preset from URL param
        if (initialParams.zoom) {
            const targetBtn = viewPresetGroup.items.find(
                (b) => b.dataset?.preset === initialParams.zoom
            );
            if (targetBtn) {
                targetBtn.pressed = true;
                scheduler.viewPreset = initialParams.zoom;
            }
        }

        viewPresetGroup.on('toggle', ({ source, pressed }) => {
            if (pressed && source.dataset?.preset) {
                scheduler.viewPreset = source.dataset.preset;
                writeFilterParams();
                console.log(`[main] Zoom preset changed to ${source.dataset.preset}`);
            }
        });
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
                        event.endDate,
                        assignment.resource?.id ?? assignment.resource
                    );
                }
            });

            await scheduler.project.commitAsync();
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
            clearLeafStateCache();
            try {
                console.log('[main] Refreshing data…');

                // Use current visible range + buffer for the refresh fetch
                const visRange = scheduler.visibleDateRange || {};
                const refreshRange = computeBufferedRange(
                    visRange.startDate || schedulerproConfig.startDate,
                    visRange.endDate || schedulerproConfig.endDate
                );

                const [newResources, newAssignments, newPracticeRoleResult] =
                    await Promise.all([
                        getResources(),
                        getAssignments({
                            rangeStart : refreshRange.start,
                            rangeEnd   : refreshRange.end
                        }),
                        getResourcePractices().catch((err) => {
                            console.warn('[main] Failed to refresh practices:', err);
                            return { practiceMap : new Map(), roleMap : new Map() };
                        })
                    ]);

                const { practiceMap: newPracticeMap, roleMap: newRoleMap } = newPracticeRoleResult;

                // Rebuild resource hours map from fresh data
                resourceHoursMap = new Map();
                for (const raw of newResources.value) {
                    const wh = raw.ws_workinghours ?? 40;
                    resourceHoursMap.set(raw.bookableresourceid, wh / 5);
                }
                console.log(`[main] Rebuilt resourceHoursMap for ${resourceHoursMap.size} resources`);

                // Re-resolve events using shared transform
                const { events: newResolvedEvents, assignments: newAssignmentRecords } =
                    resolveRawAssignments(newAssignments.value);

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

                // Reset viewport fetch watermark to match the refresh range
                fetchedRange = { start : refreshRange.start, end : refreshRange.end };

                // Reset colour state — resolve colours assigned fresh by resolveRawAssignments
                // (already populated projectColorMap via getProjectColor inside resolveRawAssignments)

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

    // ── One-time refresh so the leaf-state cache is populated for parent bar colors ─
    // Parent rows render before children in tree order, so on the first paint
    // the cache is empty and parents default to mixed-state. A single deferred
    // refresh after the first render pass corrects them.
    histogram.on('renderRows', () => {
        setTimeout(() => histogram.refresh(), 0);
    }, { once : true });

    // ── Auto-expand tree if filters were restored from URL params ────────
    // Deferred to let TreeGroup finish its initial build after page load
    const hasActiveFilters = (practiceCombo?.value?.length > 0)
        || (roleCombo?.value?.length > 0)
        || (resourceCombo?.value?.length > 0);
    if (hasActiveFilters) {
        setTimeout(() => {
            if (practiceCombo?.value?.length > 0) {
                // Expand to Role level for practice filter
                scheduler.features.tree.expandToLevel(0);
                histogram.features.tree.expandToLevel(0);
            }
            else {
                // Role or Resource filter – expand all
                scheduler.expandAll();
                histogram.expandAll();
            }
        }, 200);
    }

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
