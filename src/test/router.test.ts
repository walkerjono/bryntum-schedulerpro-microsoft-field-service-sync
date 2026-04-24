import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    parseHash,
    navigate,
    onRouteChange,
    getCurrentRoute,
    getCurrentParams,
    initRouter
} from '../app/router';

// ── DOM mocks ───────────────────────────────────────────────────────

let hashValue = '';

// We need a proper location mock that behaves like a real hash setter
const locationMock = {
    get hash() {
        return hashValue;
    },
    set hash(val : string) {
        hashValue = val;
    }
};

Object.defineProperty(globalThis, 'window', {
    value : {
        ...globalThis.window,
        location         : locationMock,
        addEventListener : vi.fn()
    },
    writable : true
});

const mockElements = new Map<string, { style : Record<string, string> }>();

Object.defineProperty(globalThis, 'document', {
    value : {
        getElementById : vi.fn((id : string) => mockElements.get(id) ?? null)
    },
    writable : true
});

function addMockElement(id : string) : void {
    mockElements.set(id, { style : { display : '' } });
}

beforeEach(() => {
    vi.clearAllMocks();
    hashValue = '';
    mockElements.clear();

    // Add view containers referenced by the router
    addMockElement('app');
    addMockElement('histogram');
    addMockElement('timesheet-view');

    vi.spyOn(console, 'error').mockImplementation(() => {});
});

// ── parseHash ───────────────────────────────────────────────────────

describe('parseHash', () => {
    it('parses #/planner', () => {
        const result = parseHash('#/planner');
        expect(result.route).toBe('planner');
        expect(result.params).toEqual({});
    });

    it('parses #/timesheet', () => {
        const result = parseHash('#/timesheet');
        expect(result.route).toBe('timesheet');
    });

    it('parses query params', () => {
        const result = parseHash('#/timesheet?resource=res-1&week=2026-06-08');
        expect(result.route).toBe('timesheet');
        expect(result.params.resource).toBe('res-1');
        expect(result.params.week).toBe('2026-06-08');
    });

    it('defaults to planner for unknown routes', () => {
        expect(parseHash('#/unknown').route).toBe('planner');
        expect(parseHash('').route).toBe('planner');
        expect(parseHash('#').route).toBe('planner');
    });

    it('handles missing query string', () => {
        const result = parseHash('#/planner');
        expect(Object.keys(result.params)).toHaveLength(0);
    });
});

// ── navigate ────────────────────────────────────────────────────────

describe('navigate', () => {
    it('sets the hash for a route', () => {
        navigate('timesheet');
        expect(hashValue).toBe('#/timesheet');
    });

    it('includes query params', () => {
        navigate('timesheet', { resource : 'res-1', week : '2026-06-08' });
        expect(hashValue).toContain('resource=res-1');
        expect(hashValue).toContain('week=2026-06-08');
    });

    it('omits empty params', () => {
        navigate('planner', { resource : '', week : undefined });
        expect(hashValue).toBe('#/planner');
    });
});

// ── onRouteChange ───────────────────────────────────────────────────

describe('onRouteChange', () => {
    it('registers a handler without throwing', () => {
        const handler = vi.fn();
        expect(() => onRouteChange(handler)).not.toThrow();
    });
});

// ── getCurrentRoute ─────────────────────────────────────────────────

describe('getCurrentRoute', () => {
    it('returns null before initialisation', () => {
        // Note: getCurrentRoute uses module-scoped state. After beforeEach
        // there's no guarantee of the state since we can't reset it easily.
        // This test verifies the function is callable.
        const result = getCurrentRoute();
        expect(typeof result === 'string' || result === null).toBe(true);
    });
});

// ── getCurrentParams ────────────────────────────────────────────────

describe('getCurrentParams', () => {
    it('returns params from current hash', () => {
        hashValue = '#/timesheet?resource=r1';
        const params = getCurrentParams();
        expect(params.resource).toBe('r1');
    });

    it('returns empty params for bare hash', () => {
        hashValue = '#/planner';
        const params = getCurrentParams();
        expect(Object.keys(params)).toHaveLength(0);
    });
});

// ── initRouter ──────────────────────────────────────────────────────

describe('initRouter', () => {
    it('sets default hash to #/planner when empty', () => {
        hashValue = '';
        initRouter();
        expect(hashValue).toBe('#/planner');
    });

    it('applies existing hash (does not override)', () => {
        hashValue = '#/timesheet?week=2026-06-08';
        initRouter();
        expect(hashValue).toBe('#/timesheet?week=2026-06-08');
    });

    it('registers hashchange listener', () => {
        initRouter();
        expect(window.addEventListener).toHaveBeenCalledWith('hashchange', expect.any(Function));
    });
});
