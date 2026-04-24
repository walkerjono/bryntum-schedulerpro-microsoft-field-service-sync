import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    getVariationReasons,
    getVariations,
    createVariation,
    updateVariation,
    deleteVariation,
    submitVariations,
    getResourceProjects,
    getProjectTasks,
    getResourceAssignments,
    getHelpTasks,
    createHelpTask,
    getHelpTaskReasons,
    getUserTimesheet,
    createUserTimesheet,
    completeUserTimesheet,
    recallUserTimesheet
} from '../app/timesheetDataService';

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
    })),
    fetchAllPages : vi.fn()
}));

import { fetchAllPages } from '../app/odataHelper';
const mockFetchAllPages = fetchAllPages as ReturnType<typeof vi.fn>;

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

beforeEach(() => {
    vi.clearAllMocks();
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse({}));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});

// ── getVariationReasons ─────────────────────────────────────────────

describe('getVariationReasons', () => {
    it('returns reasons from fetchAllPages', async() => {
        const reasons = [{ ws_timesheetvariationreasonid : 'r1', ws_name : 'Overtime' }];
        mockFetchAllPages.mockResolvedValueOnce({ value : reasons });

        const result = await getVariationReasons();
        expect(result).toEqual(reasons);
        expect(mockFetchAllPages).toHaveBeenCalledTimes(1);
    });
});

// ── getVariations ───────────────────────────────────────────────────

describe('getVariations', () => {
    it('returns empty array for empty resourceId', async() => {
        const result = await getVariations('');
        expect(result).toEqual([]);
        expect(mockFetchAllPages).not.toHaveBeenCalled();
    });

    it('fetches variations for given resource ID', async() => {
        const variations = [{ ws_timesheetvariationid : 'v1', ws_remainingtime : 180 }];
        mockFetchAllPages.mockResolvedValueOnce({ value : variations });

        const result = await getVariations('res-001');
        expect(result).toEqual(variations);
    });
});

// ── createVariation ─────────────────────────────────────────────────

describe('createVariation', () => {
    it('POSTs and returns the created variation', async() => {
        const created = { ws_timesheetvariationid : 'v-new', ws_remainingtime : 300 };
        fetchSpy.mockResolvedValueOnce(mockResponse(created));

        const result = await createVariation({ ws_remainingtime : 300 } as never);
        expect(result).toEqual(created);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const [, options] = fetchSpy.mock.calls[0]!;
        expect(options!.method).toBe('POST');
    });

    it('throws on failure', async() => {
        fetchSpy.mockResolvedValueOnce(mockResponse('error', { ok : false, status : 400 }));
        await expect(createVariation({} as never)).rejects.toThrow('Failed to create variation');
    });
});

// ── updateVariation ─────────────────────────────────────────────────

describe('updateVariation', () => {
    it('PATCHes the variation', async() => {
        fetchSpy.mockResolvedValueOnce(mockResponse(null, { ok : true, status : 204 }));

        await updateVariation('v1', { ws_remainingtime : 600 } as never);
        const [url, options] = fetchSpy.mock.calls[0]!;
        expect(url).toContain('v1');
        expect(options!.method).toBe('PATCH');
    });

    it('throws on failure', async() => {
        fetchSpy.mockResolvedValueOnce(mockResponse('error', { ok : false, status : 500 }));
        await expect(updateVariation('v1', {} as never)).rejects.toThrow('Failed to update variation');
    });
});

// ── deleteVariation ─────────────────────────────────────────────────

describe('deleteVariation', () => {
    it('DELETEs the variation', async() => {
        fetchSpy.mockResolvedValueOnce(mockResponse(null, { ok : true, status : 204 }));

        await deleteVariation('v1');
        const [, options] = fetchSpy.mock.calls[0]!;
        expect(options!.method).toBe('DELETE');
    });

    it('does not throw on 404', async() => {
        fetchSpy.mockResolvedValueOnce(mockResponse('', { ok : false, status : 404 }));
        await expect(deleteVariation('v1')).resolves.toBeUndefined();
    });

    it('throws on non-404 failure', async() => {
        fetchSpy.mockResolvedValueOnce(mockResponse('error', { ok : false, status : 500 }));
        await expect(deleteVariation('v1')).rejects.toThrow('Failed to delete variation');
    });
});

// ── getResourceProjects ─────────────────────────────────────────────

describe('getResourceProjects', () => {
    it('returns projects for a resource', async() => {
        // First call: assignments
        mockFetchAllPages.mockResolvedValueOnce({
            value : [{ _msdyn_projectid_value : 'proj-1' }, { _msdyn_projectid_value : 'proj-2' }]
        });
        // Second call: projects
        const projects = [{ msdyn_projectid : 'proj-1', msdyn_subject : 'Alpha' }];
        mockFetchAllPages.mockResolvedValueOnce({ value : projects });

        const result = await getResourceProjects('res-1');
        expect(result).toEqual(projects);
        expect(mockFetchAllPages).toHaveBeenCalledTimes(2);
    });

    it('returns empty array when no assignments', async() => {
        mockFetchAllPages.mockResolvedValueOnce({ value : [] });

        const result = await getResourceProjects('res-1');
        expect(result).toEqual([]);
        expect(mockFetchAllPages).toHaveBeenCalledTimes(1);
    });
});

