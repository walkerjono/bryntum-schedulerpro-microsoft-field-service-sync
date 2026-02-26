import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    countWeekdays,
    computeBufferedRange,
    clampStartToToday,
    calcUnits,
    getProjectColor,
    resolveRawAssignments,
    generateCalendars
} from '../../lib/schedulingUtils';
import CustomEventModel from '../../lib/CustomEventModel';

/** Format a Date as YYYY-MM-DD in *local* time (avoids UTC shift from toISOString). */
const localDate = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ── countWeekdays ───────────────────────────────────────────────────
describe('countWeekdays', () => {
    it('returns 1 for same-day (minimum clamp)', () => {
        const d = new Date('2026-02-25');
        expect(countWeekdays(d, d)).toBe(1);
    });

    it('counts weekdays across a normal Mon–Fri span', () => {
        // Mon 23 Feb → Fri 27 Feb = 4 weekdays (23,24,25,26 — end is exclusive)
        expect(countWeekdays('2026-02-23', '2026-02-27')).toBe(4);
    });

    it('skips Saturday and Sunday', () => {
        // Fri 27 Feb → Mon 2 Mar = 1 weekday (Fri only; Sat+Sun skipped)
        expect(countWeekdays('2026-02-27', '2026-03-02')).toBe(1);
    });

    it('returns 1 when span is entirely within a weekend', () => {
        // Sat 28 Feb → Sun 1 Mar = 0 weekdays → clamps to 1
        expect(countWeekdays('2026-02-28', '2026-03-01')).toBe(1);
    });

    it('counts correctly across multiple weeks', () => {
        // Mon 23 Feb → Mon 9 Mar = 10 weekdays
        expect(countWeekdays('2026-02-23', '2026-03-09')).toBe(10);
    });

    it('returns 1 when start equals end', () => {
        expect(countWeekdays('2026-02-25', '2026-02-25')).toBe(1);
    });

    it('returns 1 when start is after end (no negative counts)', () => {
        expect(countWeekdays('2026-03-05', '2026-03-01')).toBe(1);
    });

    it('handles string date inputs', () => {
        expect(countWeekdays('2026-02-23', '2026-02-28')).toBe(5);
    });
});

// ── computeBufferedRange ────────────────────────────────────────────
describe('computeBufferedRange', () => {
    it('extends start and end by the buffer days', () => {
        const start = new Date('2026-03-01');
        const end   = new Date('2026-03-31');
        const result = computeBufferedRange(start, end, 7);

        expect(localDate(result.start)).toBe('2026-02-22');
        expect(localDate(result.end)).toBe('2026-04-07');
    });

    it('works with buffer of 0', () => {
        const start = new Date('2026-03-15');
        const end   = new Date('2026-03-15');
        const result = computeBufferedRange(start, end, 0);

        expect(localDate(result.start)).toBe('2026-03-15');
        expect(localDate(result.end)).toBe('2026-03-15');
    });

    it('does not mutate the original dates', () => {
        const start = new Date('2026-03-01');
        const end   = new Date('2026-03-31');
        computeBufferedRange(start, end, 10);

        expect(localDate(start)).toBe('2026-03-01');
        expect(localDate(end)).toBe('2026-03-31');
    });

    it('works with large buffer values', () => {
        const start = new Date('2026-06-01');
        const end   = new Date('2026-06-30');
        const result = computeBufferedRange(start, end, 90);

        expect(localDate(result.start)).toBe('2026-03-03');
        expect(localDate(result.end)).toBe('2026-09-28');
    });
});

