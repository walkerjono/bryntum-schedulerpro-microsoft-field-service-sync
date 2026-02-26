import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock auth.js before importing crudFunctions
vi.mock('../app/auth.js', () => ({
    getToken : vi.fn().mockResolvedValue('mock-token-123')
}));

import { getResources, getResourcePractices, getAssignments } from '../app/crudFunctions';

// ── Test helpers ────────────────────────────────────────────────────
/** Build a mock Response object */
function mockResponse(body, { ok = true, statusText = 'OK' } = {}) {
    return {
        ok,
        statusText,
        json : () => Promise.resolve(body),
        text : () => Promise.resolve(JSON.stringify(body))
    };
}

/** Single-page OData response */
function odataPage(value, nextLink = null) {
    const body = { value };
    if (nextLink) body['@odata.nextLink'] = nextLink;
    return body;
}

describe('crudFunctions', () => {
    let fetchSpy;

    beforeEach(() => {
        fetchSpy = vi.spyOn(globalThis, 'fetch');
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // ── getResources ─────────────────────────────────────────────
    describe('getResources', () => {
        it('returns resources from single-page response', async () => {
            const resources = [{ bookableresourceid : 'r1', name : 'Alice' }];
            fetchSpy.mockResolvedValueOnce(mockResponse(odataPage(resources)));

            const result = await getResources();

            expect(result.value).toEqual(resources);
            expect(fetchSpy).toHaveBeenCalledTimes(1);
            // Check Authorization header
            const callHeaders = fetchSpy.mock.calls[0][1].headers;
            expect(callHeaders['Authorization']).toBe('Bearer mock-token-123');
        });

        it('follows @odata.nextLink for paginated responses', async () => {
            const page1 = [{ bookableresourceid : 'r1' }];
            const page2 = [{ bookableresourceid : 'r2' }];

            fetchSpy
                .mockResolvedValueOnce(mockResponse(odataPage(page1, 'https://next-page-url')))
                .mockResolvedValueOnce(mockResponse(odataPage(page2)));

            const result = await getResources();

            expect(result.value).toEqual([...page1, ...page2]);
            expect(fetchSpy).toHaveBeenCalledTimes(2);
            expect(fetchSpy.mock.calls[1][0]).toBe('https://next-page-url');
        });

        it('throws on HTTP error', async () => {
            fetchSpy.mockResolvedValueOnce(mockResponse(
                { error : 'Unauthorized' },
                { ok : false, statusText : 'Unauthorized' }
            ));

            await expect(getResources()).rejects.toThrow('Failed to fetch resources');
        });
    });

    // ── getResourcePractices ─────────────────────────────────────
    describe('getResourcePractices', () => {
        it('returns practiceMap and roleMap', async () => {
            const assns = [{
                _resource_value : 'r1',
                ResourceCategory : {
                    name : 'Developer',
                    ws_practice : null,
                    'ws_practice@OData.Community.Display.V1.FormattedValue' : 'Engineering'
                }
            }];
            fetchSpy.mockResolvedValueOnce(mockResponse(odataPage(assns)));

            const { practiceMap, roleMap } = await getResourcePractices();

            expect(practiceMap.get('r1')).toBe('Engineering');
            expect(roleMap.get('r1')).toBe('Developer');
        });

        it('falls back to raw ws_practice when formatted value missing', async () => {
            const assns = [{
                _resource_value : 'r2',
                ResourceCategory : {
                    name : 'Analyst',
                    ws_practice : 'Analytics'
                }
            }];
            fetchSpy.mockResolvedValueOnce(mockResponse(odataPage(assns)));

            const { practiceMap } = await getResourcePractices();

            expect(practiceMap.get('r2')).toBe('Analytics');
        });

        it('uses "Unassigned" when category name is empty', async () => {
            const assns = [{
                _resource_value : 'r3',
                ResourceCategory : { name : '' }
            }];
            fetchSpy.mockResolvedValueOnce(mockResponse(odataPage(assns)));

            const { roleMap } = await getResourcePractices();

            expect(roleMap.get('r3')).toBe('Unassigned');
        });

        it('skips records without ResourceCategory', async () => {
            const assns = [
                { _resource_value : 'r4', ResourceCategory : null },
                { _resource_value : null, ResourceCategory : { name : 'Test' } }
            ];
            fetchSpy.mockResolvedValueOnce(mockResponse(odataPage(assns)));

            const { practiceMap, roleMap } = await getResourcePractices();

            expect(practiceMap.size).toBe(0);
            expect(roleMap.size).toBe(0);
        });
    });

    // ── getAssignments ───────────────────────────────────────────
    describe('getAssignments', () => {
        it('fetches assignments without date range', async () => {
            const assignments = [{ msdyn_resourceassignmentid : 'a1' }];
            fetchSpy.mockResolvedValueOnce(mockResponse(odataPage(assignments)));

            const result = await getAssignments();

            expect(result.value).toEqual(assignments);
            const url = fetchSpy.mock.calls[0][0];
            expect(url).not.toContain('msdyn_finish ge');
        });

        it('adds date overlap filter when range is supplied', async () => {
            fetchSpy.mockResolvedValueOnce(mockResponse(odataPage([])));

            const rangeStart = new Date('2026-03-01T00:00:00Z');
            const rangeEnd   = new Date('2026-03-31T00:00:00Z');
            await getAssignments({ rangeStart, rangeEnd });

            const url = fetchSpy.mock.calls[0][0];
            expect(url).toContain('msdyn_finish ge 2026-03-01');
            expect(url).toContain('msdyn_start le 2026-03-31');
        });

        it('includes Prefer header for annotations', async () => {
            fetchSpy.mockResolvedValueOnce(mockResponse(odataPage([])));

            await getAssignments();

            const headers = fetchSpy.mock.calls[0][1].headers;
            expect(headers['Prefer']).toContain('OData.Community.Display.V1.FormattedValue');
        });
    });

    // ── Pagination edge cases ────────────────────────────────────
    describe('pagination', () => {
        it('stops after max pages and logs a warning', async () => {
            // The module reads VITE_ODATA_MAX_PAGES from env (fallback 20).
            // To avoid 20 fetch calls, we exploit fetchAllPages's pageLimit option
            // indirectly — we'll just verify that the module-level maxPages default
            // works by simulating 3 pages with a nextLink loop.
            // Since we can't set the page limit from outside, we'll simulate an
            // infinite pagination loop and verify the warning appears.
            const infinitePage = odataPage([{ id : 'x' }], 'https://next');

            // Set up enough fetch mocks to cover maxPages + 1 calls
            for (let i = 0; i < 25; i++) {
                fetchSpy.mockResolvedValueOnce(mockResponse(infinitePage));
            }

            const result = await getResources();

            // Should have stopped after the module's maxPages limit
            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining('max page limit')
            );
            // Should still return all records collected so far
            expect(result.value.length).toBeGreaterThan(0);
        });

        it('handles empty value arrays gracefully', async () => {
            fetchSpy.mockResolvedValueOnce(mockResponse(odataPage([])));

            const result = await getResources();

            expect(result.value).toEqual([]);
        });
    });
});
