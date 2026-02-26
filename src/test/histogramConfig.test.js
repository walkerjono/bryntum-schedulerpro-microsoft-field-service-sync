import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    getBarClass,
    getLeafDescendants,
    clearLeafStateCache,
    histogramConfig
} from '../histogramConfig';

// ── Helpers ─────────────────────────────────────────────────────────
/** Create a minimal datum for getBarClass.  maxEffort/effort in ms, same as Bryntum. */
function makeDatum({ effort = 0, maxEffort = 100, isGroup = false, resource = null, startDate = new Date('2026-03-01') } = {}) {
    return { effort, maxEffort, isGroup, resource, startDate };
}
/** Writable domConfig stub */
function makeDomConfig() { return { style : {} }; }

// ── getLeafDescendants ──────────────────────────────────────────────
describe('getLeafDescendants', () => {
    it('returns [self] for a leaf resource', () => {
        const leaf = { id : 1, isLeaf : true };
        expect(getLeafDescendants(leaf)).toEqual([leaf]);
    });

    it('returns [self] when resource has no children property', () => {
        const leaf = { id : 2 };
        expect(getLeafDescendants(leaf)).toEqual([leaf]);
    });

    it('returns empty array for non-leaf resource with no children', () => {
        const parent = { id : 3, isLeaf : false, children : [] };
        expect(getLeafDescendants(parent)).toEqual([]);
    });

    it('returns all leaf descendants for a nested tree', () => {
        const a = { id : 10, isLeaf : true };
        const b = { id : 11, isLeaf : true };
        const c = { id : 12, isLeaf : true };
        const mid = { id : 20, children : [b, c] };
        const root = { id : 30, children : [a, mid] };

        const leaves = getLeafDescendants(root);
        expect(leaves).toHaveLength(3);
        expect(leaves).toContain(a);
        expect(leaves).toContain(b);
        expect(leaves).toContain(c);
    });

    it('skips non-leaf children without children array', () => {
        const nonLeaf = { id : 5, isLeaf : false, children : [] };
        const child = { id : 6, isLeaf : true };
        const root = { id : 7, children : [nonLeaf, child] };

        const leaves = getLeafDescendants(root);
        expect(leaves).toEqual([child]);
    });
});

// ── clearLeafStateCache ─────────────────────────────────────────────
describe('clearLeafStateCache', () => {
    it('does not throw', () => {
        expect(() => clearLeafStateCache()).not.toThrow();
    });

    it('resets parent classification to mixed-state on next render', () => {
        // First, render a leaf that is "even" (80-110%)
        const resource = { id : 'R1' };
        const datum = makeDatum({ effort : 90, maxEffort : 100, resource });
        const domConfig = makeDomConfig();
        getBarClass(0, domConfig, datum, 0, { resource });

        // Now render a parent whose only leaf is R1 — should be green
        const parentResource = { id : 'P1', children : [resource] };
        const parentDatum = makeDatum({ effort : 90, maxEffort : 100, isGroup : true, resource : parentResource });
        const parentDom = makeDomConfig();
        const classWithCache = getBarClass(0, parentDom, parentDatum, 0, { resource : parentResource });
        expect(classWithCache).toBe('b-evenly-allocated');

        // Clear cache and re-render parent — should fall back to mixed
        clearLeafStateCache();
        const parentDom2 = makeDomConfig();
        const classAfterClear = getBarClass(0, parentDom2, parentDatum, 0, { resource : parentResource });
        expect(classAfterClear).toBe('b-mixed-state');
    });
});

