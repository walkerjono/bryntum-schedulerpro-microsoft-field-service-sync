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

    // ── Resolve events via temporary CustomEventModel (runs convert fns) ─
    const resolvedEvents = [];
    const assignments = [];

    assignmentsData.value.forEach((raw) => {
        const e = new CustomEventModel(raw);

        // Calculate allocation % so the histogram shows correct effort per tick.
        const workingDays = countWeekdays(e.startDate, e.endDate);
        const workingHours = workingDays * HOURS_PER_DAY;
        const units = e.effort > 0 ? (e.effort / workingHours) * 100 : 0;

        resolvedEvents.push({
            id          : e.id,
            startDate   : e.startDate,
            endDate     : e.endDate,
            name        : e.name,
            projectName : e.projectName,
            effort      : e.effort
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
    const flatResources = resourcesData.value.map((raw, i) => {
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
                data       : flatResources
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
