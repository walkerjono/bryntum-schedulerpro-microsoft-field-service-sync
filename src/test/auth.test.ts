import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PublicClientApplication, InteractionRequiredAuthError } from '@azure/msal-browser';
import { signIn, getToken, signOut } from '../app/auth';

/** Shape of the mock MSAL instance created in setup.ts. */
interface MockMsalInstance {
    loginPopup: ReturnType<typeof vi.fn>;
    acquireTokenSilent: ReturnType<typeof vi.fn>;
    acquireTokenPopup: ReturnType<typeof vi.fn>;
    getAccountByUsername: ReturnType<typeof vi.fn>;
    logoutPopup: ReturnType<typeof vi.fn>;
}

// The mock MSAL instance is created in setup.ts and returned by
// PublicClientApplication.createPublicClientApplication().
// We retrieve it here so we can inspect/override individual method stubs.
let msalInstance: MockMsalInstance;

beforeEach(async() => {
    msalInstance = await (PublicClientApplication as unknown as {
        createPublicClientApplication: (...args: unknown[]) => Promise<unknown>;
    }).createPublicClientApplication({}) as MockMsalInstance;
    // Reset call counts on shared mock functions
    vi.clearAllMocks();
    // Reset sessionStorage between tests
    sessionStorage.clear();
});

afterEach(() => {
    vi.restoreAllMocks();
});

// ── signIn ──────────────────────────────────────────────────────────
describe('signIn', () => {
    it('calls loginPopup and stores username in sessionStorage', async() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});

        await signIn();

        expect(msalInstance.loginPopup).toHaveBeenCalled();
        expect(sessionStorage.getItem('msalAccount')).toBe('test@example.com');
    });
});

// ── getToken ────────────────────────────────────────────────────────
describe('getToken', () => {
    it('throws when no account is in sessionStorage', async() => {
        await expect(getToken()).rejects.toThrow('User info cleared from session storage');
    });

    it('returns token from acquireTokenSilent on success', async() => {
        sessionStorage.setItem('msalAccount', 'test@example.com');

        const token = await getToken();

        expect(msalInstance.acquireTokenSilent).toHaveBeenCalled();
        expect(token).toBe('mock-token');
    });

    it('falls back to acquireTokenPopup on InteractionRequiredAuthError', async() => {
        sessionStorage.setItem('msalAccount', 'test@example.com');

        // Make silent fail with InteractionRequiredAuthError
        msalInstance.acquireTokenSilent.mockRejectedValueOnce(
            new InteractionRequiredAuthError('interaction_required')
        );

        const token = await getToken();

        expect(msalInstance.acquireTokenPopup).toHaveBeenCalled();
        expect(token).toBe('mock-token-interactive');
    });

    it('re-throws non-interaction errors', async() => {
        sessionStorage.setItem('msalAccount', 'test@example.com');

        msalInstance.acquireTokenSilent.mockRejectedValueOnce(
            new Error('network_error')
        );

        await expect(getToken()).rejects.toThrow('network_error');
    });
});

// ── signOut ─────────────────────────────────────────────────────────
describe('signOut', () => {
    it('calls logoutPopup and removes account from sessionStorage', async() => {
        sessionStorage.setItem('msalAccount', 'test@example.com');

        await signOut();

        expect(msalInstance.logoutPopup).toHaveBeenCalled();
        expect(sessionStorage.getItem('msalAccount')).toBeNull();
    });

    it('does nothing when no account in sessionStorage', async() => {
        await signOut();

        expect(msalInstance.logoutPopup).not.toHaveBeenCalled();
    });
});