// ── getBarClass ─────────────────────────────────────────────────────
describe('getBarClass', () => {
    beforeEach(() => {
        clearLeafStateCache();
    });

    // ── Zero capacity ───────────────────────────────────────────────
    it('returns empty string when maxEffort is 0', () => {
        const domConfig = makeDomConfig();
        expect(getBarClass(0, domConfig, makeDatum({ maxEffort : 0 }), 0, {})).toBe('');
    });

    it('returns empty string when datum is null', () => {
        const domConfig = makeDomConfig();
        expect(getBarClass(0, domConfig, null, 0, {})).toBe('');
    });

    // ── Leaf under-allocated (<80%) ─────────────────────────────────
    it('returns b-underallocated for leaf at 50%', () => {
        const domConfig = makeDomConfig();
        const cls = getBarClass(0, domConfig, makeDatum({ effort : 50, maxEffort : 100 }), 0, {});
        expect(cls).toBe('b-underallocated');
        expect(domConfig.style.fill).toBe('#FBBF24');
    });

    it('returns b-underallocated for leaf at 79%', () => {
        const domConfig = makeDomConfig();
        const cls = getBarClass(0, domConfig, makeDatum({ effort : 79, maxEffort : 100 }), 0, {});
        expect(cls).toBe('b-underallocated');
    });

    // ── Leaf evenly allocated (80-110%) ─────────────────────────────
    it('returns b-evenly-allocated for leaf at exactly 80%', () => {
        const domConfig = makeDomConfig();
        const cls = getBarClass(0, domConfig, makeDatum({ effort : 80, maxEffort : 100 }), 0, {});
        expect(cls).toBe('b-evenly-allocated');
        expect(domConfig.style.fill).toBe('#6EE7B7');
    });

    it('returns b-evenly-allocated for leaf at 100%', () => {
        const domConfig = makeDomConfig();
        const cls = getBarClass(0, domConfig, makeDatum({ effort : 100, maxEffort : 100 }), 0, {});
        expect(cls).toBe('b-evenly-allocated');
    });

    it('returns b-evenly-allocated for leaf at 109% (just under threshold)', () => {
        const domConfig = makeDomConfig();
        const cls = getBarClass(0, domConfig, makeDatum({ effort : 109, maxEffort : 100 }), 0, {});
        expect(cls).toBe('b-evenly-allocated');
    });

    // ── Leaf over-allocated (>110%) ─────────────────────────────────
    it('returns b-overallocated for leaf at 111%', () => {
        const domConfig = makeDomConfig();
        const cls = getBarClass(0, domConfig, makeDatum({ effort : 111, maxEffort : 100 }), 0, {});
        expect(cls).toBe('b-overallocated');
        expect(domConfig.style.fill).toBe('#F87171');
    });

    it('returns b-overallocated for leaf at 200%', () => {
        const domConfig = makeDomConfig();
        const cls = getBarClass(0, domConfig, makeDatum({ effort : 200, maxEffort : 100 }), 0, {});
        expect(cls).toBe('b-overallocated');
    });

    // ── Parent with all even children → green ───────────────────────
    it('returns b-evenly-allocated for parent when all children are even', () => {
        const leafA = { id : 'A' };
        const leafB = { id : 'B' };
        const tick = new Date('2026-03-01');

        // Render leaf bars first to populate child cache
        getBarClass(0, makeDomConfig(), makeDatum({ effort : 90, maxEffort : 100, resource : leafA, startDate : tick }), 0, { resource : leafA });
        getBarClass(0, makeDomConfig(), makeDatum({ effort : 100, maxEffort : 100, resource : leafB, startDate : tick }), 0, { resource : leafB });

        // Parent row
        const parentResource = { id : 'P', children : [leafA, leafB] };
        const parentDom = makeDomConfig();
        const cls = getBarClass(0, parentDom, makeDatum({ effort : 95, maxEffort : 100, isGroup : true, resource : parentResource, startDate : tick }), 0, { resource : parentResource });
        expect(cls).toBe('b-evenly-allocated');
        expect(parentDom.style.fill).toBe('#6EE7B7');
    });

    // ── Parent with mixed children → purple ─────────────────────────
    it('returns b-mixed-state for parent when a child is under-allocated', () => {
        const leafGood = { id : 'G' };
        const leafBad = { id : 'B' };
        const tick = new Date('2026-03-01');

        getBarClass(0, makeDomConfig(), makeDatum({ effort : 90, maxEffort : 100, resource : leafGood, startDate : tick }), 0, { resource : leafGood });
        getBarClass(0, makeDomConfig(), makeDatum({ effort : 50, maxEffort : 100, resource : leafBad, startDate : tick }), 0, { resource : leafBad });

        const parentResource = { id : 'P', children : [leafGood, leafBad] };
        const parentDom = makeDomConfig();
        const cls = getBarClass(0, parentDom, makeDatum({ effort : 90, maxEffort : 100, isGroup : true, resource : parentResource, startDate : tick }), 0, { resource : parentResource });
        expect(cls).toBe('b-mixed-state');
        expect(parentDom.style.fill).toBe('#D8B4FE');
    });

    // ── Parent with no cached data → mixed (first-render safe) ──────
    it('returns b-mixed-state for parent with empty cache (first render)', () => {
        const leafA = { id : 'A' };
        const parentResource = { id : 'P', children : [leafA] };
        const parentDom = makeDomConfig();
        const cls = getBarClass(0, parentDom, makeDatum({ effort : 90, maxEffort : 100, isGroup : true, resource : parentResource }), 0, { resource : parentResource });
        expect(cls).toBe('b-mixed-state');
    });

    // ── Parent over-allocated → red regardless of children ──────────
    it('returns b-overallocated for over-allocated parent', () => {
        const parentResource = { id : 'P', children : [] };
        const parentDom = makeDomConfig();
        const cls = getBarClass(0, parentDom, makeDatum({ effort : 120, maxEffort : 100, isGroup : true, resource : parentResource }), 0, { resource : parentResource });
        expect(cls).toBe('b-overallocated');
    });

    // ── Parent under-allocated → orange regardless of children ──────
    it('returns b-underallocated for under-allocated parent', () => {
        const parentResource = { id : 'P', children : [] };
        const parentDom = makeDomConfig();
        const cls = getBarClass(0, parentDom, makeDatum({ effort : 50, maxEffort : 100, isGroup : true, resource : parentResource }), 0, { resource : parentResource });
        expect(cls).toBe('b-underallocated');
    });

    // ── domConfig style is set ──────────────────────────────────────
    it('always sets domConfig.style.fill for non-zero capacity', () => {
        const domConfig = makeDomConfig();
        getBarClass(0, domConfig, makeDatum({ effort : 50, maxEffort : 100 }), 0, {});
        expect(domConfig.style.fill).toBeTruthy();
    });
});

// ── histogramConfig shape ───────────────────────────────────────────
describe('histogramConfig structure', () => {
    it('appends to #histogram', () => {
        expect(histogramConfig.appendTo).toBe('histogram');
    });

    it('hides headers', () => {
        expect(histogramConfig.hideHeaders).toBe(true);
    });

    it('has treeGroup with practice and role levels', () => {
        expect(histogramConfig.features.treeGroup.levels).toEqual(['practiceName', 'roleName']);
    });

    it('references getBarClass', () => {
        expect(histogramConfig.getBarClass).toBe(getBarClass);
    });
});