// ── getProjectTasks ─────────────────────────────────────────────────

describe('getProjectTasks', () => {
    it('returns all tasks when no task-level assignments', async() => {
        const tasks = [{ msdyn_projecttaskid : 't1', msdyn_subject : 'Design' }];
        mockFetchAllPages
            .mockResolvedValueOnce({ value : tasks })
            .mockResolvedValueOnce({ value : [] }); // no task assignments

        const result = await getProjectTasks('proj-1', 'res-1');
        expect(result).toEqual(tasks);
    });

    it('filters tasks by resource assignments', async() => {
        const tasks = [
            { msdyn_projecttaskid : 't1', msdyn_subject : 'Design' },
            { msdyn_projecttaskid : 't2', msdyn_subject : 'Build' }
        ];
        mockFetchAllPages
            .mockResolvedValueOnce({ value : tasks })
            .mockResolvedValueOnce({ value : [{ _msdyn_taskid_value : 't1' }] });

        const result = await getProjectTasks('proj-1', 'res-1');
        expect(result).toHaveLength(1);
        expect(result[0]!.msdyn_projecttaskid).toBe('t1');
    });
});

// ── getResourceAssignments ──────────────────────────────────────────

describe('getResourceAssignments', () => {
    it('returns assignments from fetchAllPages', async() => {
        const assignments = [{ msdyn_resourceassignmentid : 'a1' }];
        mockFetchAllPages.mockResolvedValueOnce({ value : assignments });

        const result = await getResourceAssignments('res-1');
        expect(result).toEqual(assignments);
    });
});

// ── getHelpTasks ────────────────────────────────────────────────────

describe('getHelpTasks', () => {
    it('returns help tasks for a resource', async() => {
        const helpTasks = [{ ws_projecthelptasksid : 'ht-1', ws_name : 'Admin' }];
        mockFetchAllPages.mockResolvedValueOnce({ value : helpTasks });

        const result = await getHelpTasks('res-1');
        expect(result).toEqual(helpTasks);
    });
});

// ── createHelpTask ──────────────────────────────────────────────────

describe('createHelpTask', () => {
    it('POSTs and returns the created help task', async() => {
        const created = { ws_projecthelptasksid : 'ht-new' };
        fetchSpy.mockResolvedValueOnce(mockResponse(created));

        const result = await createHelpTask({ ws_name : 'Meeting' } as never);
        expect(result).toEqual(created);
    });

    it('throws on failure', async() => {
        fetchSpy.mockResolvedValueOnce(mockResponse('error', { ok : false, status : 400 }));
        await expect(createHelpTask({} as never)).rejects.toThrow('Failed to create help task');
    });
});

// ── getHelpTaskReasons ──────────────────────────────────────────────

describe('getHelpTaskReasons', () => {
    it('returns reasons from fetchAllPages', async() => {
        const reasons = [{ ws_projecthelptaskreasonsid : 'r1', ws_name : 'Admin' }];
        mockFetchAllPages.mockResolvedValueOnce({ value : reasons });

        const result = await getHelpTaskReasons();
        expect(result).toEqual(reasons);
    });
});

// ── getUserTimesheet ────────────────────────────────────────────────

describe('getUserTimesheet', () => {
    it('returns timesheet when found', async() => {
        const ts = { ws_usertimesheetid : 'uts-1', statuscode : 192350000 };
        fetchSpy.mockResolvedValueOnce(mockResponse({ value : [ts] }));

        const result = await getUserTimesheet('res-1', '2026-06-08');
        expect(result).toEqual(ts);
    });

    it('returns null when no timesheet found', async() => {
        fetchSpy.mockResolvedValueOnce(mockResponse({ value : [] }));

        const result = await getUserTimesheet('res-1', '2026-06-08');
        expect(result).toBeNull();
    });

    it('returns null on fetch error', async() => {
        fetchSpy.mockResolvedValueOnce(mockResponse(null, { ok : false, status : 500 }));

        const result = await getUserTimesheet('res-1', '2026-06-08');
        expect(result).toBeNull();
    });
});

// ── createUserTimesheet ─────────────────────────────────────────────

