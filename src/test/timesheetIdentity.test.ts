import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    whoAmI,
    getSystemUser,
    resolveBookableResource,
    getAllBookableResources,
    getResourceCategories,
    resolveIdentity,
    getActiveResourceId,
    isImpersonating,
    setImpersonation,
    clearImpersonation,
    getResolvedIdentity,
    resetIdentity
} from '../app/timesheetIdentity';

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
    resetIdentity();
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse({}));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});

// ── whoAmI ──────────────────────────────────────────────────────────

describe('whoAmI', () => {
    it('returns WhoAmI response', async() => {
        const data = { UserId : 'u1', BusinessUnitId : 'bu1', OrganizationId : 'org1' };
        fetchSpy.mockResolvedValueOnce(mockResponse(data));

        const result = await whoAmI();
        expect(result).toEqual(data);
    });

    it('throws on failure', async() => {
        fetchSpy.mockResolvedValueOnce(mockResponse(null, { ok : false, statusText : 'Unauthorized' }));
        await expect(whoAmI()).rejects.toThrow('WhoAmI failed');
    });
});

// ── getSystemUser ───────────────────────────────────────────────────

describe('getSystemUser', () => {
    it('returns system user', async() => {
        const user = { systemuserid : 'u1', fullname : 'Jane', internalemailaddress : 'jane@co.com', domainname : 'DOMAIN\\jane' };
        fetchSpy.mockResolvedValueOnce(mockResponse(user));

        const result = await getSystemUser('u1');
        expect(result).toEqual(user);
    });

    it('throws on failure', async() => {
        fetchSpy.mockResolvedValueOnce(mockResponse(null, { ok : false, statusText : 'Not Found' }));
        await expect(getSystemUser('u1')).rejects.toThrow('Failed to fetch system user');
    });
});

// ── resolveBookableResource ─────────────────────────────────────────

describe('resolveBookableResource', () => {
    it('returns resource when found', async() => {
        const resource = { bookableresourceid : 'res-1', name : 'Jane', resourcetype : 3, statecode : 0 };
        mockFetchAllPages.mockResolvedValueOnce({ value : [resource] });

        const result = await resolveBookableResource('u1');
        expect(result).toEqual(resource);
    });

    it('returns null when not found', async() => {
        mockFetchAllPages.mockResolvedValueOnce({ value : [] });

        const result = await resolveBookableResource('u1');
        expect(result).toBeNull();
    });
});

// ── getAllBookableResources ──────────────────────────────────────────

describe('getAllBookableResources', () => {
    it('returns all active resources', async() => {
        const resources = [
            { bookableresourceid : 'r1', name : 'Alice' },
            { bookableresourceid : 'r2', name : 'Bob' }
        ];
        mockFetchAllPages.mockResolvedValueOnce({ value : resources });

        const result = await getAllBookableResources();
        expect(result).toHaveLength(2);
    });
});

// ── getResourceCategories ───────────────────────────────────────────

describe('getResourceCategories', () => {
    it('returns category assignments', async() => {
        const cats = [{ _resource_value : 'r1', _resourcecategory_value : 'cat1', msdyn_isdefault : true }];
        mockFetchAllPages.mockResolvedValueOnce({ value : cats });

        const result = await getResourceCategories('r1');
        expect(result).toEqual(cats);
    });
});

// ── resolveIdentity ─────────────────────────────────────────────────

