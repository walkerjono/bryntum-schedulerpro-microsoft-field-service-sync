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
                    rawValue = 'defaultValue' in fieldDef ? fieldDef.defaultValue : undefined;
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

        get(field: string): unknown {
            return this[field];
        }

        set(fieldOrValues: string | Record<string, unknown>, value?: unknown): void {
            if (typeof fieldOrValues === 'string') {
                this[fieldOrValues] = value;
            }
            else {
                Object.assign(this, fieldOrValues);
            }
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

    // ── Mock Bryntum UI Widgets ─────────────────────────────────────
    // Used by timesheetVariationDialog and others

    class Widget {
        [key: string]: unknown;
        _handlers: Record<string, ((...args: unknown[]) => void)[]>;

        constructor(config?: Record<string, unknown>) {
            this._handlers = {};
            if (config) Object.assign(this, config);
        }

        on(event: string, handler: (...args: unknown[]) => void): void {
            if (!this._handlers[event]) this._handlers[event] = [];
            this._handlers[event]!.push(handler);
        }

        destroy(): void { /* no-op */ }
    }

    class NumberField extends Widget {}
    class Combo extends Widget {}
    class DateField extends Widget {}
    class TextAreaField extends Widget {}
    class Button extends Widget {}
    class Container extends Widget {}
    class TextField extends Widget {}

    class Popup extends Widget {
        widgetMap: Record<string, Widget> = {};

        constructor(config?: Record<string, unknown>) {
            super(config);
            // Build widgetMap from items config
            const items = config?.items as Record<string, Record<string, unknown>> | undefined;
            if (items) {
                for (const [key, itemCfg] of Object.entries(items)) {
                    const ref = (itemCfg.ref as string) ?? key;
                    const w = new Widget(itemCfg);
                    this.widgetMap[ref] = w;
                    // Nested items (e.g. buttonBar)
                    if (itemCfg.items) {
                        for (const [subKey, subCfg] of Object.entries(itemCfg.items as Record<string, Record<string, unknown>>)) {
                            const subRef = (subCfg.ref as string) ?? subKey;
                            this.widgetMap[subRef] = new Widget(subCfg);
                        }
                    }
                }
            }
        }

        close(): void { /* no-op */ }
    }

    class Toast {
        static show: (...args: unknown[]) => void = vi.fn();
    }

    const DateHelper = {
        format(date: Date | string, format: string): string {
            const d = date instanceof Date ? date : new Date(date);
            const days   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const tokens: Record<string, string> = {
                ddd  : days[d.getDay()]!,
                YYYY : String(d.getFullYear()),
                MMM  : months[d.getMonth()]!,
                DD   : String(d.getDate()).padStart(2, '0'),
                D    : String(d.getDate())
            };
            return format.replace(/ddd|YYYY|MMM|DD|D/g, (m) => tokens[m] ?? m);
        }
    };

    const LocaleHelper = {
        publishLocale : vi.fn()
    };

    const LocaleManager = {
        applyLocale : vi.fn()
    };

    return {
        Model,
        EventModel,
        ResourceModel,
        SchedulerPro,
        ResourceHistogram,
        DateHelper,
        LocaleHelper,
        LocaleManager,
        Widget,
        NumberField,
        Combo,
        DateField,
        TextAreaField,
        Button,
        Container,
        TextField,
        Popup,
        Toast
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