// ── clampStartToToday ───────────────────────────────────────────────
describe('clampStartToToday', () => {
    it('returns the original date when it is in the future', () => {
        const today = new Date('2026-02-26T12:00:00');
        const future = new Date('2026-04-01');
        const result = clampStartToToday(future, { offsetDays : 7, today });

        // Future date should come back unchanged (midnight-normalised)
        expect(localDate(result)).toBe('2026-04-01');
    });

    it('clamps a past date to today minus offset', () => {
        const today = new Date('2026-02-26T12:00:00');
        const past  = new Date('2025-01-01');
        const result = clampStartToToday(past, { offsetDays : 7, today });

        // Expected: 2026-02-26 - 7 days = 2026-02-19
        expect(localDate(result)).toBe('2026-02-19');
    });

    it('returns today when offsetDays is 0 and date is in the past', () => {
        const today = new Date('2026-02-26T12:00:00');
        const past  = new Date('2025-01-01');
        const result = clampStartToToday(past, { offsetDays : 0, today });

        expect(localDate(result)).toBe('2026-02-26');
    });

    it('snaps to Monday of current week when useCurrentWeek is true', () => {
        // Thursday 26 Feb 2026 → Monday 23 Feb 2026
        const today = new Date('2026-02-26T12:00:00');
        const past  = new Date('2025-01-01');
        const result = clampStartToToday(past, { useCurrentWeek : true, today });

        expect(localDate(result)).toBe('2026-02-23');
    });

    it('snaps correctly when today is Monday', () => {
        const monday = new Date('2026-02-23T12:00:00');
        const past   = new Date('2025-01-01');
        const result = clampStartToToday(past, { useCurrentWeek : true, today : monday });

        expect(localDate(result)).toBe('2026-02-23');
    });

    it('snaps correctly when today is Sunday', () => {
        // Sunday 1 Mar 2026 → Monday 23 Feb 2026
        const sunday = new Date('2026-03-01T12:00:00');
        const past   = new Date('2025-01-01');
        const result = clampStartToToday(past, { useCurrentWeek : true, today : sunday });

        expect(localDate(result)).toBe('2026-02-23');
    });

    it('uses defaults when no options provided', () => {
        // With no options, defaults: useCurrentWeek=false, offsetDays=7, today=now
        const farPast = new Date('2000-01-01');
        const result = clampStartToToday(farPast);
        // Should be some date near "now - 7 days", at least not the year 2000
        expect(result.getFullYear()).toBeGreaterThanOrEqual(2025);
    });

    it('normalises date to midnight', () => {
        const today = new Date('2026-02-26T15:30:00');
        const date  = new Date('2026-04-01T10:30:00');
        const result = clampStartToToday(date, { offsetDays : 0, today });

        expect(result.getHours()).toBe(0);
        expect(result.getMinutes()).toBe(0);
    });
});

// ── calcUnits ───────────────────────────────────────────────────────
describe('calcUnits', () => {
    it('calculates 100% for standard 40h allocation over 5 weekdays', () => {
        // 40 effort / (5 weekdays * 8 hrs/day) = 100%
        const units = calcUnits(40, null, '2026-02-23', '2026-02-28', {
            useRemainingEffort : false,
            hoursPerDay        : 8
        });
        expect(units).toBeCloseTo(100);
    });

    it('uses effortRemaining when useRemainingEffort is true', () => {
        // 20 remaining / (5 weekdays * 8 hrs/day) = 50%
        const units = calcUnits(40, 20, '2026-02-23', '2026-02-28', {
            useRemainingEffort : true,
            hoursPerDay        : 8,
            clampFn            : (d) => d // identity — no clamping
        });
        expect(units).toBeCloseTo(50);
    });

    it('treats null effortRemaining as 0 in remaining mode', () => {
        const units = calcUnits(40, null, '2026-02-23', '2026-02-28', {
            useRemainingEffort : true,
            hoursPerDay        : 8,
            clampFn            : (d) => d
        });
        expect(units).toBe(0);
    });

    it('returns 0 when effortRemaining is 0 in remaining mode', () => {
        const units = calcUnits(40, 0, '2026-02-23', '2026-02-28', {
            useRemainingEffort : true,
            hoursPerDay        : 8,
            clampFn            : (d) => d
        });
        expect(units).toBe(0);
    });

    it('uses resource-specific hoursPerDay from resourceHoursMap', () => {
        const map = new Map([['res1', 6]]);
        // 30 effort / (5 weekdays * 6 hrs/day) = 100%
        const units = calcUnits(30, null, '2026-02-23', '2026-02-28', {
            useRemainingEffort : false,
            hoursPerDay        : 8,
            resourceHoursMap   : map,
            resourceId         : 'res1'
        });
        expect(units).toBeCloseTo(100);
    });

    it('falls back to default hoursPerDay for unknown resources', () => {
        const map = new Map();
        // 40 effort / (5 weekdays * 8 hrs/day) = 100%
        const units = calcUnits(40, null, '2026-02-23', '2026-02-28', {
            useRemainingEffort : false,
            hoursPerDay        : 8,
            resourceHoursMap   : map,
            resourceId         : 'unknown'
        });
        expect(units).toBeCloseTo(100);
    });

    it('calls clampFn on startDate in remaining effort mode', () => {
        const clampFn = vi.fn().mockReturnValue(new Date('2026-02-25'));
        calcUnits(40, 20, '2026-02-23', '2026-02-28', {
            useRemainingEffort : true,
            hoursPerDay        : 8,
            clampFn
        });
        expect(clampFn).toHaveBeenCalledWith('2026-02-23');
    });

    it('does not call clampFn in total effort mode', () => {
        const clampFn = vi.fn();
        calcUnits(40, 20, '2026-02-23', '2026-02-28', {
            useRemainingEffort : false,
            hoursPerDay        : 8,
            clampFn
        });
        expect(clampFn).not.toHaveBeenCalled();
    });

    it('returns 0 when effort is 0', () => {
        const units = calcUnits(0, null, '2026-02-23', '2026-02-28', {
            useRemainingEffort : false,
            hoursPerDay        : 8
        });
        expect(units).toBe(0);
    });

    it('handles over-allocation (>100%)', () => {
        // 80 effort / (5 weekdays * 8 hrs/day) = 200%
        const units = calcUnits(80, null, '2026-02-23', '2026-02-28', {
            useRemainingEffort : false,
            hoursPerDay        : 8
        });
        expect(units).toBeCloseTo(200);
    });
});

