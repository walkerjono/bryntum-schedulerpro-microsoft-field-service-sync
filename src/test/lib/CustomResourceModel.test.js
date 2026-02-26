import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock auth.js before CustomResourceModel imports it
vi.mock('../../auth.js', () => ({
    getToken : vi.fn().mockResolvedValue('mock-token')
}));

import CustomResourceModel, { loadDefaultImage } from '../../lib/CustomResourceModel.js';

describe('CustomResourceModel', () => {
    // ── Field defaults ───────────────────────────────────────────
    it('defaults practiceName to "Unassigned"', () => {
        const m = new CustomResourceModel({});
        expect(m.practiceName).toBe('Unassigned');
    });

    it('defaults roleName to "Unassigned"', () => {
        const m = new CustomResourceModel({});
        expect(m.roleName).toBe('Unassigned');
    });

    it('defaults workingHours to 40', () => {
        const m = new CustomResourceModel({});
        expect(m.workingHours).toBe(40);
    });

    it('defaults calendar to "business"', () => {
        const m = new CustomResourceModel({});
        expect(m.calendar).toBe('business');
    });

    // ── Explicit values ──────────────────────────────────────────
    it('accepts explicit imageUrl', () => {
        const m = new CustomResourceModel({ imageUrl : 'https://img/user.png' });
        expect(m.imageUrl).toBe('https://img/user.png');
    });

    it('accepts explicit practiceName and roleName', () => {
        const m = new CustomResourceModel({ practiceName : 'Engineering', roleName : 'Developer' });
        expect(m.practiceName).toBe('Engineering');
        expect(m.roleName).toBe('Developer');
    });

    it('accepts explicit workingHours', () => {
        const m = new CustomResourceModel({ workingHours : 32 });
        expect(m.workingHours).toBe(32);
    });
});

describe('loadDefaultImage', () => {
    let fetchSpy;

    beforeEach(() => {
        fetchSpy = vi.spyOn(globalThis, 'fetch');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('fetches the default resource image with auth token', async () => {
        const blob = new Blob(['fake-image'], { type : 'image/jpeg' });
        fetchSpy.mockResolvedValueOnce({
            ok   : true,
            blob : () => Promise.resolve(blob)
        });

        await loadDefaultImage();

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const callHeaders = fetchSpy.mock.calls[0][1].headers;
        expect(callHeaders['Authorization']).toBe('Bearer mock-token');
    });

    it('does not throw when fetch fails', async () => {
        fetchSpy.mockResolvedValueOnce({
            ok         : false,
            statusText : 'Not Found'
        });

        // Should not throw
        await expect(loadDefaultImage()).resolves.not.toThrow();
    });
});
