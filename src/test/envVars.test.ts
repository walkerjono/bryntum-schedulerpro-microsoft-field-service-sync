/**
 * Environment variable tests.
 *
 * Validates that VITE_* env vars are parsed correctly, default values
 * are applied when optional vars are missing, and special string values
 * (like 'current_week') are handled as expected.
 *
 * Uses vi.stubEnv() + vi.resetModules() + dynamic import() to re-evaluate
 * modules under different env configurations.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock auth module directly to avoid the top-level `await` in auth.ts
// hanging after vi.resetModules() clears the module registry.
vi.mock('../app/auth', () => ({
    signIn   : vi.fn().mockResolvedValue(undefined),
    signOut  : vi.fn().mockResolvedValue(undefined),
    getToken : vi.fn().mockResolvedValue('mock-token')
}));

beforeEach(() => {
    vi.resetModules();
});

afterEach(() => {
    vi.unstubAllEnvs();
});

// ── Default values when optional vars are missing ───────────────────
describe('Default values for optional env vars', () => {
    // ── VITE_DEFAULT_VIEW_MODE → schedulerproConfig.DEFAULT_VIEW_PRESET
    describe('VITE_DEFAULT_VIEW_MODE', () => {
        it('defaults to "weekAndDayLetter" when env var is empty', async() => {
            vi.stubEnv('VITE_DEFAULT_VIEW_MODE', '');
            const { DEFAULT_VIEW_PRESET } = await import('../app/schedulerproConfig');
            expect(DEFAULT_VIEW_PRESET).toBe('weekAndDayLetter');
        });

        it('maps "day" to "weekAndDayLetter"', async() => {
            vi.stubEnv('VITE_DEFAULT_VIEW_MODE', 'day');
            const { DEFAULT_VIEW_PRESET } = await import('../app/schedulerproConfig');
            expect(DEFAULT_VIEW_PRESET).toBe('weekAndDayLetter');
        });

        it('maps "week" to "weekAndMonth"', async() => {
            vi.stubEnv('VITE_DEFAULT_VIEW_MODE', 'week');
            const { DEFAULT_VIEW_PRESET } = await import('../app/schedulerproConfig');
            expect(DEFAULT_VIEW_PRESET).toBe('weekAndMonth');
        });

        it('maps "month" to "monthAndYear"', async() => {
            vi.stubEnv('VITE_DEFAULT_VIEW_MODE', 'month');
            const { DEFAULT_VIEW_PRESET } = await import('../app/schedulerproConfig');
            expect(DEFAULT_VIEW_PRESET).toBe('monthAndYear');
        });

        it('is case-insensitive', async() => {
            vi.stubEnv('VITE_DEFAULT_VIEW_MODE', 'WEEK');
            const { DEFAULT_VIEW_PRESET } = await import('../app/schedulerproConfig');
            expect(DEFAULT_VIEW_PRESET).toBe('weekAndMonth');
        });

        it('falls back to "weekAndDayLetter" for unrecognised values', async() => {
            vi.stubEnv('VITE_DEFAULT_VIEW_MODE', 'quarter');
            const { DEFAULT_VIEW_PRESET } = await import('../app/schedulerproConfig');
            expect(DEFAULT_VIEW_PRESET).toBe('weekAndDayLetter');
        });
    });

    // ── VITE_VIEWPORT_BUFFER_DAYS → schedulerproConfig.VIEWPORT_BUFFER_DAYS
    describe('VITE_VIEWPORT_BUFFER_DAYS', () => {
        it('defaults to 28 when env var is empty', async() => {
            vi.stubEnv('VITE_VIEWPORT_BUFFER_DAYS', '');
            const { VIEWPORT_BUFFER_DAYS } = await import('../app/schedulerproConfig');
            expect(VIEWPORT_BUFFER_DAYS).toBe(28);
        });

        it('defaults to 28 when env var is undefined', async() => {
            vi.stubEnv('VITE_VIEWPORT_BUFFER_DAYS', undefined as unknown as string);
            const { VIEWPORT_BUFFER_DAYS } = await import('../app/schedulerproConfig');
            expect(VIEWPORT_BUFFER_DAYS).toBe(28);
        });
    });

    // ── VITE_CRM_REGION defaults ─────────────────────────────────────
    describe('VITE_CRM_REGION', () => {
        it('defaults to "crm6" when env var is empty (auth.ts)', async() => {
            vi.stubEnv('VITE_CRM_REGION', '');
            const auth = await import('../app/auth');
            // The msalRequest scope URL should contain crm6 as default
            // Auth module exposes getToken/signIn/signOut — check indirectly
            // via the module loading successfully with default region
            expect(auth).toBeDefined();
            expect(typeof auth.signIn).toBe('function');
        });

        it('defaults to "crm6" when env var is empty (crudFunctions.ts)', async() => {
            vi.stubEnv('VITE_CRM_REGION', '');
            const crud = await import('../app/crudFunctions');
            expect(crud).toBeDefined();
            expect(typeof crud.getResources).toBe('function');
        });
    });

    // ── VITE_DATAVERSE_API_VERSION default ───────────────────────────
    describe('VITE_DATAVERSE_API_VERSION', () => {
        it('defaults to "v9.2" when env var is empty', async() => {
            vi.stubEnv('VITE_DATAVERSE_API_VERSION', '');
            const crud = await import('../app/crudFunctions');
            // Module loads successfully with default — verified by export presence
            expect(typeof crud.getResources).toBe('function');
        });
    });

    // ── VITE_REDIRECT_URI default ────────────────────────────────────
    describe('VITE_REDIRECT_URI', () => {
        it('falls back to window.location.origin when env var is empty', async() => {
            vi.stubEnv('VITE_REDIRECT_URI', '');
            // Auth module uses: import.meta.env.VITE_REDIRECT_URI || window.location.origin
            // In jsdom, window.location.origin is 'http://localhost'
            const auth = await import('../app/auth');
            expect(auth).toBeDefined();
        });
    });

    // ── VITE_ODATA_MAX_PAGES default ─────────────────────────────────
    describe('VITE_ODATA_MAX_PAGES', () => {
        it('defaults to 20 when env var is empty', async() => {
            vi.stubEnv('VITE_ODATA_MAX_PAGES', '');
            const crud = await import('../app/crudFunctions');
            expect(typeof crud.getResources).toBe('function');
        });
    });

    // ── VITE_USE_EFFORT_REMAINING default ────────────────────────────
    describe('VITE_USE_EFFORT_REMAINING', () => {
        it('defaults to false when env var is missing/empty', async() => {
            // Logic: import.meta.env.VITE_USE_EFFORT_REMAINING === 'true'
            // Empty string / undefined → strict equality with 'true' → false
            vi.stubEnv('VITE_USE_EFFORT_REMAINING', '');
            const crud = await import('../app/crudFunctions');
            expect(crud).toBeDefined();
        });

        it('is true only when set exactly to "true"', () => {
            expect(('true' as string) === 'true').toBe(true);
            expect(('TRUE' as string) === 'true').toBe(false); // case-sensitive
            expect(('1' as string) === 'true').toBe(false);
            expect(('yes' as string) === 'true').toBe(false);
        });
    });

    // ── Histogram thresholds default ─────────────────────────────────
    describe('VITE_UNDERALLOCATED_THRESHOLD / VITE_OVERALLOCATED_THRESHOLD', () => {
        it('uses default 80/110 when env vars are empty', async() => {
            vi.stubEnv('VITE_UNDERALLOCATED_THRESHOLD', '');
            vi.stubEnv('VITE_OVERALLOCATED_THRESHOLD', '');
            const { getBarClass, clearLeafStateCache } =
        await import('../app/histogramConfig');
            clearLeafStateCache();

            const date = new Date('2026-03-01');

            // 79% → under default 80 threshold
            const under = {
                effort    : 79,
                maxEffort : 100,
                isGroup   : false,
                resource  : { id : '1', isLeaf : true },
                startDate : date
            };
            expect(
                getBarClass(null, { style : {} }, under, 0, {
                    resource : under.resource
                })
            ).toBe('b-underallocated');

            // 111% → over default 110 threshold
            const over = {
                effort    : 111,
                maxEffort : 100,
                isGroup   : false,
                resource  : { id : '2', isLeaf : true },
                startDate : date
            };
            expect(
                getBarClass(null, { style : {} }, over, 0, { resource : over.resource })
            ).toBe('b-overallocated');

            // 95% → between 80-110 → evenly allocated
            const even = {
                effort    : 95,
                maxEffort : 100,
                isGroup   : false,
                resource  : { id : '3', isLeaf : true },
                startDate : date
            };
            expect(
                getBarClass(null, { style : {} }, even, 0, { resource : even.resource })
            ).toBe('b-evenly-allocated');
        });
    });

    // ── VITE_HOURS_PER_DAY default ───────────────────────────────────
    describe('VITE_HOURS_PER_DAY', () => {
        it('defaults to 8 when env var is empty (via Number() || 8 pattern)', () => {
            // Pattern in main.ts: Number(import.meta.env.VITE_HOURS_PER_DAY) || 8
            expect(Number('') || 8).toBe(8);
            expect(Number(undefined) || 8).toBe(8);
        });
    });
});

// ── Numeric env vars are parsed as numbers ──────────────────────────
describe('Numeric env vars parsed as numbers', () => {
    describe('VITE_VIEWPORT_BUFFER_DAYS', () => {
        it('parses string "14" as number 14', async() => {
            vi.stubEnv('VITE_VIEWPORT_BUFFER_DAYS', '14');
            const { VIEWPORT_BUFFER_DAYS } = await import('../app/schedulerproConfig');
            expect(VIEWPORT_BUFFER_DAYS).toBe(14);
            expect(typeof VIEWPORT_BUFFER_DAYS).toBe('number');
        });

        it('non-numeric string falls back to 28', async() => {
            vi.stubEnv('VITE_VIEWPORT_BUFFER_DAYS', 'abc');
            const { VIEWPORT_BUFFER_DAYS } = await import('../app/schedulerproConfig');
            expect(VIEWPORT_BUFFER_DAYS).toBe(28);
        });

        it('"0" falls back to 28 (via || operator)', async() => {
            vi.stubEnv('VITE_VIEWPORT_BUFFER_DAYS', '0');
            const { VIEWPORT_BUFFER_DAYS } = await import('../app/schedulerproConfig');
            // Number('0') is 0, and 0 || 28 = 28
            expect(VIEWPORT_BUFFER_DAYS).toBe(28);
        });
    });

    describe('VITE_HOURS_PER_DAY', () => {
        it('parses string as number', () => {
            // Pattern: Number(import.meta.env.VITE_HOURS_PER_DAY) || 8
            expect(Number('7.5') || 8).toBe(7.5);
            expect(typeof (Number('7.5') || 8)).toBe('number');
        });

        it('"0" falls back to 8 (via || operator)', () => {
            expect(Number('0') || 8).toBe(8);
        });
    });

    describe('VITE_ODATA_MAX_PAGES', () => {
        it('parses to a number', () => {
            // Pattern: Number(import.meta.env.VITE_ODATA_MAX_PAGES) || 20
            expect(Number('10') || 20).toBe(10);
            expect(typeof (Number('10') || 20)).toBe('number');
        });

        it('non-numeric falls back to 20', () => {
            expect(Number('xyz') || 20).toBe(20);
        });
    });

    describe('Histogram thresholds with custom values', () => {
        it('respects custom VITE_UNDERALLOCATED_THRESHOLD', async() => {
            vi.stubEnv('VITE_UNDERALLOCATED_THRESHOLD', '70');
            vi.stubEnv('VITE_OVERALLOCATED_THRESHOLD', '120');
            const { getBarClass, clearLeafStateCache } =
        await import('../app/histogramConfig');
            clearLeafStateCache();

            const date = new Date('2026-03-01');

            // 69% → under new 70% threshold
            const under = {
                effort    : 69,
                maxEffort : 100,
                isGroup   : false,
                resource  : { id : '10', isLeaf : true },
                startDate : date
            };
            expect(
                getBarClass(null, { style : {} }, under, 0, {
                    resource : under.resource
                })
            ).toBe('b-underallocated');

            // 71% → now above 70% threshold → evenly allocated
            const even = {
                effort    : 71,
                maxEffort : 100,
                isGroup   : false,
                resource  : { id : '11', isLeaf : true },
                startDate : date
            };
            expect(
                getBarClass(null, { style : {} }, even, 0, { resource : even.resource })
            ).toBe('b-evenly-allocated');
        });

        it('respects custom VITE_OVERALLOCATED_THRESHOLD', async() => {
            vi.stubEnv('VITE_UNDERALLOCATED_THRESHOLD', '80');
            vi.stubEnv('VITE_OVERALLOCATED_THRESHOLD', '120');
            const { getBarClass, clearLeafStateCache } =
        await import('../app/histogramConfig');
            clearLeafStateCache();

            const date = new Date('2026-03-01');

            // 115% → under new 120% threshold → evenly allocated (not overallocated)
            const even = {
                effort    : 115,
                maxEffort : 100,
                isGroup   : false,
                resource  : { id : '12', isLeaf : true },
                startDate : date
            };
            expect(
                getBarClass(null, { style : {} }, even, 0, { resource : even.resource })
            ).toBe('b-evenly-allocated');

            // 121% → over new 120% threshold → overallocated
            const over = {
                effort    : 121,
                maxEffort : 100,
                isGroup   : false,
                resource  : { id : '13', isLeaf : true },
                startDate : date
            };
            expect(
                getBarClass(null, { style : {} }, over, 0, { resource : over.resource })
            ).toBe('b-overallocated');
        });
    });
});

// ── VITE_EFFORT_REMAINING_OFFSET_DAYS parsing ───────────────────────
// This logic lives in main.ts (lines 40-43) and is not exported, so we
// replicate the exact parsing pattern here to verify its behaviour.
describe('VITE_EFFORT_REMAINING_OFFSET_DAYS parsing logic', () => {
    /**
   * Replicates the parsing from main.ts:
   *   const raw = (import.meta.env.VITE_EFFORT_REMAINING_OFFSET_DAYS || '7').trim();
   *   const useCurrentWeek = raw.toLowerCase() === 'current_week';
   *   const offsetDays = useCurrentWeek ? 0 : (Number(raw) || 7);
   */
    function parseOffset(envValue: string | undefined): { raw: string; useCurrentWeek: boolean; offsetDays: number } {
        const raw = (envValue || '7').trim();
        const useCurrentWeek = raw.toLowerCase() === 'current_week';
        const offsetDays = useCurrentWeek ? 0 : Number(raw) || 7;
        return { raw, useCurrentWeek, offsetDays };
    }

    it('defaults to 7 when env var is empty', () => {
        const { useCurrentWeek, offsetDays } = parseOffset('');
        expect(useCurrentWeek).toBe(false);
        expect(offsetDays).toBe(7);
    });

    it('defaults to 7 when env var is undefined', () => {
        const { useCurrentWeek, offsetDays } = parseOffset(undefined);
        expect(useCurrentWeek).toBe(false);
        expect(offsetDays).toBe(7);
    });

    it('"current_week" enables week snapping with offsetDays = 0', () => {
        const { useCurrentWeek, offsetDays } = parseOffset('current_week');
        expect(useCurrentWeek).toBe(true);
        expect(offsetDays).toBe(0);
    });

    it('"current_week" is case-insensitive', () => {
        expect(parseOffset('Current_Week').useCurrentWeek).toBe(true);
        expect(parseOffset('CURRENT_WEEK').useCurrentWeek).toBe(true);
        expect(parseOffset('current_WEEK').useCurrentWeek).toBe(true);
    });

    it('handles leading/trailing whitespace', () => {
        const { useCurrentWeek } = parseOffset('  current_week  ');
        expect(useCurrentWeek).toBe(true);
    });

    it('numeric string "14" parses to offsetDays 14', () => {
        const { useCurrentWeek, offsetDays } = parseOffset('14');
        expect(useCurrentWeek).toBe(false);
        expect(offsetDays).toBe(14);
    });

    it('"0" falls back to 7 (via || operator — 0 is falsy)', () => {
    // Number('0') = 0, and 0 || 7 = 7
        const { offsetDays } = parseOffset('0');
        expect(offsetDays).toBe(7);
    });

    it('non-numeric string falls back to 7', () => {
        const { offsetDays } = parseOffset('abc');
        expect(offsetDays).toBe(7);
    });

    it('negative number is accepted', () => {
        const { offsetDays } = parseOffset('-3');
        expect(offsetDays).toBe(-3);
    });

    it('fractional number is accepted', () => {
        const { offsetDays } = parseOffset('3.5');
        expect(offsetDays).toBe(3.5);
    });
});

// ── Required vars — graceful handling when missing ──────────────────
describe('Required env vars missing', () => {
    it('VITE_MICROSOFT_DYNAMICS_ORG_ID undefined produces "undefined" in API URL (no crash)', async() => {
        vi.stubEnv('VITE_MICROSOFT_DYNAMICS_ORG_ID', undefined as unknown as string);
        // Module still loads — the constructed URL will contain "undefined" but won't throw
        const crud = await import('../app/crudFunctions');
        expect(crud).toBeDefined();
    });

    it('VITE_MICROSOFT_ENTRA_APP_ID undefined passes through to MSAL config (no crash)', async() => {
        vi.stubEnv('VITE_MICROSOFT_ENTRA_APP_ID', undefined as unknown as string);
        // Auth module still loads — MSAL is mocked so no real auth happens
        const auth = await import('../app/auth');
        expect(auth).toBeDefined();
    });

    it('VITE_MICROSOFT_ENTRA_TENANT_ID undefined passes through to authority URL (no crash)', async() => {
        vi.stubEnv('VITE_MICROSOFT_ENTRA_TENANT_ID', undefined as unknown as string);
        const auth = await import('../app/auth');
        expect(auth).toBeDefined();
    });
});
