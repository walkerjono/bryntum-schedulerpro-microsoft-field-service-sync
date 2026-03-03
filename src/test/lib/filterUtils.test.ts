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
            zoom               : null,
            allocation         : null
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

    it('parses comma-separated resource IDs', () => {
        const result = readFilterParams('?resourceId=abc-123,def-456');
        expect(result.resources).toEqual(['abc-123', 'def-456']);
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
        const search = '?practice=Eng&role=Dev&resourceId=abc-123&useRemainingEffort=true&zoom=weekAndMonth';
        const result = readFilterParams(search);
        expect(result).toEqual({
            practices          : ['Eng'],
            roles              : ['Dev'],
            resources          : ['abc-123'],
            useRemainingEffort : true,
            zoom               : 'weekAndMonth',
            allocation         : null
        });
    });

    it('falls back to legacy resource param when resourceId is absent', () => {
        const result = readFilterParams('?resource=Alice,Bob');
        expect(result.resources).toEqual(['Alice', 'Bob']);
    });

    it('parses allocation state', () => {
        const result = readFilterParams('?allocation=over');
        expect(result.allocation).toBe('over');
    });

    it('returns null for missing allocation', () => {
        const result = readFilterParams('?practice=Eng');
        expect(result.allocation).toBeNull();
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
            { practices : ['Eng', 'Design'], roles : [], resources : [], useRemainingEffort : false, zoom : null, allocation : null },
            '', '/', replaceFn
        );
        expect(capturedUrl).toContain('practice=Eng%2CDesign');
    });

    it('writes resource IDs to URL as resourceId param', () => {
        let capturedUrl = '';
        const replaceFn = (url: string): void => {
            capturedUrl = url;
        };
        writeFilterParams(
            { practices : [], roles : [], resources : ['abc-123'], useRemainingEffort : false, zoom : null, allocation : null },
            '', '/', replaceFn
        );
        expect(capturedUrl).toContain('resourceId=abc-123');
        expect(capturedUrl).not.toMatch(/[?&]resource=/);
    });

    it('removes legacy resource param when writing', () => {
        let capturedUrl = '';
        const replaceFn = (url: string): void => {
            capturedUrl = url;
        };
        writeFilterParams(
            { practices : [], roles : [], resources : ['abc-123'], useRemainingEffort : false, zoom : null, allocation : null },
            '?resource=Alice', '/', replaceFn
        );
        expect(capturedUrl).toContain('resourceId=abc-123');
        expect(capturedUrl).not.toMatch(/[?&]resource=/);
    });

    it('removes practice param when array is empty', () => {
        let capturedUrl = '';
        const replaceFn = (url: string): void => {
            capturedUrl = url;
        };
        writeFilterParams(
            { practices : [], roles : [], resources : [], useRemainingEffort : false, zoom : null, allocation : null },
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
            { practices : [], roles : [], resources : [], useRemainingEffort : true, zoom : null, allocation : null },
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
            { practices : [], roles : [], resources : [], useRemainingEffort : false, zoom : null, allocation : null },
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
            { practices : [], roles : [], resources : [], useRemainingEffort : false, zoom : 'monthAndYear', allocation : null },
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
            { practices : [], roles : [], resources : [], useRemainingEffort : false, zoom : 'weekAndDayLetter', allocation : null },
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
            { practices : [], roles : [], resources : [], useRemainingEffort : false, zoom : null, allocation : null },
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
            resources          : ['abc-123'],
            useRemainingEffort : true,
            zoom               : 'weekAndMonth',
            allocation         : 'over'
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
        expect(parsed.allocation).toBe(state.allocation);
    });

    it('does not write allocation param when value is "all"', () => {
        let capturedUrl = '';
        const replaceFn = (url: string): void => {
            capturedUrl = url;
        };
        writeFilterParams(
            { practices : [], roles : [], resources : [], useRemainingEffort : false, zoom : null, allocation : 'all' },
            '', '/', replaceFn
        );
        expect(capturedUrl).not.toContain('allocation=');
    });

    it('writes allocation param when value is not "all"', () => {
        let capturedUrl = '';
        const replaceFn = (url: string): void => {
            capturedUrl = url;
        };
        writeFilterParams(
            { practices : [], roles : [], resources : [], useRemainingEffort : false, zoom : null, allocation : 'under' },
            '', '/', replaceFn
        );
        expect(capturedUrl).toContain('allocation=under');
    });
});