// ── getProjectColor ─────────────────────────────────────────────────
describe('getProjectColor', () => {
    const palette = ['#AAA', '#BBB', '#CCC'];
    let colorMap;
    let colorIndex;

    beforeEach(() => {
        colorMap   = new Map();
        colorIndex = { value : 0 };
    });

    it('returns #888 for null project name', () => {
        expect(getProjectColor(null, colorMap, colorIndex, palette)).toBe('#888');
    });

    it('returns #888 for empty string project name', () => {
        expect(getProjectColor('', colorMap, colorIndex, palette)).toBe('#888');
    });

    it('assigns the first palette colour to the first project', () => {
        expect(getProjectColor('Project A', colorMap, colorIndex, palette)).toBe('#AAA');
    });

    it('returns the same colour for the same project name', () => {
        const c1 = getProjectColor('Project A', colorMap, colorIndex, palette);
        const c2 = getProjectColor('Project A', colorMap, colorIndex, palette);
        expect(c1).toBe(c2);
        expect(colorIndex.value).toBe(1); // Only incremented once
    });

    it('cycles through the palette', () => {
        const c1 = getProjectColor('P1', colorMap, colorIndex, palette);
        const c2 = getProjectColor('P2', colorMap, colorIndex, palette);
        const c3 = getProjectColor('P3', colorMap, colorIndex, palette);
        expect(c1).toBe('#AAA');
        expect(c2).toBe('#BBB');
        expect(c3).toBe('#CCC');
    });

    it('wraps around the palette when more projects than colours', () => {
        getProjectColor('P1', colorMap, colorIndex, palette);
        getProjectColor('P2', colorMap, colorIndex, palette);
        getProjectColor('P3', colorMap, colorIndex, palette);
        const c4 = getProjectColor('P4', colorMap, colorIndex, palette);
        expect(c4).toBe('#AAA'); // wraps back to index 0
    });
});

// ── Helper: simulate a raw D365 OData assignment record ─────────────
function makeRawAssignment(overrides = {}) {
    return {
        msdyn_resourceassignmentid                                          : 'assign-001',
        msdyn_start                                                         : '2026-03-02T08:00:00Z',
        msdyn_finish                                                        : '2026-03-06T17:00:00Z',
        msdyn_effort                                                        : 40,
        _msdyn_bookableresourceid_value                                     : 'res-001',
        msdyn_name                                                          : 'Task Alpha',
        '_msdyn_taskid_value@OData.Community.Display.V1.FormattedValue'     : 'Task Display',
        msdyn_projectid : {
            msdyn_subject   : 'Project Alpha',
            ws_projectid    : 'P-100',
            '_msdyn_customer_value@OData.Community.Display.V1.FormattedValue' : 'Acme Corp'
        },
        msdyn_taskid : {
            msdyn_effortremaining    : 20,
            ws_projecttasknumber : 'T-55'
        },
        '@odata.etag' : 'W/\\"12345\\"',
        ...overrides
    };
}

