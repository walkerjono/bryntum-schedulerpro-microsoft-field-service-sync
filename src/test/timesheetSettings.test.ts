import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    loadTimesheetSettings,
    getTimesheetSettings,
    resetTimesheetSettings
} from '../app/timesheetSettings';

// ── Mocks ───────────────────────────────────────────────────────────

vi.mock('../app/auth', () => ({
    getToken : vi.fn().mockResolvedValue('mock-token')
}));

vi.mock('../app/odataHelper', () => ({
    orgUrl       : 'https://org.crm.dynamics.com',
    apiVersion   : 'v9.2',
    buildHeaders : vi.fn((_token : string, extra? : Record<string, string>) => ({
        Authorization : 'Bearer mock-token',
        ...extra
    }))
}));

let fetchSpy : ReturnType<typeof vi.spyOn>;

function mockResponse(body : unknown, opts : Partial<Response> = {}) : Response {
    return {
        ok          : true,
        status      : 200,
        statusText  : 'OK',
        json        : () => Promise.resolve(body),
        text        : () => Promise.resolve(JSON.stringify(body)),
        headers     : new Headers(),
        redirected  : false,
        type        : 'basic',
        url         : '',
        clone       : () => mockResponse(body, opts),
        body        : null,
        bodyUsed    : false,
        arrayBuffer : () => Promise.resolve(new ArrayBuffer(0)),
        blob        : () => Promise.resolve(new Blob()),
        formData    : () => Promise.resolve(new FormData()),
        bytes       : () => Promise.resolve(new Uint8Array()),
        ...opts
    } as Response;
}

// Mock localStorage
const storageMap = new Map<string, string>();
const localStorageMock = {
    getItem : vi.fn((key : string) => storageMap.get(key) ?? null),
    setItem : vi.fn((key : string, value : string) => {
        storageMap.set(key, value);
    }),
    removeItem : vi.fn((key : string) => {
        storageMap.delete(key);
    }),
    clear : vi.fn(() => storageMap.clear()),
    get length() {
        return storageMap.size;
    },
    key : vi.fn(() => null)
};
Object.defineProperty(globalThis, 'localStorage', { value : localStorageMock, writable : true });

beforeEach(async() => {
    storageMap.clear();
    resetTimesheetSettings();
    // Drain any pending microtasks from a previous test's background refreshFromD365()
    for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
    // Reset again in case a background refresh set cachedSettings during the drain
    resetTimesheetSettings();
    storageMap.clear();
    vi.clearAllMocks();
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse({ value : [] }));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    // Restore fetch spy to prevent stacking of spies across tests
    fetchSpy?.mockRestore();
});

// ── getTimesheetSettings (sync) ─────────────────────────────────────

describe('getTimesheetSettings', () => {
    it('returns defaults before loading', () => {
        const s = getTimesheetSettings();
        expect(s.submitAndComplete).toBe(false);
        expect(s.maxHours).toBe(24);
        expect(s.minIncrement).toBe(0.25);
        expect(s.internalProjectIds).toEqual([]);
        expect(s.requireProject).toBe(true);
        expect(s.requireTask).toBe(false);
    });
});

// ── resetTimesheetSettings ──────────────────────────────────────────

describe('resetTimesheetSettings', () => {
    it('clears cache and localStorage', () => {
        storageMap.set('ws-timesheet-settings', JSON.stringify({ maxHours : 12 }));
        resetTimesheetSettings();
        expect(localStorageMock.removeItem).toHaveBeenCalledWith('ws-timesheet-settings');
        // After reset, should return defaults
        expect(getTimesheetSettings().maxHours).toBe(24);
    });
});

// ── loadTimesheetSettings ───────────────────────────────────────────

