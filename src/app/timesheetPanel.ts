/**
 * Timesheet panel — configures and manages the timesheet Grid that
 * appears below the scheduler/histogram when a resource is selected.
 *
 * Pattern: builds a Bryntum Grid config object and exposes lifecycle
 * functions for create / show / hide / refresh.
 */

import type { SchedulerPro } from '@bryntum/schedulerpro';
import { getTimeEntries as getTimeEntriesFromApi } from './timesheetCrud';
import {
    getTimeEntries,
    setTimeEntries,
    getSelectedResourceId,
    setSelectedResourceId,
    isTimesheetPanelVisible,
    setTimesheetPanelVisible,
    setTimesheetWeekStart,
    setTimesheetLoading,
    isTimesheetEnabled
} from './timesheetState';
import {
    resolveTimeEntries,
    getWeekStart,
    getWeekEnd,
    toISODateString,
    statusBadgeClass,
    getSubmittableEntries
} from '../lib/timesheetUtils';
import { submitTimeEntries, deleteTimeEntry } from './timesheetCrud';
import { TimeEntryStatus } from '../types/timesheet';
import type { TimeEntryRow } from '../types/timesheet';

// ── DOM container ────────────────────────────────────────────────────

const CONTAINER_ID = 'timesheet-panel';

function ensureContainer(): HTMLElement {
    let el = document.getElementById(CONTAINER_ID);
    if (!el) {
        el = document.createElement('div');
        el.id = CONTAINER_ID;
        el.style.display = 'none';
        const content = document.getElementById('content');
        if (content) {
            content.appendChild(el);
        }
    }
    return el;
}

// ── Grid HTML rendering ──────────────────────────────────────────────