// ── resolveRawAssignments ───────────────────────────────────────────
describe('resolveRawAssignments', () => {
    const identity = (d) => d;
    const stubCalcUnits = () => 100;
    const stubColor = () => '#FF0000';

    it('well-formed record produces correct event + assignment objects', () => {
        const raw = [makeRawAssignment()];
        const { events, assignments } = resolveRawAssignments(raw, CustomEventModel, {
            useRemainingEffort : false,
            clampFn            : identity,
            calcUnitsFn        : stubCalcUnits,
            getProjectColorFn  : stubColor
        });

        expect(events).toHaveLength(1);
        expect(assignments).toHaveLength(1);

        const evt = events[0];
        expect(evt.id).toBe('assign-001');
        expect(evt.name).toBe('Task Display');
        expect(evt.projectName).toBe('Project Alpha');
        expect(evt.projectNumber).toBe('P-100');
        expect(evt.clientName).toBe('Acme Corp');
        expect(evt.effort).toBe(40);
        expect(evt.effortRemaining).toBe(20);
        expect(evt.taskNumber).toBe('T-55');
        expect(evt.manuallyScheduled).toBe(true);
        expect(evt.durationUnit).toBe('hour');
        expect(evt.eventColor).toBe('#FF0000');

        const asgn = assignments[0];
        expect(asgn.id).toBe('assign-assign-001');
        expect(asgn.event).toBe('assign-001');
        expect(asgn.resource).toBe('res-001');
        expect(asgn.units).toBe(100);
    });

    it('skips record with startDate > endDate and logs warning', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const raw = [makeRawAssignment({
            msdyn_start  : '2026-03-10T08:00:00Z',
            msdyn_finish : '2026-03-05T17:00:00Z'
        })];

        const { events, assignments } = resolveRawAssignments(raw, CustomEventModel, {
            clampFn     : identity,
            calcUnitsFn : stubCalcUnits
        });

        expect(events).toHaveLength(0);
        expect(assignments).toHaveLength(0);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping assignment'));
        warnSpy.mockRestore();
    });

    it('clamps effectiveStart to endDate when clamped start exceeds end', () => {
        // clampFn returns a date far in the future → effectiveStart should be capped to endDate
        const farFutureClamp = () => new Date('2099-01-01');
        const raw = [makeRawAssignment({
            msdyn_taskid : { msdyn_effortremaining : 10, ws_projecttasknumber : 'T-1' }
        })];

        const { events } = resolveRawAssignments(raw, CustomEventModel, {
            useRemainingEffort : true,
            clampFn            : farFutureClamp,
            calcUnitsFn        : stubCalcUnits,
            getProjectColorFn  : stubColor
        });

        expect(events).toHaveLength(1);
        // effectiveStart should equal endDate, so duration should be 0
        expect(events[0].duration).toBe(0);
    });

    it('uses original D365 dates when effortRemaining = 0 (completed assignment)', () => {
        const clampSpy = vi.fn(identity);
        const raw = [makeRawAssignment({
            msdyn_taskid : { msdyn_effortremaining : 0, ws_projecttasknumber : 'T-1' }
        })];

        const { events } = resolveRawAssignments(raw, CustomEventModel, {
            useRemainingEffort : true,
            clampFn            : clampSpy,
            calcUnitsFn        : stubCalcUnits,
            getProjectColorFn  : stubColor
        });

        expect(events).toHaveLength(1);
        // clampFn should NOT have been called — completed assignment keeps D365 dates
        expect(clampSpy).not.toHaveBeenCalled();
        expect(events[0].startDate).toBe('2026-03-02T08:00:00Z');
    });

    it('handles missing expanded fields with null-safe fallbacks', () => {
        const raw = [makeRawAssignment({
            msdyn_projectid : undefined,
            msdyn_taskid    : undefined,
            msdyn_name      : undefined,
            '_msdyn_taskid_value@OData.Community.Display.V1.FormattedValue' : undefined
        })];

        const { events, assignments } = resolveRawAssignments(raw, CustomEventModel, {
            clampFn     : identity,
            calcUnitsFn : stubCalcUnits
        });

        expect(events).toHaveLength(1);
        expect(assignments).toHaveLength(1);
        // Fallback values from CustomEventModel converters
        expect(events[0].projectName).toBe('');
        expect(events[0].effortRemaining).toBeNull();
        expect(events[0].taskNumber).toBe('');
        expect(events[0].name).toBe('Unnamed Assignment');
    });

    it('produces one assignment per event for duplicate bookableresourceid', () => {
        const raw = [
            makeRawAssignment({ msdyn_resourceassignmentid : 'a1' }),
            makeRawAssignment({ msdyn_resourceassignmentid : 'a2' })
        ];

        const { events, assignments } = resolveRawAssignments(raw, CustomEventModel, {
            clampFn     : identity,
            calcUnitsFn : stubCalcUnits
        });

        // Both events created, each with its own assignment
        expect(events).toHaveLength(2);
        expect(assignments).toHaveLength(2);
        expect(assignments[0].resource).toBe('res-001');
        expect(assignments[1].resource).toBe('res-001');
        expect(assignments[0].event).not.toBe(assignments[1].event);
    });

    it('passes correct arguments to calcUnitsFn', () => {
        const calcSpy = vi.fn().mockReturnValue(75);
        const raw = [makeRawAssignment()];

        const { assignments } = resolveRawAssignments(raw, CustomEventModel, {
            clampFn     : identity,
            calcUnitsFn : calcSpy
        });

        expect(calcSpy).toHaveBeenCalledWith(40, 20, '2026-03-02T08:00:00Z', '2026-03-06T17:00:00Z', 'res-001');
        expect(assignments[0].units).toBe(75);
    });

    it('returns empty arrays when given no records', () => {
        const { events, assignments } = resolveRawAssignments([], CustomEventModel);
        expect(events).toHaveLength(0);
        expect(assignments).toHaveLength(0);
    });

    it('applies clampFn when useRemainingEffort is true and effortRemaining > 0', () => {
        const monday = new Date('2026-03-02');
        const clampSpy = vi.fn().mockReturnValue(monday);
        const raw = [makeRawAssignment({
            msdyn_taskid : { msdyn_effortremaining : 15, ws_projecttasknumber : 'T-1' }
        })];

        const { events } = resolveRawAssignments(raw, CustomEventModel, {
            useRemainingEffort : true,
            clampFn            : clampSpy,
            calcUnitsFn        : stubCalcUnits,
            getProjectColorFn  : stubColor
        });

        expect(clampSpy).toHaveBeenCalledOnce();
        expect(events[0].startDate).toEqual(monday);
    });

    it('does not call clampFn when useRemainingEffort is false', () => {
        const clampSpy = vi.fn(identity);
        const raw = [makeRawAssignment()];

        resolveRawAssignments(raw, CustomEventModel, {
            useRemainingEffort : false,
            clampFn            : clampSpy,
            calcUnitsFn        : stubCalcUnits
        });

        expect(clampSpy).not.toHaveBeenCalled();
    });
});

