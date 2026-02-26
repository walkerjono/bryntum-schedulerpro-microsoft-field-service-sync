import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    countWeekdays,
    computeBufferedRange,
    clampStartToToday,
    calcUnits,
    getProjectColor
} from '../../lib/schedulingUtils.js';

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
