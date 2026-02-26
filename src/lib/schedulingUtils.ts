/**
 * Scheduling utility functions — extracted from main.js for testability.
 *
 * All functions are pure (or accept injectable state) so they can be
 * unit-tested without Bryntum, DOM, or module-level side-effects.
 */
import type { D365ResourceAssignment } from '../types/d365';

// ── Interfaces ──────────────────────────────────────────────────────

export interface BufferedRange {
    start: Date;
    end: Date;
}

export interface ClampOpts {
    useCurrentWeek?: boolean;
    offsetDays?: number;
    today?: Date;
}

export interface CalcUnitsOpts {
    useRemainingEffort?: boolean;
    hoursPerDay?: number;
    resourceHoursMap?: Map<string, number>;
    resourceId?: string | null;
    clampFn?: (d: Date | string) => Date;
}

export interface ResolveOpts {
    useRemainingEffort?: boolean;
    clampFn?: (d: Date | string) => Date;
    calcUnitsFn?: (effort: number, effortRemaining: number | null, startDate: Date | string, endDate: Date | string, resourceId: string) => number;
    getProjectColorFn?: (projectName: string | null) => string;
}

export interface ResolvedEvent {
    id: string;
    startDate: Date | string;
    originalStartDate: Date | string;
    endDate: Date | string;
    duration: number;
    durationUnit: string;
    name: string;
    projectName: string;
    projectNumber: string;
    clientName: string;
    effort: number;
    effortRemaining: number | null;
    taskNumber: string;
    manuallyScheduled: boolean;
    eventColor: string;
}

export interface ResolvedAssignment {
    id: string;
    event: string;
    resource: string;
    units: number;
}

export interface FlatResource {
    id: string;
    workingHours: number;
    calendar?: string;
    [key: string]: unknown;
}

export interface CalendarInterval {
    recurrentStartDate: string;
    recurrentEndDate: string;
    isWorking: boolean;
}

export interface CalendarConfig {
    id: string;
    name: string;
    unspecifiedTimeIsWorking: boolean;
    intervals: CalendarInterval[];
}

export interface CalendarOpts {
    standardWeeklyHours?: number;
    workDaysPerWeek?: number;
    startTime?: string;
}

/** Minimal shape expected from the EventModelClass constructor result */
interface ParsedEvent {
    id: string;
    startDate: Date | string;
    endDate: Date | string;
    effort: number;
    effortRemaining: number | null;
    resourceId: string;
    name: string;
    projectName: string;
    projectNumber: string;
    clientName: string;
    taskNumber: string;
}

/** Constructor type for the EventModel-like class */
interface EventModelConstructor {
    new(data: D365ResourceAssignment): ParsedEvent;
}

// ── Functions ───────────────────────────────────────────────────────

/**
 * Count weekdays (Mon–Fri) between two dates.
 * Returns at least 1 to avoid division-by-zero in allocation calculations.
 */
export function countWeekdays(start: Date | string, end: Date | string): number {
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
 */
export function computeBufferedRange(start: Date, end: Date, bufferDays: number): BufferedRange {
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
 */
export function clampStartToToday(date: Date | string, { useCurrentWeek = false, offsetDays = 7, today = new Date() }: ClampOpts = {}): Date {
    let offsetDate: Date;
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
 */
export function calcUnits(effort: number, effortRemaining: number | null, startDate: Date | string, endDate: Date | string, {
    useRemainingEffort = false,
    hoursPerDay = 8,
    resourceHoursMap = new Map<string, number>(),
    resourceId = null,
    clampFn = (d: Date | string) => d as Date
}: CalcUnitsOpts = {}): number {
    const effortSource = useRemainingEffort ? (effortRemaining ?? 0) : effort;
    const effectiveStart = useRemainingEffort ? clampFn(startDate) : startDate;
    const workingDays  = countWeekdays(effectiveStart, endDate);
    // Use the resource's actual hours-per-day from their calendar,
    // falling back to the global default for unknown resources.
    const hrsPerDay    = resourceHoursMap.get(resourceId!) || hoursPerDay;
    const workingHours = workingDays * hrsPerDay;
    const rawUnits = effortSource > 0 && workingHours > 0 ? (effortSource / workingHours) * 100 : 0;
    return Number.isFinite(rawUnits) ? rawUnits : 0;
}

/**
 * Assign a colour to a project name (stable across incremental loads).
 * Known projects keep their existing colour; new ones get the next
 * colour from the palette.
 */
export function getProjectColor(projectName: string | null, colorMap: Map<string, string>, colorIndex: { value: number }, palette: string[]): string {
    if (!projectName) return '#888';
    if (colorMap.has(projectName)) return colorMap.get(projectName)!;
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
 */
export function resolveRawAssignments(rawRecords: D365ResourceAssignment[], EventModelClass: EventModelConstructor, {
    useRemainingEffort = false,
    clampFn            = (d: Date | string) => d as Date,
    calcUnitsFn        = () => 0,
    getProjectColorFn  = () => '#888'
}: ResolveOpts = {}): { events: ResolvedEvent[]; assignments: ResolvedAssignment[] } {
    const events: ResolvedEvent[] = [];
    const assignments: ResolvedAssignment[] = [];

    rawRecords.forEach((raw) => {
        const e = new EventModelClass(raw);

        // Skip records with invalid date ranges (bad D365 data)
        if (e.startDate && e.endDate && new Date(e.startDate) > new Date(e.endDate)) {
            console.warn(`[crud] Skipping assignment ${e.id} — startDate (${e.startDate}) > endDate (${e.endDate})`);
            return;
        }

        // Only shift start date for incomplete assignments with remaining effort.
        // Completed assignments (effortRemaining === 0) keep their original D365 dates.
        let effectiveStart: Date | string = e.startDate;
        if (useRemainingEffort && (e.effortRemaining ?? 0) > 0) {
            effectiveStart = clampFn(e.startDate);
        }
        // Ensure start never exceeds end to avoid scheduling errors
        if (new Date(effectiveStart) > new Date(e.endDate)) {
            effectiveStart = e.endDate;
        }

        const units = calcUnitsFn(e.effort, e.effortRemaining, e.startDate, e.endDate, e.resourceId);
        const durationHours = (new Date(e.endDate).getTime() - new Date(effectiveStart).getTime()) / (1000 * 60 * 60);

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
 */
export function generateCalendars(flatResources: FlatResource[], {
    standardWeeklyHours = 40,
    workDaysPerWeek     = 5,
    startTime           = '08:00'
}: CalendarOpts = {}): CalendarConfig[] {
    const standardHoursPerDay = standardWeeklyHours / workDaysPerWeek;
    const startHour = parseInt(startTime.split(':')[0], 10);

    // Default business calendar
    const endHourStd    = startHour + standardHoursPerDay;
    const endHrStd      = Math.floor(endHourStd);
    const endMinStd     = Math.round((endHourStd - endHrStd) * 60);
    const endTimeStdStr = `${String(endHrStd).padStart(2, '0')}:${String(endMinStd).padStart(2, '0')}`;

    const businessCalendar: CalendarConfig = {
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

    const calendars: CalendarConfig[] = [businessCalendar];

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
