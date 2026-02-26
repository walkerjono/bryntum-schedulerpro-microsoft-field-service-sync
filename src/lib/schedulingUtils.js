/**
 * Scheduling utility functions — extracted from main.js for testability.
 *
 * All functions are pure (or accept injectable state) so they can be
 * unit-tested without Bryntum, DOM, or module-level side-effects.
 */

/**
 * Count weekdays (Mon–Fri) between two dates.
 * Returns at least 1 to avoid division-by-zero in allocation calculations.
 *
 * @param {Date|string} start
 * @param {Date|string} end
 * @returns {number}
 */
export function countWeekdays(start, end) {
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

/**
 * Compute the buffered date window for OData queries.
 * Extends the given start/end by `bufferDays` on each side.
 *
 * @param {Date} start
 * @param {Date} end
 * @param {number} bufferDays
 * @returns {{ start: Date, end: Date }}
 */
export function computeBufferedRange(start, end, bufferDays) {
    const bufStart = new Date(start);
    bufStart.setDate(bufStart.getDate() - bufferDays);
    const bufEnd = new Date(end);
    bufEnd.setDate(bufEnd.getDate() + bufferDays);
    return { start : bufStart, end : bufEnd };
}

/**
 * Return the later of `date` and the computed offset date (midnight-normalised).
 * When using remaining effort, the effective start of an assignment is at
 * earliest the offset date.
 *
 * @param {Date|string} date            — the original start date
 * @param {object}      opts
 * @param {boolean}     opts.useCurrentWeek — if true, snap to Monday of the current week
 * @param {number}      opts.offsetDays     — days to subtract from today (ignored when useCurrentWeek)
 * @param {Date}        [opts.today]        — injectable "now" for testing (default: new Date())
 * @returns {Date}
 */
export function clampStartToToday(date, { useCurrentWeek = false, offsetDays = 7, today = new Date() } = {}) {
    let offsetDate;
    if (useCurrentWeek) {
        offsetDate = new Date(today);
        offsetDate.setHours(0, 0, 0, 0);
        // getDay(): 0 = Sun, 1 = Mon … 6 = Sat → shift back to Monday
        const dayOfWeek = offsetDate.getDay();
        const daysFromMonday = (dayOfWeek + 6) % 7; // Mon=0 … Sun=6
        offsetDate.setDate(offsetDate.getDate() - daysFromMonday);
    }
    else {
        offsetDate = new Date(today);
        offsetDate.setHours(0, 0, 0, 0);
        offsetDate.setDate(offsetDate.getDate() - offsetDays);
    }
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d.getTime() < offsetDate.getTime() ? offsetDate : d;
}

/**
 * Calculate allocation % (units) for a single assignment.
 *
 * @param {number}       effort           — total effort in hours
 * @param {number|null}  effortRemaining  — remaining effort from project task (nullable)
 * @param {Date|string}  startDate        — assignment start
 * @param {Date|string}  endDate          — assignment end
 * @param {object}       opts
 * @param {boolean}      opts.useRemainingEffort — which effort source to use
 * @param {number}       opts.hoursPerDay        — default hours per working day
 * @param {Map}          opts.resourceHoursMap   — resourceId → hoursPerDay lookup
 * @param {string}       opts.resourceId         — the resource to look up
 * @param {function}     opts.clampFn            — fn(date) → clamped date (for remaining effort mode)
 * @returns {number}
 */
export function calcUnits(effort, effortRemaining, startDate, endDate, {
    useRemainingEffort = false,
    hoursPerDay = 8,
    resourceHoursMap = new Map(),
    resourceId = null,
    clampFn = (d) => d
} = {}) {
    const effortSource = useRemainingEffort ? (effortRemaining ?? 0) : effort;
    const effectiveStart = useRemainingEffort ? clampFn(startDate) : startDate;
    const workingDays  = countWeekdays(effectiveStart, endDate);
    // Use the resource's actual hours-per-day from their calendar,
    // falling back to the global default for unknown resources.
    const hrsPerDay    = resourceHoursMap.get(resourceId) || hoursPerDay;
    const workingHours = workingDays * hrsPerDay;
    const rawUnits = effortSource > 0 && workingHours > 0 ? (effortSource / workingHours) * 100 : 0;
    return Number.isFinite(rawUnits) ? rawUnits : 0;
}

/**
 * Assign a colour to a project name (stable across incremental loads).
 * Known projects keep their existing colour; new ones get the next
 * colour from the palette.
 *
 * @param {string|null} projectName
 * @param {Map}         colorMap       — mutable Map<string,string> for stable mapping
 * @param {{ value: number }} colorIndex — mutable counter object { value: N }
 * @param {string[]}    palette        — array of hex colour strings
 * @returns {string}
 */
export function getProjectColor(projectName, colorMap, colorIndex, palette) {
    if (!projectName) return '#888';
    if (colorMap.has(projectName)) return colorMap.get(projectName);
    const color = palette[colorIndex.value % palette.length];
    colorMap.set(projectName, color);
    colorIndex.value++;
    return color;
}

/**
 * Transform raw D365 assignment records (already parsed through CustomEventModel)
 * into resolved event + assignment objects ready for Bryntum stores.
 *
 * This is a pure-ish function: it receives all dependencies via parameters so
 * it can be unit-tested without DOM, Bryntum, or module-level state.
 *
 * @param {object[]}  rawRecords         — array of raw D365 OData assignment records
 * @param {Function}  EventModelClass    — constructor that parses raw → model (e.g. CustomEventModel)
 * @param {object}    opts
 * @param {boolean}   opts.useRemainingEffort — whether to use remaining effort mode
 * @param {Function}  opts.clampFn            — fn(date) → clamped Date (for remaining effort start)
 * @param {Function}  opts.calcUnitsFn        — fn(effort, effortRemaining, startDate, endDate, resourceId) → number
 * @param {Function}  [opts.getProjectColorFn] — fn(projectName) → hex colour string
 * @returns {{ events: object[], assignments: object[] }}
 */
export function resolveRawAssignments(rawRecords, EventModelClass, {
    useRemainingEffort = false,
    clampFn            = (d) => d,
    calcUnitsFn        = () => 0,
    getProjectColorFn  = () => '#888'
} = {}) {
    const events = [];
    const assignments = [];

    rawRecords.forEach((raw) => {
        const e = new EventModelClass(raw);

        // Skip records with invalid date ranges (bad D365 data)
        if (e.startDate && e.endDate && new Date(e.startDate) > new Date(e.endDate)) {
            console.warn(`[crud] Skipping assignment ${e.id} — startDate (${e.startDate}) > endDate (${e.endDate})`);
            return;
        }

        // Only shift start date for incomplete assignments with remaining effort.
        // Completed assignments (effortRemaining === 0) keep their original D365 dates.
        let effectiveStart = e.startDate;
        if (useRemainingEffort && (e.effortRemaining ?? 0) > 0) {
            effectiveStart = clampFn(e.startDate);
        }
        // Ensure start never exceeds end to avoid scheduling errors
        if (new Date(effectiveStart) > new Date(e.endDate)) {
            effectiveStart = e.endDate;
        }

        const units = calcUnitsFn(e.effort, e.effortRemaining, e.startDate, e.endDate, e.resourceId);
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
            eventColor        : getProjectColorFn(e.projectName)
        });

        assignments.push({
            id       : `assign-${e.id}`,
            event    : e.id,
            resource : e.resourceId,
            units
        });
    });

    return { events, assignments };
}

