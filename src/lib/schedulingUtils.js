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
