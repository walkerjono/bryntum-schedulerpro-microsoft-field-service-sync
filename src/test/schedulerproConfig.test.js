import { describe, it, expect, vi } from 'vitest';

// The module imports ./auth.js which triggers MSAL — handled by setup.js mock.
import {
    nameRenderer,
    treeGroupParentRenderer,
    schedulerproConfig,
    VIEWPORT_BUFFER_DAYS,
    PROJECT_COLORS
} from '../schedulerproConfig';

// ── Constants ───────────────────────────────────────────────────────
describe('constants', () => {
    it('VIEWPORT_BUFFER_DAYS is a positive number', () => {
        expect(VIEWPORT_BUFFER_DAYS).toBeGreaterThan(0);
    });

    it('PROJECT_COLORS is a non-empty array of hex strings', () => {
        expect(PROJECT_COLORS.length).toBeGreaterThan(0);
        for (const c of PROJECT_COLORS) {
            expect(c).toMatch(/^#[0-9A-Fa-f]{6}$/);
        }
    });
});

// ── nameRenderer ────────────────────────────────────────────────────
describe('nameRenderer', () => {
    it('renders image + name when imageUrl is present', () => {
        const html = nameRenderer({ record : { name : 'Alice', imageUrl : 'https://img/a.png' } });
        expect(html).toContain('<img');
        expect(html).toContain('src="https://img/a.png"');
        expect(html).toContain('Alice');
    });

    it('renders name-only span when imageUrl is absent', () => {
        const html = nameRenderer({ record : { name : 'Bob' } });
        expect(html).not.toContain('<img');
        expect(html).toContain('<span>Bob</span>');
    });

    it('renders empty name gracefully', () => {
        const html = nameRenderer({ record : {} });
        expect(html).toContain('<span></span>');
    });
});

// ── treeGroupParentRenderer ─────────────────────────────────────────
describe('treeGroupParentRenderer', () => {
    it('renders Practice groups with fa-users icon', () => {
        const html = treeGroupParentRenderer({ field : 'practiceName', value : 'Consulting' });
        expect(html).toContain('fa-users');
        expect(html).toContain('Consulting');
    });

    it('renders Role groups with fa-briefcase icon', () => {
        const html = treeGroupParentRenderer({ field : 'roleName', value : 'Developer' });
        expect(html).toContain('fa-briefcase');
        expect(html).toContain('Developer');
    });

    it('falls back to plain bold text for unknown fields', () => {
        const html = treeGroupParentRenderer({ field : 'otherField', value : 'Thing' });
        expect(html).toBe('<strong>Thing</strong>');
        expect(html).not.toContain('fa-');
    });
});

// ── eventRenderer ───────────────────────────────────────────────────
describe('eventRenderer', () => {
    const renderer = schedulerproConfig.eventRenderer;

    it('marks events with null effortRemaining as inactive', () => {
        const renderData = { eventColor : '', cls : new Set() };
        const result = renderer({ eventRecord : { name : 'Task A', effortRemaining : null }, renderData });

        expect(renderData.eventColor).toBe('gray');
        expect(renderData.cls.has('b-inactive')).toBe(true);
        expect(result).toBe('Task A');
    });

    it('marks events with effortRemaining === 0 as inactive', () => {
        const renderData = { eventColor : '', cls : new Set() };
        renderer({ eventRecord : { name : 'Task B', effortRemaining : 0 }, renderData });

        expect(renderData.eventColor).toBe('gray');
        expect(renderData.cls.has('b-inactive')).toBe(true);
    });

    it('does not mark events with positive effortRemaining', () => {
        const renderData = { eventColor : '', cls : new Set() };
        const result = renderer({ eventRecord : { name : 'Task C', effortRemaining : 10 }, renderData });

        expect(renderData.eventColor).toBe('');
        expect(renderData.cls.has('b-inactive')).toBe(false);
        expect(result).toBe('Task C');
    });

    it('does not mark events with effortRemaining === undefined as inactive', () => {
        // undefined should also == null
        const renderData = { eventColor : '', cls : new Set() };
        renderer({ eventRecord : { name : 'Task D' }, renderData });

        expect(renderData.eventColor).toBe('gray');
        expect(renderData.cls.has('b-inactive')).toBe(true);
    });
});

// ── eventTooltip template ───────────────────────────────────────────
describe('eventTooltip template', () => {
    const template = schedulerproConfig.features.eventTooltip.template;

    it('renders all fields in the tooltip', () => {
        const eventRecord = {
            name            : 'Implement Feature',
            startDate       : new Date('2026-03-01'),
            endDate         : new Date('2026-03-15'),
            effort          : 40,
            effortRemaining : 20,
            clientName      : 'Acme Corp',
            projectName     : 'Portal',
            projectNumber   : 'P-100',
            taskNumber      : 'T-55'
        };
        const html = template({ eventRecord });

        expect(html).toContain('Acme Corp');
        expect(html).toContain('P-100: Portal');
        expect(html).toContain('T-55: Implement Feature');
        expect(html).toContain('40 hrs');
        expect(html).toContain('20 hrs');
        expect(html).toContain('Effort Remaining');
    });

    it('omits effortRemaining row when null', () => {
        const eventRecord = {
            name            : 'Task',
            startDate       : new Date('2026-03-01'),
            endDate         : new Date('2026-03-15'),
            effort          : 40,
            effortRemaining : null,
            clientName      : 'Client',
            projectName     : 'Proj',
            projectNumber   : '',
            taskNumber      : ''
        };
        const html = template({ eventRecord });

        expect(html).not.toContain('Effort Remaining');
    });

    it('renders project label without number when projectNumber is empty', () => {
        const eventRecord = {
            name        : 'X',
            projectName : 'Solo',
            projectNumber : ''
        };
        const html = template({ eventRecord });

        expect(html).toContain('<strong>Project:</strong> Solo');
        expect(html).not.toContain(':  Solo');
    });

    it('renders task label without number when taskNumber is empty', () => {
        const eventRecord = {
            name       : 'Just a Task',
            taskNumber : ''
        };
        const html = template({ eventRecord });

        expect(html).toContain('<strong>Task:</strong> Just a Task');
    });

    it('handles missing optional fields gracefully', () => {
        const eventRecord = { name : 'Bare' };
        const html = template({ eventRecord });

        expect(html).toContain('Bare');
        expect(html).toContain('<strong>Client:</strong> ');
        expect(html).toContain('<strong>Project:</strong> ');
    });
});

// ── schedulerproConfig shape ────────────────────────────────────────
describe('schedulerproConfig structure', () => {
    it('has required top-level keys', () => {
        expect(schedulerproConfig.appendTo).toBe('app');
        expect(schedulerproConfig.startDate).toBeInstanceOf(Date);
        expect(schedulerproConfig.endDate).toBeInstanceOf(Date);
        expect(schedulerproConfig.viewPreset).toBe('weekAndDayLetter');
        expect(schedulerproConfig.readOnly).toBe(true);
    });

    it('has a columns array with a tree column', () => {
        expect(schedulerproConfig.columns.length).toBeGreaterThan(0);
        expect(schedulerproConfig.columns[0].type).toBe('tree');
        expect(schedulerproConfig.columns[0].field).toBe('name');
    });

    it('configures treeGroup with practice and role levels', () => {
        const levels = schedulerproConfig.features.treeGroup.levels;
        expect(levels).toEqual(['practiceName', 'roleName']);
    });

    it('has a signout button that calls signOut', () => {
        const toolbar = schedulerproConfig.tbar;
        expect(toolbar).toBeDefined();
    });
});
