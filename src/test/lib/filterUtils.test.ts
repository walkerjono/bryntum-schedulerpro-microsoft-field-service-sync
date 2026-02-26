import { describe, it, expect } from 'vitest';
import { readFilterParams, writeFilterParams, type FilterState } from '../../lib/filterUtils';

// ── readFilterParams ────────────────────────────────────────────────
describe('readFilterParams', () => {
    it('returns empty defaults for an empty search string', () => {
        const result = readFilterParams('');
        expect(result).toEqual({
            practices          : [],
            roles              : [],
            resources          : [],
            useRemainingEffort : null,
            zoom               : null
        });
    });

    it('parses comma-separated practice values', () => {
        const result = readFilterParams('?practice=Engineering,Design');
        expect(result.practices).toEqual(['Engineering', 'Design']);
    });

    it('parses comma-separated role values', () => {
        const result = readFilterParams('?role=Developer,Designer');
        expect(result.roles).toEqual(['Developer', 'Designer']);
    });

    it('parses comma-separated resource values', () => {
        const result = readFilterParams('?resource=Alice,Bob');
        expect(result.resources).toEqual(['Alice', 'Bob']);
    });

    it('parses useRemainingEffort=true', () => {
        const result = readFilterParams('?useRemainingEffort=true');
        expect(result.useRemainingEffort).toBe(true);
    });

    it('parses useRemainingEffort=false', () => {
        const result = readFilterParams('?useRemainingEffort=false');
        expect(result.useRemainingEffort).toBe(false);
    });

    it('returns null for missing useRemainingEffort', () => {
        const result = readFilterParams('?practice=Eng');
        expect(result.useRemainingEffort).toBeNull();
    });

    it('parses zoom preset', () => {
        const result = readFilterParams('?zoom=monthAndYear');
        expect(result.zoom).toBe('monthAndYear');
    });

    it('filters out empty strings from split', () => {
        const result = readFilterParams('?practice=,Eng,,Design,');
        expect(result.practices).toEqual(['Eng', 'Design']);
    });

    it('handles all parameters together', () => {
        const search = '?practice=Eng&role=Dev&resource=Alice&useRemainingEffort=true&zoom=weekAndMonth';
        const result = readFilterParams(search);
        expect(result).toEqual({
            practices          : ['Eng'],
            roles              : ['Dev'],
            resources          : ['Alice'],
            useRemainingEffort : true,
            zoom               : 'weekAndMonth'
        });
    });

    it('handles URL-encoded special characters', () => {
        const result = readFilterParams('?practice=Engineering%20%26%20Design');
        expect(result.practices).toEqual(['Engineering & Design']);
    });
});

// ── writeFilterParams ───────────────────────────────────────────────
describe('writeFilterParams', () => {
    it('writes practice values to URL', () => {
        let capturedUrl = '';
        const replaceFn = (url: string): void => {
            capturedUrl = url;
        };
        writeFilterParams(
            { practices : ['Eng', 'Design'], roles : [], resources : [], useRemainingEffort : false, zoom : null },
            '', '/', replaceFn
        );
        expect(capturedUrl).toContain('practice=Eng%2CDesign');
    });

    it('removes practice param when array is empty', () => {
        let capturedUrl = '';
        const replaceFn = (url: string): void => {
            capturedUrl = url;
        };
        writeFilterParams(
            { practices : [], roles : [], resources : [], useRemainingEffort : false, zoom : null },
            '?practice=Eng', '/', replaceFn
        );
        expect(capturedUrl).not.toContain('practice');
    });

    it('writes useRemainingEffort=true', () => {
        let capturedUrl = '';
        const replaceFn = (url: string): void => {
            capturedUrl = url;
        };
        writeFilterParams(
            { practices : [], roles : [], resources : [], useRemainingEffort : true, zoom : null },
            '', '/', replaceFn
        );
        expect(capturedUrl).toContain('useRemainingEffort=true');
    });

    it('removes useRemainingEffort when false', () => {
        let capturedUrl = '';
        const replaceFn = (url: string): void => {
            capturedUrl = url;
        };
        writeFilterParams(
            { practices : [], roles : [], resources : [], useRemainingEffort : false, zoom : null },
            '?useRemainingEffort=true', '/', replaceFn
        );
        expect(capturedUrl).not.toContain('useRemainingEffort');
    });

    it('writes zoom when not default', () => {
        let capturedUrl = '';
        const replaceFn = (url: string): void => {
            capturedUrl = url;
        };
        writeFilterParams(
            { practices : [], roles : [], resources : [], useRemainingEffort : false, zoom : 'monthAndYear' },
            '', '/', replaceFn
        );
        expect(capturedUrl).toContain('zoom=monthAndYear');
    });

    it('removes zoom when set to default weekAndDayLetter', () => {
        let capturedUrl = '';
        const replaceFn = (url: string): void => {
            capturedUrl = url;
        };
        writeFilterParams(
            { practices : [], roles : [], resources : [], useRemainingEffort : false, zoom : 'weekAndDayLetter' },
            '?zoom=monthAndYear', '/', replaceFn
        );
        expect(capturedUrl).not.toContain('zoom');
    });

    it('returns bare pathname when all params are empty', () => {
        let capturedUrl = '';
        const replaceFn = (url: string): void => {
            capturedUrl = url;
        };
        writeFilterParams(
            { practices : [], roles : [], resources : [], useRemainingEffort : false, zoom : null },
            '', '/app', replaceFn
        );
        expect(capturedUrl).toBe('/app');
    });

    it('round-trips with readFilterParams', () => {
        let capturedUrl = '';
        const replaceFn = (url: string): void => {
            capturedUrl = url;
        };
        const state: FilterState = {
            practices          : ['Engineering'],
            roles              : ['Developer', 'Designer'],
            resources          : ['Alice'],
            useRemainingEffort : true,
            zoom               : 'weekAndMonth'
        };
        writeFilterParams(state, '', '/', replaceFn);

        // Extract the query string portion
        const qs = capturedUrl.includes('?') ? capturedUrl.slice(capturedUrl.indexOf('?')) : '';
        const parsed = readFilterParams(qs);

        expect(parsed.practices).toEqual(state.practices);
        expect(parsed.roles).toEqual(state.roles);
        expect(parsed.resources).toEqual(state.resources);
        expect(parsed.useRemainingEffort).toBe(state.useRemainingEffort);
        expect(parsed.zoom).toBe(state.zoom);
    });
});