describe('loadTimesheetSettings', () => {
    it('loads from D365 when no localStorage', async() => {
        // Env var definitions
        fetchSpy
            .mockResolvedValueOnce(mockResponse({
                value : [
                    { environmentvariabledefinitionid : 'd1', schemaname : 'ws_timesheetmaxhours', defaultvalue : '12', type : 100000000 },
                    { environmentvariabledefinitionid : 'd2', schemaname : 'ws_timesheetminincrement', defaultvalue : '0.5', type : 100000000 }
                ]
            }))
            // Env var values (empty — use defaults from definitions)
            .mockResolvedValueOnce(mockResponse({ value : [] }));

        const settings = await loadTimesheetSettings();
        expect(settings.maxHours).toBe(12);
        expect(settings.minIncrement).toBe(0.5);
    });

    it('loads from localStorage first (fast path)', async() => {
        const cached = { submitAndComplete : true, maxHours : 10, minIncrement : 0.5, internalProjectIds : ['p1'], requireProject : true, requireTask : true };
        storageMap.set('ws-timesheet-settings', JSON.stringify(cached));

        // D365 refresh calls (background)
        fetchSpy
            .mockResolvedValue(mockResponse({ value : [] }));

        const settings = await loadTimesheetSettings();
        expect(settings.maxHours).toBe(10);
        expect(settings.submitAndComplete).toBe(true);

        // The localStorage path fires an un-awaited refreshFromD365() in
        // the background.  Drain multiple microtask cycles so it finishes
        // within this test and doesn't leak into subsequent tests.
        for (let i = 0; i < 5; i++) {
            await new Promise((r) => setTimeout(r, 0));
        }
    });

    it('caches result after first load', async() => {
        fetchSpy
            .mockResolvedValueOnce(mockResponse({ value : [] }))
            .mockResolvedValueOnce(mockResponse({ value : [] }));

        const first = await loadTimesheetSettings();
        const second = await loadTimesheetSettings();
        expect(first).toBe(second);
        // Only 1 fetch call: definitions returns empty → values request is skipped
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('parses env var values from D365', async() => {
        fetchSpy
            .mockResolvedValueOnce(mockResponse({
                value : [
                    { environmentvariabledefinitionid : 'd1', schemaname : 'ws_timesheetsubmitcomplete', defaultvalue : null, type : 100000000 },
                    { environmentvariabledefinitionid : 'd2', schemaname : 'ws_timesheetinternalproject', defaultvalue : null, type : 100000000 }
                ]
            }))
            .mockResolvedValueOnce(mockResponse({
                value : [
                    { environmentvariablevalueid : 'v1', _environmentvariabledefinitionid_value : 'd1', value : 'true' },
                    { environmentvariablevalueid : 'v2', _environmentvariabledefinitionid_value : 'd2', value : 'proj-a, proj-b' }
                ]
            }));

        const settings = await loadTimesheetSettings();
        expect(settings.submitAndComplete).toBe(true);
        expect(settings.internalProjectIds).toEqual(['proj-a', 'proj-b']);
    });

    it('falls back to defaults on fetch error', async() => {
        fetchSpy.mockResolvedValueOnce(mockResponse(null, { ok : false, status : 500 }));

        const settings = await loadTimesheetSettings();
        expect(settings.maxHours).toBe(24);
        expect(settings.minIncrement).toBe(0.25);
    });

    it('persists to localStorage after D365 load', async() => {
        fetchSpy
            .mockResolvedValueOnce(mockResponse({
                value : [
                    { environmentvariabledefinitionid : 'd1', schemaname : 'ws_timesheetmaxhours', defaultvalue : '16', type : 100000000 }
                ]
            }))
            .mockResolvedValueOnce(mockResponse({ value : [] }));

        await loadTimesheetSettings();
        expect(localStorageMock.setItem).toHaveBeenCalledWith(
            'ws-timesheet-settings',
            expect.stringContaining('"maxHours":16')
        );
    });

    it('defaults completedReasonId to null and enforceAllVariations to false', async() => {
        fetchSpy
            .mockResolvedValueOnce(mockResponse({ value : [] }))
            .mockResolvedValueOnce(mockResponse({ value : [] }));

        const settings = await loadTimesheetSettings();
        expect(settings.completedReasonId).toBeNull();
        expect(settings.enforceAllVariations).toBe(false);
    });

    it('parses completedReasonId from D365 env var', async() => {
        fetchSpy
            .mockResolvedValueOnce(mockResponse({
                value : [
                    { environmentvariabledefinitionid : 'd1', schemaname : 'ws_timesheetcompletedreasonid', defaultvalue : null, type : 100000000 }
                ]
            }))
            .mockResolvedValueOnce(mockResponse({
                value : [
                    { environmentvariablevalueid : 'v1', _environmentvariabledefinitionid_value : 'd1', value : 'abc-123-reason' }
                ]
            }));

        const settings = await loadTimesheetSettings();
        expect(settings.completedReasonId).toBe('abc-123-reason');
    });

    it('parses enforceAllVariations from D365 env var', async() => {
        fetchSpy
            .mockResolvedValueOnce(mockResponse({
                value : [
                    { environmentvariabledefinitionid : 'd1', schemaname : 'ws_timesheetenforceallvariations', defaultvalue : null, type : 100000000 }
                ]
            }))
            .mockResolvedValueOnce(mockResponse({
                value : [
                    { environmentvariablevalueid : 'v1', _environmentvariabledefinitionid_value : 'd1', value : 'true' }
                ]
            }));

        const settings = await loadTimesheetSettings();
        expect(settings.enforceAllVariations).toBe(true);
    });
});
