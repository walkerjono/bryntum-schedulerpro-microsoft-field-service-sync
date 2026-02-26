/**
 * Vitest global setup — mocks for external dependencies that trigger
 * side-effects on import (Bryntum commercial library, MSAL auth).
 */
import { vi } from 'vitest';

// ── Bryntum field definition shape ──────────────────────────────────
interface FieldDef {
    name: string;
    dataSource?: string;
    defaultValue?: unknown;
    convert?: (value: unknown, data: Record<string, unknown>) => unknown;
}

// ── Mock @bryntum/schedulerpro ──────────────────────────────────────
// Minimal stub classes so CustomEventModel / CustomResourceModel can extend
// them without pulling in the full Bryntum library or requiring a DOM canvas.
vi.mock('@bryntum/schedulerpro', () => {
    class Model {
        [key: string]: unknown;
        static fields: FieldDef[] = [];

        constructor(data?: Record<string, unknown>) {
            // Apply static fields definitions like Bryntum does
            const fields: FieldDef[] = (this.constructor as typeof Model).fields || [];
            for (const fieldDef of fields) {
                const name = fieldDef.name;
                // Determine the raw value: dataSource mapping, then direct name, then default
                let rawValue: unknown;
                if (fieldDef.dataSource && data?.[fieldDef.dataSource] !== undefined) {
                    rawValue = data[fieldDef.dataSource];
                }
                else if (data?.[name] !== undefined) {
                    rawValue = data[name];
                }
                else {
                    rawValue = fieldDef.defaultValue ?? undefined;
                }

                // Run the convert function if present
                if (typeof fieldDef.convert === 'function') {
                    this[name] = fieldDef.convert(rawValue, data as Record<string, unknown>);
                }
                else {
                    this[name] = rawValue;
                }
            }
        }

        set(values: Record<string, unknown>): void {
            Object.assign(this, values);
        }
    }

    class EventModel extends Model {
        static get fields(): FieldDef[] {
            return [];
        }
    }

    class ResourceModel extends Model {
        static get fields(): FieldDef[] {
            return [];
        }
    }

    class SchedulerPro {}
    class ResourceHistogram {}

    return {
        EventModel,
        ResourceModel,
        SchedulerPro,
        ResourceHistogram
    };
});

// ── Mock @azure/msal-browser ────────────────────────────────────────
// Prevents the top-level `await PublicClientApplication.createPublicClientApplication()`
// in auth.ts from executing during tests.
vi.mock('@azure/msal-browser', () => {
    const mockMsalInstance = {
        loginPopup           : vi.fn().mockResolvedValue({ account : { username : 'test@example.com' } }),
        acquireTokenSilent   : vi.fn().mockResolvedValue({ accessToken : 'mock-token' }),
        acquireTokenPopup    : vi.fn().mockResolvedValue({ accessToken : 'mock-token-interactive' }),
        getAccountByUsername : vi.fn().mockReturnValue({ username : 'test@example.com' }),
        logoutPopup          : vi.fn().mockResolvedValue(undefined)
    };

    return {
        PublicClientApplication : {
            createPublicClientApplication : vi.fn().mockResolvedValue(mockMsalInstance)
        },
        InteractionRequiredAuthError : class InteractionRequiredAuthError extends Error {
            constructor(msg: string) {
                super(msg);
                this.name = 'InteractionRequiredAuthError';
            }
        }
    };
});
