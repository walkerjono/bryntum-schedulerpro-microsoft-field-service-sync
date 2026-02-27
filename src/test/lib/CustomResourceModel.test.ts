import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock auth before CustomResourceModel imports it
vi.mock('../../app/auth', () => ({
    getToken : vi.fn().mockResolvedValue('mock-token')
}));

import CustomResourceModel, { loadDefaultImage } from '../../lib/CustomResourceModel';

// Bryntum models set field values as dynamic instance properties (via static `fields`).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = any;

type RequestInit = globalThis.RequestInit;

describe('CustomResourceModel', () => {
    // ── Field defaults ───────────────────────────────────────────
    it('defaults practiceName to "Unassigned"', () => {
        const m = new CustomResourceModel({});
        expect((m as AnyRecord).practiceName).toBe('Unassigned');
    });

    it('defaults roleName to "Unassigned"', () => {
        const m = new CustomResourceModel({});
        expect((m as AnyRecord).roleName).toBe('Unassigned');
    });

    it('defaults workingHours to 40', () => {
        const m = new CustomResourceModel({});
        expect((m as AnyRecord).workingHours).toBe(40);
    });

    it('has no calendar override (uses Bryntum built-in field)', () => {
        const m = new CustomResourceModel({});
        // calendar is Bryntum's built-in ResourceModel field — without a project
        // context it returns undefined. At runtime, resources inherit the project
        // calendar ('business') unless generateCalendars assigns a custom one.
        expect(m.calendar).toBeUndefined();
    });

    // ── Explicit values ──────────────────────────────────────────
    it('accepts explicit imageUrl', () => {
        const m = new CustomResourceModel({ imageUrl : 'https://img/user.png' });
        expect(m.imageUrl).toBe('https://img/user.png');
    });

    it('accepts explicit practiceName and roleName', () => {
        const m = new CustomResourceModel({ practiceName : 'Engineering', roleName : 'Developer' });
        expect((m as AnyRecord).practiceName).toBe('Engineering');
        expect((m as AnyRecord).roleName).toBe('Developer');
    });

    it('accepts explicit workingHours', () => {
        const m = new CustomResourceModel({ workingHours : 32 });
        expect((m as AnyRecord).workingHours).toBe(32);
    });
});

describe('loadDefaultImage', () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        fetchSpy = vi.spyOn(globalThis, 'fetch');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('fetches the default resource image with auth token', async() => {
        const blob = new Blob(['fake-image'], { type : 'image/jpeg' });
        fetchSpy.mockResolvedValueOnce({
            ok   : true,
            blob : () => Promise.resolve(blob)
        } as unknown as Response);

        await loadDefaultImage();

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const callHeaders = (fetchSpy.mock.calls[0] as [string, RequestInit])[1].headers as Record<string, string>;
        expect(callHeaders['Authorization']).toBe('Bearer mock-token');
    });

    it('does not throw when fetch fails', async() => {
        fetchSpy.mockResolvedValueOnce({
            ok         : false,
            statusText : 'Not Found'
        } as unknown as Response);

        // Should not throw
        await expect(loadDefaultImage()).resolves.not.toThrow();
    });
});