describe('resolveIdentity', () => {
    it('resolves the full identity chain', async() => {
        // WhoAmI
        fetchSpy.mockResolvedValueOnce(mockResponse({ UserId : 'u1', BusinessUnitId : 'bu1', OrganizationId : 'org1' }));
        // getSystemUser
        fetchSpy.mockResolvedValueOnce(mockResponse({ systemuserid : 'u1', fullname : 'Jane Doe', internalemailaddress : 'jane@co.com', domainname : 'D\\jane' }));
        // resolveBookableResource
        mockFetchAllPages.mockResolvedValueOnce({
            value : [{ bookableresourceid : 'res-1', name : 'Jane Doe', resourcetype : 3, statecode : 0 }]
        });

        const identity = await resolveIdentity();
        expect(identity.userId).toBe('u1');
        expect(identity.userFullName).toBe('Jane Doe');
        expect(identity.userEmail).toBe('jane@co.com');
        expect(identity.resourceId).toBe('res-1');
        expect(identity.resourceName).toBe('Jane Doe');
    });

    it('caches result after first call', async() => {
        fetchSpy.mockResolvedValueOnce(mockResponse({ UserId : 'u1', BusinessUnitId : 'bu1', OrganizationId : 'org1' }));
        fetchSpy.mockResolvedValueOnce(mockResponse({ systemuserid : 'u1', fullname : 'Jane', internalemailaddress : 'jane@co.com', domainname : 'D\\j' }));
        mockFetchAllPages.mockResolvedValueOnce({
            value : [{ bookableresourceid : 'res-1', name : 'Jane', resourcetype : 3, statecode : 0 }]
        });

        await resolveIdentity();
        const second = await resolveIdentity();
        expect(second.resourceId).toBe('res-1');
        // WhoAmI + getSystemUser = 2 fetch calls, should not be called again
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('throws when no bookable resource found', async() => {
        fetchSpy.mockResolvedValueOnce(mockResponse({ UserId : 'u1', BusinessUnitId : 'bu1', OrganizationId : 'org1' }));
        fetchSpy.mockResolvedValueOnce(mockResponse({ systemuserid : 'u1', fullname : 'Jane', internalemailaddress : 'jane@co.com', domainname : 'D\\j' }));
        mockFetchAllPages.mockResolvedValueOnce({ value : [] });

        await expect(resolveIdentity()).rejects.toThrow('No active bookable resource found');
    });
});

// ── Impersonation sync functions ────────────────────────────────────

describe('impersonation', () => {
    // Seed resolvedIdentity via resolveIdentity
    async function seedIdentity() : Promise<void> {
        fetchSpy.mockResolvedValueOnce(mockResponse({ UserId : 'u1', BusinessUnitId : 'bu1', OrganizationId : 'org1' }));
        fetchSpy.mockResolvedValueOnce(mockResponse({ systemuserid : 'u1', fullname : 'Jane', internalemailaddress : 'jane@co.com', domainname : 'D\\j' }));
        mockFetchAllPages.mockResolvedValueOnce({ value : [{ bookableresourceid : 'res-own', name : 'Jane', resourcetype : 3, statecode : 0 }] });
        await resolveIdentity();
    }

    describe('getActiveResourceId', () => {
        it('returns null before identity is resolved', () => {
            expect(getActiveResourceId()).toBeNull();
        });

        it('returns own resource after identity resolved', async() => {
            await seedIdentity();
            expect(getActiveResourceId()).toBe('res-own');
        });

        it('returns impersonated resource when set', async() => {
            await seedIdentity();
            setImpersonation('res-other');
            expect(getActiveResourceId()).toBe('res-other');
        });
    });

    describe('isImpersonating', () => {
        it('returns false before identity resolved', () => {
            expect(isImpersonating()).toBe(false);
        });

        it('returns false when not impersonating', async() => {
            await seedIdentity();
            expect(isImpersonating()).toBe(false);
        });

        it('returns true when impersonating a different resource', async() => {
            await seedIdentity();
            setImpersonation('res-other');
            expect(isImpersonating()).toBe(true);
        });

        it('returns false when impersonating own resource', async() => {
            await seedIdentity();
            setImpersonation('res-own');
            expect(isImpersonating()).toBe(false);
        });
    });

    describe('clearImpersonation', () => {
        it('reverts to own resource', async() => {
            await seedIdentity();
            setImpersonation('res-other');
            expect(getActiveResourceId()).toBe('res-other');

            clearImpersonation();
            expect(getActiveResourceId()).toBe('res-own');
            expect(isImpersonating()).toBe(false);
        });
    });

    describe('getResolvedIdentity', () => {
        it('returns null before resolution', () => {
            expect(getResolvedIdentity()).toBeNull();
        });

        it('returns identity after resolution', async() => {
            await seedIdentity();
            const id = getResolvedIdentity();
            expect(id).not.toBeNull();
            expect(id!.resourceId).toBe('res-own');
        });
    });

    describe('resetIdentity', () => {
        it('clears identity and impersonation', async() => {
            await seedIdentity();
            setImpersonation('res-other');

            resetIdentity();
            expect(getResolvedIdentity()).toBeNull();
            expect(getActiveResourceId()).toBeNull();
            expect(isImpersonating()).toBe(false);
        });
    });

    // ── localStorage persistence (Gap 12) ───────────────────────────

    describe('impersonation localStorage persistence', () => {
        it('stores impersonation in localStorage on setImpersonation', async() => {
            await seedIdentity();
            setImpersonation('res-other');
            expect(localStorage.getItem('ws_impersonateUser')).toBe('res-other');
        });

        it('removes localStorage key on clearImpersonation', async() => {
            await seedIdentity();
            setImpersonation('res-other');
            expect(localStorage.getItem('ws_impersonateUser')).toBe('res-other');

            clearImpersonation();
            expect(localStorage.getItem('ws_impersonateUser')).toBeNull();
        });

        it('removes localStorage key on resetIdentity', async() => {
            await seedIdentity();
            setImpersonation('res-other');
            expect(localStorage.getItem('ws_impersonateUser')).toBe('res-other');

            resetIdentity();
            expect(localStorage.getItem('ws_impersonateUser')).toBeNull();
        });

        it('getActiveResourceId falls back to localStorage before own resource', () => {
            // Before identity is resolved, if localStorage has a value it should be returned
            localStorage.setItem('ws_impersonateUser', 'res-from-storage');
            expect(getActiveResourceId()).toBe('res-from-storage');
            localStorage.removeItem('ws_impersonateUser');
        });
    });
});