/**
 * Generate working-time calendars for a set of flat resources.
 *
 * Returns an array of calendar config objects. Resources whose
 * `workingHours` differ from `standardWeeklyHours` have their
 * `.calendar` property mutated in-place to reference the generated
 * calendar id.
 *
 * @param {object[]} flatResources          — array of { id, workingHours, calendar, … }
 * @param {object}   [opts]
 * @param {number}   [opts.standardWeeklyHours=40]  — weekly hours considered "standard"
 * @param {number}   [opts.workDaysPerWeek=5]       — working days per week
 * @param {string}   [opts.startTime='08:00']       — daily start time for all calendars
 * @returns {object[]} array of Bryntum calendar config objects (business + per-resource)
 */
export function generateCalendars(flatResources, {
    standardWeeklyHours = 40,
    workDaysPerWeek     = 5,
    startTime           = '08:00'
} = {}) {
    const standardHoursPerDay = standardWeeklyHours / workDaysPerWeek;
    const startHour = parseInt(startTime.split(':')[0], 10);

    // Default business calendar
    const endHourStd    = startHour + standardHoursPerDay;
    const endHrStd      = Math.floor(endHourStd);
    const endMinStd     = Math.round((endHourStd - endHrStd) * 60);
    const endTimeStdStr = `${String(endHrStd).padStart(2, '0')}:${String(endMinStd).padStart(2, '0')}`;

    const businessCalendar = {
        id                       : 'business',
        name                     : `Standard (${standardWeeklyHours}h)`,
        unspecifiedTimeIsWorking : false,
        intervals                : [
            {
                recurrentStartDate : `every weekday at ${startTime}`,
                recurrentEndDate   : `every weekday at ${endTimeStdStr}`,
                isWorking          : true
            }
        ]
    };

    const calendars = [businessCalendar];

    // Generate per-resource calendars for non-standard working hours
    flatResources.forEach((r) => {
        if (r.workingHours !== standardWeeklyHours) {
            const calId     = `calendar-${r.id}`;
            const hrsPerDay = r.workingHours / workDaysPerWeek;
            const endHour   = Math.floor(startHour + hrsPerDay);
            const endMinute = Math.round((hrsPerDay % 1) * 60);
            const endTimeStr = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
            calendars.push({
                id                       : calId,
                name                     : `Custom (${r.workingHours}h)`,
                unspecifiedTimeIsWorking : false,
                intervals                : [
                    {
                        recurrentStartDate : `every weekday at ${startTime}`,
                        recurrentEndDate   : `every weekday at ${endTimeStr}`,
                        isWorking          : true
                    }
                ]
            });
            r.calendar = calId;
        }
    });

    return calendars;
}