function formatDate(d: Date): string {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function renderStatusBadge(row: TimeEntryRow): string {
    const cls = statusBadgeClass(row.status);
    return `<span class="ts-badge ts-badge--${cls}">${row.statusName}</span>`;
}

function renderActions(row: TimeEntryRow): string {
    const buttons: string[] = [];
    if (row.isEditable) {
        buttons.push(`<button class="ts-action ts-action--delete" data-id="${row.id}" title="Delete">
            <i class="fa fa-trash"></i>
        </button>`);
    }
    if (row.status === TimeEntryStatus.Draft) {
        buttons.push(`<button class="ts-action ts-action--submit" data-id="${row.id}" title="Submit">
            <i class="fa fa-paper-plane"></i>
        </button>`);
    }
    return buttons.join('');
}

function renderGrid(entries: TimeEntryRow[]): string {
    if (entries.length === 0) {
        return '<div class="ts-empty">No time entries found for this week.</div>';
    }

    const rows = entries.map((row) => `
        <tr class="ts-row" data-id="${row.id}">
            <td class="ts-cell">${formatDate(row.date)}</td>
            <td class="ts-cell">${row.projectName || '—'}</td>
            <td class="ts-cell">${row.taskName || '—'}</td>
            <td class="ts-cell ts-cell--hours">${row.durationHours.toFixed(2)}</td>
            <td class="ts-cell">${row.description || '—'}</td>
            <td class="ts-cell">${row.typeName}</td>
            <td class="ts-cell">${renderStatusBadge(row)}</td>
            <td class="ts-cell ts-cell--actions">${renderActions(row)}</td>
        </tr>
    `).join('');

    return `
        <table class="ts-grid">
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Project</th>
                    <th>Task</th>
                    <th>Hours</th>
                    <th>Description</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

function renderPanel(
    entries: TimeEntryRow[],
    weekStart: Date,
    loading: boolean
): string {
    const weekEnd = getWeekEnd(weekStart);
    const totalHours = entries.reduce((sum, e) => sum + e.durationHours, 0);
    const submittable = getSubmittableEntries(entries);

    return `
        <div class="ts-header">
            <div class="ts-header__title">
                <i class="fa fa-clock"></i>
                <span>Timesheet — ${toISODateString(weekStart)} to ${toISODateString(weekEnd)}</span>
            </div>
            <div class="ts-header__summary">
                <span class="ts-total">Total: <strong>${totalHours.toFixed(2)} hrs</strong></span>
                ${submittable.length > 0
        ? `<button class="ts-btn ts-btn--submit-all" title="Submit all draft entries">
                        <i class="fa fa-paper-plane"></i> Submit All (${submittable.length})
                    </button>`
        : ''}
                <button class="ts-btn ts-btn--close" title="Close timesheet panel">
                    <i class="fa fa-times"></i>
                </button>
            </div>
        </div>
        <div class="ts-body">
            ${loading ? '<div class="ts-loading">Loading time entries…</div>' : renderGrid(entries)}
        </div>
    `;
}

// ── Event wiring ─────────────────────────────────────────────────────

function wireActions(container: HTMLElement, scheduler: SchedulerPro): void {
    // Close button
    container.querySelector('.ts-btn--close')?.addEventListener('click', () => {
        hideTimesheetPanel();
    });

    // Submit All button
    container.querySelector('.ts-btn--submit-all')?.addEventListener('click', async() => {
        const drafts = getSubmittableEntries(getTimeEntries());
        if (drafts.length === 0) return;

        setTimesheetLoading(true);
        repaint(container, scheduler);

        try {
            await submitTimeEntries(drafts.map((e) => e.id));
            await refreshTimesheetData(scheduler);
        }
        catch (err) {
            console.error('[timesheetPanel] Submit all failed:', err);
        }
        finally {
            setTimesheetLoading(false);
            repaint(container, scheduler);
        }
    });

    // Per-row delete buttons
    container.querySelectorAll('.ts-action--delete').forEach((btn) => {
        btn.addEventListener('click', async(evt) => {
            const id = (evt.currentTarget as HTMLElement).dataset.id;
            if (!id) return;
            if (!confirm('Delete this time entry?')) return;

            setTimesheetLoading(true);
            repaint(container, scheduler);

            try {
                await deleteTimeEntry(id);
                await refreshTimesheetData(scheduler);
            }
            catch (err) {
                console.error('[timesheetPanel] Delete failed:', err);
            }
            finally {
                setTimesheetLoading(false);
                repaint(container, scheduler);
            }
        });
    });

    // Per-row submit buttons
    container.querySelectorAll('.ts-action--submit').forEach((btn) => {
        btn.addEventListener('click', async(evt) => {
            const id = (evt.currentTarget as HTMLElement).dataset.id;
            if (!id) return;

            setTimesheetLoading(true);
            repaint(container, scheduler);

            try {
                await submitTimeEntries([id]);
                await refreshTimesheetData(scheduler);
            }
            catch (err) {
                console.error('[timesheetPanel] Submit failed:', err);
            }
            finally {
                setTimesheetLoading(false);
                repaint(container, scheduler);
            }
        });
    });
}

function repaint(container: HTMLElement, scheduler: SchedulerPro): void {
    const weekStart = getWeekStartForView(scheduler);
    container.innerHTML = renderPanel(getTimeEntries(), weekStart, false);
    wireActions(container, scheduler);
}

// ── Week resolution ──────────────────────────────────────────────────

function getWeekStartForView(scheduler: SchedulerPro): Date {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const visRange = (scheduler as any).visibleDateRange;
    if (visRange?.startDate) {
        return getWeekStart(new Date(visRange.startDate));
    }
    return getWeekStart(new Date());
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Load time entries for the selected resource and current week,
 * then render the panel.
 */
export async function refreshTimesheetData(scheduler: SchedulerPro): Promise<void> {
    const resourceId = getSelectedResourceId();
    if (!resourceId) return;

    const weekStart = getWeekStartForView(scheduler);
    const weekEnd = getWeekEnd(weekStart);
    setTimesheetWeekStart(weekStart);

    try {
        const { value: rawEntries } = await getTimeEntriesFromApi({
            rangeStart : weekStart,
            rangeEnd   : weekEnd,
            resourceId
        });
        const rows = resolveTimeEntries(rawEntries);
        setTimeEntries(rows);
    }
    catch (err) {
        console.error('[timesheetPanel] Failed to load time entries:', err);
        setTimeEntries([]);
    }
}

/**
 * Show the timesheet panel for a specific resource.
 */
export async function showTimesheetPanel(
    scheduler: SchedulerPro,
    resourceId: string
): Promise<void> {
    if (!isTimesheetEnabled()) return;

    setSelectedResourceId(resourceId);
    setTimesheetPanelVisible(true);
    setTimesheetLoading(true);

    const container = ensureContainer();
    const weekStart = getWeekStartForView(scheduler);
    container.innerHTML = renderPanel([], weekStart, true);
    container.style.display = 'flex';

    await refreshTimesheetData(scheduler);
    setTimesheetLoading(false);

    container.innerHTML = renderPanel(getTimeEntries(), weekStart, false);
    wireActions(container, scheduler);
}

/**
 * Hide the timesheet panel.
 */
export function hideTimesheetPanel(): void {
    setTimesheetPanelVisible(false);
    setSelectedResourceId(null);
    setTimeEntries([]);

    const container = document.getElementById(CONTAINER_ID);
    if (container) {
        container.style.display = 'none';
        container.innerHTML = '';
    }
}

/**
 * Toggle timesheet panel for a resource.
 */
export async function toggleTimesheetPanel(
    scheduler: SchedulerPro,
    resourceId: string
): Promise<void> {
    if (isTimesheetPanelVisible() && getSelectedResourceId() === resourceId) {
        hideTimesheetPanel();
    }
    else {
        await showTimesheetPanel(scheduler, resourceId);
    }
}
