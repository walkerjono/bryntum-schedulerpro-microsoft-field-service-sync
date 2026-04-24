import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';

// Mock auth before importing timesheetCrud
vi.mock('../app/auth', () => ({
    getToken : vi.fn().mockResolvedValue('mock-token-123')
}));

import {
    getTimeEntries,
    createTimeEntry,
    updateTimeEntry,
    deleteTimeEntry,
    submitTimeEntries,
    recallTimeEntry
} from '../app/timesheetCrud';
import { TimeEntryType } from '../types/timesheet';
import type { CreateTimeEntryPayload, UpdateTimeEntryPayload } from '../types/timesheet';

// ── Test helpers ────────────────────────────────────────────────────

function mockResponse(body: unknown, { ok = true, statusText = 'OK', status = 200 } = {}): Response {
    return {
        ok,
        status,
        statusText,
        json : () => Promise.resolve(body),
        text : () => Promise.resolve(JSON.stringify(body))
    } as unknown as Response;
}

function odataPage(value: unknown[], nextLink: string | null = null): Record<string, unknown> {
    const body: Record<string, unknown> = { value };
    if (nextLink) body['@odata.nextLink'] = nextLink;
    return body;
}

describe('timesheetCrud', () => {
    let fetchSpy: Mock;

    beforeEach(() => {
        fetchSpy = vi.spyOn(globalThis, 'fetch') as unknown as Mock;
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // ── getTimeEntries ──────────────────────────────────────────
    describe('getTimeEntries', () => {
        it('returns time entries from a single-page response', async() => {
            const entries = [{ msdyn_timeentryid : 'te-001' }];
            fetchSpy.mockResolvedValueOnce(mockResponse(odataPage(entries)));

            const result = await getTimeEntries();

            expect(result.value).toEqual(entries);
            expect(fetchSpy).toHaveBeenCalledTimes(1);
        });

        it('includes Authorization header', async() => {
            fetchSpy.mockResolvedValueOnce(mockResponse(odataPage([])));

            await getTimeEntries();

            const callHeaders = (fetchSpy.mock.calls[0] as [string, RequestInit])[1].headers as Record<string, string>;
            expect(callHeaders['Authorization']).toBe('Bearer mock-token-123');
        });

        it('follows @odata.nextLink for paginated responses', async() => {
            const page1 = [{ msdyn_timeentryid : 'te-001' }];
            const page2 = [{ msdyn_timeentryid : 'te-002' }];

            fetchSpy
                .mockResolvedValueOnce(mockResponse(odataPage(page1, 'https://next-page')))
                .mockResolvedValueOnce(mockResponse(odataPage(page2)));

            const result = await getTimeEntries();

            expect(result.value).toEqual([...page1, ...page2]);
            expect(fetchSpy).toHaveBeenCalledTimes(2);
        });

        it('applies date and resource filters when provided', async() => {
            fetchSpy.mockResolvedValueOnce(mockResponse(odataPage([])));

            await getTimeEntries({
                rangeStart : new Date('2026-06-08'),
                rangeEnd   : new Date('2026-06-14'),
                resourceId : 'res-001'
            });

            const url = (fetchSpy.mock.calls[0] as [string])[0];
            expect(url).toContain('msdyn_date ge');
            expect(url).toContain("_msdyn_bookableresource_value eq 'res-001'");
        });

        it('throws on HTTP error', async() => {
            fetchSpy.mockResolvedValueOnce(mockResponse(
                { error : 'Unauthorized' },
                { ok : false, statusText : 'Unauthorized' }
            ));

            await expect(getTimeEntries()).rejects.toThrow('Failed to fetch time entries');
        });
    });

    // ── createTimeEntry ─────────────────────────────────────────
    describe('createTimeEntry', () => {
        it('sends POST and returns the created record', async() => {
            const createdRecord = { msdyn_timeentryid : 'te-new' };
            fetchSpy.mockResolvedValueOnce(mockResponse(createdRecord));

            const payload: CreateTimeEntryPayload = {
                msdyn_date                          : '2026-06-09',
                msdyn_duration                      : 120,
                msdyn_type                          : TimeEntryType.Work,
                'msdyn_bookableresource@odata.bind' : '/bookableresources(res-001)'
            };

            const result = await createTimeEntry(payload);

            expect(result.msdyn_timeentryid).toBe('te-new');
            expect(fetchSpy).toHaveBeenCalledTimes(1);
            const [, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
            expect(opts.method).toBe('POST');
        });

        it('throws on HTTP error', async() => {
            fetchSpy.mockResolvedValueOnce(mockResponse(
                { error : 'Bad Request' },
                { ok : false, statusText : 'Bad Request' }
            ));

            await expect(createTimeEntry({
                msdyn_date                          : '2026-06-09',
                msdyn_duration                      : 120,
                msdyn_type                          : TimeEntryType.Work,
                'msdyn_bookableresource@odata.bind' : '/bookableresources(res-001)'
            })).rejects.toThrow('Failed to create time entry');
        });
    });

    // ── updateTimeEntry ─────────────────────────────────────────
    describe('updateTimeEntry', () => {
        it('sends PATCH with payload', async() => {
            fetchSpy.mockResolvedValueOnce(mockResponse(null, { status : 204 }));

            const payload: UpdateTimeEntryPayload = { msdyn_duration : 180 };
            await updateTimeEntry('te-001', payload);

            const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
            expect(url).toContain('msdyn_timeentries(te-001)');
            expect(opts.method).toBe('PATCH');
        });

        it('includes If-Match header when etag provided', async() => {
            fetchSpy.mockResolvedValueOnce(mockResponse(null, { status : 204 }));

            await updateTimeEntry('te-001', { msdyn_duration : 180 }, 'W/"12345"');

            const headers = (fetchSpy.mock.calls[0] as [string, RequestInit])[1].headers as Record<string, string>;
            expect(headers['If-Match']).toBe('W/"12345"');
        });

        it('throws specific message on 412 conflict', async() => {
            fetchSpy.mockResolvedValueOnce(mockResponse(
                { error : 'Conflict' },
                { ok : false, statusText : 'Precondition Failed', status : 412 }
            ));

            await expect(updateTimeEntry('te-001', { msdyn_duration : 180 }, 'W/"old"'))
                .rejects.toThrow('Concurrency conflict');
        });

        it('throws on other HTTP errors', async() => {
            fetchSpy.mockResolvedValueOnce(mockResponse(
                { error : 'Server Error' },
                { ok : false, statusText : 'Internal Server Error' }
            ));

            await expect(updateTimeEntry('te-001', { msdyn_duration : 180 }))
                .rejects.toThrow('Failed to update time entry');
        });
    });

    // ── deleteTimeEntry ─────────────────────────────────────────
    describe('deleteTimeEntry', () => {
        it('sends DELETE request', async() => {
            fetchSpy.mockResolvedValueOnce(mockResponse(null, { status : 204 }));

            await deleteTimeEntry('te-001');

            const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
            expect(url).toContain('msdyn_timeentries(te-001)');
            expect(opts.method).toBe('DELETE');
        });

        it('tolerates 404 (already deleted)', async() => {
            fetchSpy.mockResolvedValueOnce(mockResponse(
                null,
                { ok : false, statusText : 'Not Found', status : 404 }
            ));

            await expect(deleteTimeEntry('te-001')).resolves.toBeUndefined();
        });

        it('throws on other HTTP errors', async() => {
            fetchSpy.mockResolvedValueOnce(mockResponse(
                { error : 'Forbidden' },
                { ok : false, statusText : 'Forbidden', status : 403 }
            ));

            await expect(deleteTimeEntry('te-001')).rejects.toThrow('Failed to delete time entry');
        });
    });

    // ── submitTimeEntries ───────────────────────────────────────
    describe('submitTimeEntries', () => {
        it('calls the submit action endpoint', async() => {
            fetchSpy.mockResolvedValueOnce(mockResponse(null));

            await submitTimeEntries(['te-001', 'te-002']);

            const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
            expect(url).toContain('msdyn_TimeEntrySubmit');
            expect(opts.method).toBe('POST');
            const body = JSON.parse(opts.body as string);
            expect(body.TimeEntries).toHaveLength(2);
        });

        it('falls back to PATCH when action fails', async() => {
            // Action fails
            fetchSpy.mockResolvedValueOnce(mockResponse(
                { error : 'Not Found' },
                { ok : false, statusText : 'Not Found' }
            ));
            // Fallback PATCH succeeds for each entry
            fetchSpy.mockResolvedValue(mockResponse(null, { status : 204 }));

            await submitTimeEntries(['te-001']);

            // 1 action call + 1 PATCH call
            expect(fetchSpy).toHaveBeenCalledTimes(2);
        });
    });

    // ── recallTimeEntry ─────────────────────────────────────────
    describe('recallTimeEntry', () => {
        it('calls the recall action endpoint', async() => {
            fetchSpy.mockResolvedValueOnce(mockResponse(null));

            await recallTimeEntry('te-001');

            const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
            expect(url).toContain('msdyn_TimeEntryRecall');
            expect(opts.method).toBe('POST');
        });

        it('throws on HTTP error', async() => {
            fetchSpy.mockResolvedValueOnce(mockResponse(
                { error : 'Bad Request' },
                { ok : false, statusText : 'Bad Request' }
            ));

            await expect(recallTimeEntry('te-001')).rejects.toThrow('Failed to recall time entry');
        });
    });
});