describe('createUserTimesheet', () => {
    it('POSTs and returns the created timesheet', async() => {
        const created = { ws_usertimesheetid : 'uts-new', statuscode : 192350000 };
        fetchSpy.mockResolvedValueOnce(mockResponse(created));

        const result = await createUserTimesheet('res-1', '2026-06-08', 'Week of 08 Jun');
        expect(result).toEqual(created);

        const [, options] = fetchSpy.mock.calls[0]!;
        const body = JSON.parse(options!.body as string);
        expect(body.ws_startdate).toBe('2026-06-08');
        expect(body.ws_name).toBe('Week of 08 Jun');
        expect(body).not.toHaveProperty('statuscode');
        expect(body).not.toHaveProperty('ws_resource@odata.bind');
    });

    it('throws on failure', async() => {
        fetchSpy.mockResolvedValueOnce(mockResponse('error', { ok : false, status : 400 }));
        await expect(createUserTimesheet('res-1', '2026-06-08', 'Week')).rejects.toThrow('Failed to create user timesheet');
    });
});

// ── completeUserTimesheet ───────────────────────────────────────────

describe('completeUserTimesheet', () => {
    it('completes via custom action', async() => {
        fetchSpy.mockResolvedValueOnce(mockResponse(null, { ok : true, status : 204 }));

        await completeUserTimesheet('uts-1');
        const [url] = fetchSpy.mock.calls[0]!;
        expect(url).toContain('ws_CompleteTimesheet');
    });

    it('falls back to PATCH on action failure', async() => {
        fetchSpy
            .mockResolvedValueOnce(mockResponse('fail', { ok : false, status : 400 }))
            .mockResolvedValueOnce(mockResponse(null, { ok : true, status : 204 }));

        await completeUserTimesheet('uts-1');
        expect(fetchSpy).toHaveBeenCalledTimes(2);
        const [, patchOptions] = fetchSpy.mock.calls[1]!;
        expect(patchOptions!.method).toBe('PATCH');
    });

    it('throws when both action and PATCH fail', async() => {
        fetchSpy
            .mockResolvedValueOnce(mockResponse('fail', { ok : false, status : 400 }))
            .mockResolvedValueOnce(mockResponse('fail2', { ok : false, status : 500 }));

        await expect(completeUserTimesheet('uts-1')).rejects.toThrow('Failed to complete timesheet');
    });
});

// ── recallUserTimesheet ─────────────────────────────────────────────

describe('recallUserTimesheet', () => {
    it('PATCHes status to Draft', async() => {
        fetchSpy.mockResolvedValueOnce(mockResponse(null, { ok : true, status : 204 }));

        await recallUserTimesheet('uts-1');
        const [, options] = fetchSpy.mock.calls[0]!;
        expect(options!.method).toBe('PATCH');
        const body = JSON.parse(options!.body as string);
        expect(body.statuscode).toBe(192350000);
    });

    it('throws on failure', async() => {
        fetchSpy.mockResolvedValueOnce(mockResponse('error', { ok : false, status : 500 }));
        await expect(recallUserTimesheet('uts-1')).rejects.toThrow('Failed to recall timesheet');
    });
});

// ── submitVariations ───────────────────────────────────────────────

describe('submitVariations', () => {
    it('PATCHes each variation with statuscode 100000001', async() => {
        fetchSpy.mockResolvedValue(mockResponse(null, { ok : true, status : 204 }));
        await submitVariations(['v-1', 'v-2']);
        expect(fetchSpy).toHaveBeenCalledTimes(2);

        for (const [url, options] of fetchSpy.mock.calls) {
            expect(url).toMatch(/ws_timesheetvariations\(v-/);
            expect(options!.method).toBe('PATCH');
            const body = JSON.parse(options!.body as string);
            expect(body.statuscode).toBe(100000001);
        }
    });

    it('handles empty array without calling fetch', async() => {
        await submitVariations([]);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('warns on individual failure but does not throw', async() => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        fetchSpy.mockResolvedValueOnce(mockResponse(null, { ok : true, status : 204 }));
        fetchSpy.mockResolvedValueOnce(mockResponse('error', { ok : false, status : 500 }));
        // Should not throw even if one fails
        await submitVariations(['v-ok', 'v-fail']);
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });
});

// ── createUserTimesheet with endDate ───────────────────────────────

describe('createUserTimesheet with endDate', () => {
    it('includes ws_enddate in payload when endDate provided', async() => {
        fetchSpy.mockResolvedValueOnce(mockResponse(
            { ws_usertimesheetid : 'uts-new' },
            { ok : true, status : 201 }
        ));

        await createUserTimesheet('res-1', '2025-01-06', 'Week 2', '2025-01-10');
        const [, options] = fetchSpy.mock.calls[0]!;
        const body = JSON.parse(options!.body as string);
        expect(body.ws_enddate).toBe('2025-01-10');
    });

    it('omits ws_enddate when endDate not provided', async() => {
        fetchSpy.mockResolvedValueOnce(mockResponse(
            { ws_usertimesheetid : 'uts-new' },
            { ok : true, status : 201 }
        ));

        await createUserTimesheet('res-1', '2025-01-06', 'Week 2');
        const [, options] = fetchSpy.mock.calls[0]!;
        const body = JSON.parse(options!.body as string);
        expect(body.ws_enddate).toBeUndefined();
    });
});