// ── generateCalendars ───────────────────────────────────────────────
describe('generateCalendars', () => {
    it('returns business calendar when all resources use standard hours', () => {
        const resources = [
            { id : 'r1', workingHours : 40, calendar : 'business' },
            { id : 'r2', workingHours : 40, calendar : 'business' }
        ];

        const calendars = generateCalendars(resources);

        expect(calendars).toHaveLength(1);
        expect(calendars[0].id).toBe('business');
        expect(calendars[0].name).toBe('Standard (40h)');
        expect(calendars[0].unspecifiedTimeIsWorking).toBe(false);
        expect(calendars[0].intervals[0].recurrentStartDate).toBe('every weekday at 08:00');
        expect(calendars[0].intervals[0].recurrentEndDate).toBe('every weekday at 16:00');
    });

    it('generates custom calendar for non-standard working hours (32h)', () => {
        const resources = [
            { id : 'r1', workingHours : 32, calendar : 'business' }
        ];

        const calendars = generateCalendars(resources);

        expect(calendars).toHaveLength(2);
        // Business calendar still present
        expect(calendars[0].id).toBe('business');
        // Custom calendar
        const custom = calendars[1];
        expect(custom.id).toBe('calendar-r1');
        expect(custom.name).toBe('Custom (32h)');
        // 32h / 5 days = 6.4h/day → 08:00 + 6.4h = 14:24
        expect(custom.intervals[0].recurrentEndDate).toBe('every weekday at 14:24');
    });

    it('calculates correct endTime for 40h/week (standard)', () => {
        const resources = [];
        const calendars = generateCalendars(resources); // no custom resources
        // Business calendar: 40/5 = 8h/day → 08:00 + 8 = 16:00
        expect(calendars[0].intervals[0].recurrentEndDate).toBe('every weekday at 16:00');
    });

    it('calculates correct fractional endTime for 32h/week', () => {
        const resources = [{ id : 'r1', workingHours : 32, calendar : 'business' }];
        const calendars = generateCalendars(resources);
        const custom = calendars.find((c) => c.id === 'calendar-r1');
        // 32/5 = 6.4h → 6h 24min → 08:00 + 6:24 = 14:24
        expect(custom.intervals[0].recurrentEndDate).toBe('every weekday at 14:24');
    });

    it('mutates resource.calendar to point to custom calendar', () => {
        const resources = [
            { id : 'r1', workingHours : 32, calendar : 'business' },
            { id : 'r2', workingHours : 40, calendar : 'business' }
        ];

        generateCalendars(resources);

        expect(resources[0].calendar).toBe('calendar-r1');
        expect(resources[1].calendar).toBe('business'); // unchanged
    });

    it('resource with workingHours = 0 falls back to 40 via || and uses business calendar', () => {
        // In the app, workingHours=0 is set to 40 via `|| 40` before calling
        // generateCalendars. Verify that if somehow 0 leaks through, a custom
        // calendar IS generated (because 0 !== 40).
        const resources = [{ id : 'r1', workingHours : 0, calendar : 'business' }];
        const calendars = generateCalendars(resources);
        // workingHours=0 !== 40, so a custom calendar is created
        expect(calendars).toHaveLength(2);
        const custom = calendars.find((c) => c.id === 'calendar-r1');
        expect(custom).toBeDefined();
        // 0/5 = 0h/day → endTime = 08:00 (same as start)
        expect(custom.intervals[0].recurrentEndDate).toBe('every weekday at 08:00');
    });

    it('accepts custom standardWeeklyHours', () => {
        const resources = [
            { id : 'r1', workingHours : 35, calendar : 'business' }
        ];

        const calendars = generateCalendars(resources, { standardWeeklyHours : 35 });

        // 35h is standard here, so only business calendar should exist
        expect(calendars).toHaveLength(1);
        expect(resources[0].calendar).toBe('business');
        // 35/5 = 7h/day → 08:00 + 7 = 15:00
        expect(calendars[0].intervals[0].recurrentEndDate).toBe('every weekday at 15:00');
    });

    it('generates multiple custom calendars for different resources', () => {
        const resources = [
            { id : 'r1', workingHours : 32, calendar : 'business' },
            { id : 'r2', workingHours : 24, calendar : 'business' },
            { id : 'r3', workingHours : 40, calendar : 'business' }
        ];

        const calendars = generateCalendars(resources);

        expect(calendars).toHaveLength(3); // business + 2 custom
        expect(calendars.find((c) => c.id === 'calendar-r1')).toBeDefined();
        expect(calendars.find((c) => c.id === 'calendar-r2')).toBeDefined();
        expect(resources[2].calendar).toBe('business');
    });

    it('business calendar has unspecifiedTimeIsWorking: false', () => {
        const calendars = generateCalendars([]);
        expect(calendars[0].unspecifiedTimeIsWorking).toBe(false);
    });

    it('custom calendars have unspecifiedTimeIsWorking: false', () => {
        const resources = [{ id : 'r1', workingHours : 32, calendar : 'business' }];
        const calendars = generateCalendars(resources);
        expect(calendars[1].unspecifiedTimeIsWorking).toBe(false);
    });
});
