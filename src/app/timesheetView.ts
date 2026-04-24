/**
 * Timesheet view orchestrator.
 *
 * Owns the full lifecycle of the timesheet grid view:
 *  - Lazy initialisation on first navigate to `#/timesheet`
 *  - Data loading (identity → settings → time entries → variations → pivot)
 *  - Week navigation (prev / next / today)
 *  - Wiring toolbar buttons to CRUD operations
 *  - Cell-edit handling (recalculate totals, mark dirty)
 *  - Save (diff → create / update / delete entries + variations)
 *  - Submit / recall workflows
 *
 * The Grid instance is created once and reused; subsequent navigations
 * simply reload data into the existing store.
 */

import { Grid, Popup, Toast } from '@bryntum/schedulerpro';
import {
    buildTimesheetGridConfig,
    buildTimesheetColumns,
    formatWeekLabel
} from './timesheetGridConfig';
import {
    resolveIdentity,
    getAllBookableResources,
    getResourceCategories,
    setImpersonation,
    clearImpersonation,
    isImpersonating,
    type BookableResource
} from './timesheetIdentity';
import { loadTimesheetSettings, getTimesheetSettings } from './timesheetSettings';
import { getTimeEntries, createTimeEntry, updateTimeEntry, deleteTimeEntry, submitTimeEntries } from './timesheetCrud';
import {
    getVariations,
    getUserTimesheet,
    createUserTimesheet,
    completeUserTimesheet,
    recallUserTimesheet,
    createVariation,
    updateVariation,
    deleteVariation,
    submitVariations,
    createHelpTask,
    getResourceAssignments,
    getResourceProjects,
    getProjectTasks
} from './timesheetDataService';
import {
    buildPivotRows,
    buildTotalsRow,
    pivotRowToFlat,
    flatToPivotRow,
    diffPivotRows,
    roundToIncrement,
    createEmptyPivotRow,
    getRowKey,
    DAY_COUNT,
    type FlatPivotRecord
} from '../lib/timesheetPivotUtils';
import TimesheetRowModel from '../lib/TimesheetRowModel';
import { getWeekStart, getWeekEnd, toISODateString, resolveTimeEntries, buildCreatePayload } from '../lib/timesheetUtils';
import { navigate, getCurrentParams } from './router';
import { openVariationDialog, destroyVariationDialog } from './timesheetVariationDialog';
import {
    openProjectPicker,
    destroyProjectPicker,
    resetProjectPickerCache,
    type PickerResult
} from './timesheetProjectPicker';
import {
    setTimesheetWeekStart,
    setTimesheetLoading,
    setSelectedResourceId
} from './timesheetState';
import type { PivotRow, D365Project, D365UserTimesheet, TimeEntryRow, CreateHelpTaskPayload } from '../types/timesheet';
import { TimeEntryStatus, UserTimesheetStatus, USER_TIMESHEET_STATUS_LABELS } from '../types/timesheet';

// ── State ───────────────────────────────────────────────────────────

let grid : Grid | null = null;
let initialised = false;
let currentWeekStart : Date = getWeekStart(new Date());
let originalPivotRows : PivotRow[] = [];
let currentPivotRows : PivotRow[] = [];
let currentResourceId : string | null = null;
let currentUserTimesheet : D365UserTimesheet | null = null;
let loadedTimeEntries : TimeEntryRow[] = [];
let loading = false;
let defaultRoleId : string | null = null;

// Auto-save debounce
const AUTO_SAVE_DELAY_MS = 3000;
let autoSaveTimer : ReturnType<typeof setTimeout> | null = null;
let autoSaveEnabled = true;

// Filter debounce
const FILTER_DEBOUNCE_MS         = 300;
const FILTER_STORAGE_KEY         = 'ts-filter-text';
const FILTER_PRESET_STORAGE_KEY  = 'ts-filter-preset';
let filterTimer : ReturnType<typeof setTimeout> | null = null;

// ── Initialisation ──────────────────────────────────────────────────

/**
 * Called by the router when navigating to `#/timesheet`.
 * Initialises the grid on first call, then (re)loads data for the
 * requested resource + week.
 */
export async function activateTimesheetView() : Promise<void> {
    const params = getCurrentParams();

    // Resolve resource
    if (params.resource) {
        currentResourceId = params.resource;
        setSelectedResourceId(params.resource);
        setImpersonation(params.resource);
    }
    else {
        // Fall back to logged-in user's own resource
        const identity = await resolveIdentity();
        currentResourceId = identity.resourceId;
        setSelectedResourceId(identity.resourceId);
        clearImpersonation();
    }

    // Resolve week
    if (params.week) {
        currentWeekStart = getWeekStart(new Date(params.week));
    }
    else {
        currentWeekStart = getWeekStart(new Date());
    }
    setTimesheetWeekStart(currentWeekStart);

    // Ensure settings are loaded (cache-first, refresh in background)
    await loadTimesheetSettings();

    // Resolve default resource category (role) for new time entries
    resolveDefaultRoleId(currentResourceId!);

    if (!initialised) {
        createGrid();
        initialised = true;
    }

    // Populate resource combo (async — don't block data load)
    populateResourceCombo();

    await loadWeekData();
}

// ── Grid creation ───────────────────────────────────────────────────

function createGrid() : void {
    // Register model class
    TimesheetRowModel.initClass();

    const config = buildTimesheetGridConfig(currentWeekStart);

    // Replace model class name with actual class reference
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cfg = config as any;
    if (cfg.store) {
        cfg.store.modelClass = TimesheetRowModel;
    }

    grid = new Grid(cfg);

    wireToolbar();
    wireCellEdit();
    wireCellClick();

    console.log('[timesheetView] Grid created');
}

// ── Toolbar wiring ──────────────────────────────────────────────────

function wireToolbar() : void {
    if (!grid) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wm = (grid as any).widgetMap;

    wm.backButton?.on('click', () => {
        navigate('planner');
    });

    wm.prevWeekButton?.on('click', () => {
        navigateWeek(-7);
    });

    wm.nextWeekButton?.on('click', () => {
        navigateWeek(7);
    });

    wm.todayButton?.on('click', () => {
        currentWeekStart = getWeekStart(new Date());
        navigateToCurrentWeek();
    });

    wm.addRowButton?.on('click', () => {
        handleAddRow();
    });

    wm.saveButton?.on('click', () => {
        handleSave();
    });

    wm.submitButton?.on('click', () => {
        handleSubmit();
    });

    wm.recallButton?.on('click', () => {
        handleRecall();
    });

    // Resource combo — impersonation selector
    wm.resourceCombo?.on('change', ({ value } : { value : string | null }) => {
        if (!value || value === currentResourceId) return;
        handleResourceChange(value);
    });

    // Filter text field — debounced project/task filtering
    wm.filterField?.on('input', () => {
        scheduleFilter();
    });
    wm.filterField?.on('clear', () => {
        applyFilter('');
    });

    // Filter preset combo
    wm.filterPreset?.on('change', ({ value }: { value : string | null }) => {
        applyPresetFilter(value);
    });

    // Restore persisted filter text
    const savedFilter = localStorage.getItem(FILTER_STORAGE_KEY) ?? '';
    if (savedFilter && wm.filterField) {
        wm.filterField.value = savedFilter;
        // Defer initial filter until data is loaded
    }

    // Restore persisted filter preset
    const savedPreset = localStorage.getItem(FILTER_PRESET_STORAGE_KEY) ?? '';
    if (savedPreset && wm.filterPreset) {
        wm.filterPreset.value = savedPreset;
    }
}

// ── Resource combo / impersonation ──────────────────────────────────

/**
 * Populate the resource combo with all active bookable resources.
 * Also pre-selects the current resource and shows the impersonation
 * banner if viewing someone else's timesheet.
 */
async function populateResourceCombo() : Promise<void> {
    if (!grid) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wm = (grid as any).widgetMap;

    try {
        const resources = await getAllBookableResources();

        const items = resources.map((r : BookableResource) => ({
            value : r.bookableresourceid,
            label : r.name
        }));

        wm.resourceCombo.items = items;

        // Pre-select current resource
        if (currentResourceId) {
            wm.resourceCombo.value = currentResourceId;
        }

        // Show the combo
        wm.resourceCombo.hidden = false;

        // Update impersonation banner
        updateImpersonationBanner();
    }
    catch (err) {
        console.error('[timesheetView] Failed to load bookable resources:', err);
    }
}

/**
 * Handle resource combo selection change — switch to another user's timesheet.
 */
async function handleResourceChange(resourceId : string) : Promise<void> {
    cancelAutoSave();

    // Update impersonation state
    currentResourceId = resourceId;
    setSelectedResourceId(resourceId);
    setImpersonation(resourceId);

    // Re-resolve default role for the new resource
    resolveDefaultRoleId(resourceId);

    // Reset caches scoped to previous resource
    resetProjectPickerCache();

    // Update URL + load data
    navigateToCurrentWeek();

    // Update impersonation banner
    updateImpersonationBanner();
}

/**
 * Update the impersonation banner visibility and text.
 */
function updateImpersonationBanner() : void {
    if (!grid) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wm = (grid as any).widgetMap;

    if (isImpersonating()) {
        const selectedName = getSelectedResourceName();
        wm.impersonationBanner.html = `<i class="fa fa-user-secret"></i> Viewing timesheet for <strong>${selectedName}</strong>`;
        wm.impersonationBanner.hidden = false;
    }
    else {
        wm.impersonationBanner.hidden = true;
        wm.impersonationBanner.html = '';
    }
}

/**
 * Get the display name of the currently selected resource from the combo.
 */
function getSelectedResourceName() : string {
    if (!grid) return '';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wm = (grid as any).widgetMap;

    // Bryntum Combo stores the selected record
    const selectedRecord = wm.resourceCombo?.record;
    if (selectedRecord) {
        return selectedRecord.label ?? selectedRecord.text ?? '';
    }

    return '';
}

// ── Grid filter ─────────────────────────────────────────────────────

/**
 * Debounce the filter application.
 */
function scheduleFilter() : void {
    if (filterTimer != null) {
        clearTimeout(filterTimer);
    }
    filterTimer = setTimeout(() => {
        filterTimer = null;
        if (!grid) return;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const wm = (grid as any).widgetMap;
        const text = (wm.filterField?.value as string) ?? '';
        applyFilter(text);
    }, FILTER_DEBOUNCE_MS);
}

/**
 * Apply a text filter to the grid store.
 * Matches against projectName and taskName fields (case-insensitive).
 * The totals row (type === 'totals') is always shown.
 */
function applyFilter(text : string) : void {
    if (!grid) return;

    const store = grid.store;
    const trimmed = text.trim().toLowerCase();

    // Persist filter text
    if (trimmed) {
        localStorage.setItem(FILTER_STORAGE_KEY, trimmed);
    }
    else {
        localStorage.removeItem(FILTER_STORAGE_KEY);
    }

    // Clear existing filters
    store.clearFilters();

    if (!trimmed) return;

    // Add a filter function
    store.filter({
        id       : 'ts-text-filter',
        filterBy : (record : { get : (field : string) => unknown }) => {
            // Always show totals row
            if (record.get('type') === 'total') return true;

            const project = ((record.get('projectName') as string) ?? '').toLowerCase();
            const task    = ((record.get('taskName') as string) ?? '').toLowerCase();

            return project.includes(trimmed) || task.includes(trimmed);
        }
    });
}

/**
 * Re-apply the persisted filter after data reload.
 */
function reapplyPersistedFilter() : void {
    const saved = localStorage.getItem(FILTER_STORAGE_KEY) ?? '';
    if (saved) {
        applyFilter(saved);
    }

    // Also re-apply any active preset
    const savedPreset = localStorage.getItem(FILTER_PRESET_STORAGE_KEY) ?? '';
    if (savedPreset) {
        applyPresetFilter(savedPreset);
    }
}

/**
 * Apply a preset filter to the grid store.
 *
 * Presets:
 *  - `myTasks`       — show only standard rows (hide internal/help)
 *  - `withTime`      — show only rows with total > 0
 *  - `hideCompleted` — hide rows where all day entries are read-only
 *  - `internal`      — show only internal rows
 *  - `helpTasks`     — show only help task rows
 *
 * Composes alongside the text filter (separate filter ID).
 */
function applyPresetFilter(presetId : string | null) : void {
    if (!grid) return;

    const store = grid.store;

    // Persist preset
    if (presetId) {
        localStorage.setItem(FILTER_PRESET_STORAGE_KEY, presetId);
    }
    else {
        localStorage.removeItem(FILTER_PRESET_STORAGE_KEY);
    }

    // Remove only the preset filter (keep text filter intact)
    store.removeFilter('ts-preset-filter');

    if (!presetId) return;

    store.filter({
        id       : 'ts-preset-filter',
        filterBy : (record : { get : (field : string) => unknown }) => {
            // Always show totals row
            const type = record.get('type') as string;
            if (type === 'total') return true;

            switch (presetId) {
                case 'myTasks':
                    return type === 'stdentry';

                case 'withTime': {
                    let total = 0;
                    for (let d = 0; d < DAY_COUNT; d++) {
                        total += (record.get(`day${d}`) as number) ?? 0;
                    }
                    return total > 0;
                }

                case 'hideCompleted': {
                    // Hide rows where ALL day cells are read-only (submitted/approved)
                    let allReadOnly = true;
                    let hasAnyEntry = false;
                    for (let d = 0; d < DAY_COUNT; d++) {
                        const time = (record.get(`day${d}`) as number) ?? 0;
                        if (time > 0) {
                            hasAnyEntry = true;
                            if (!record.get(`day${d}ReadOnly`)) {
                                allReadOnly = false;
                                break;
                            }
                        }
                    }
                    // Show rows that have no entries or have at least one editable entry
                    return !hasAnyEntry || !allReadOnly;
                }

                case 'internal':
                    return type === 'intentry';

                case 'helpTasks':
                    return type === 'helptask';

                default:
                    return true;
            }
        }
    });
}

// ── Cell edit wiring ────────────────────────────────────────────────

/** Currently open description popup (if any). */
let descriptionPopup : InstanceType<typeof Popup> | null = null;

/**
 * Show a small anchored popup for entering a day-cell comment/description.
 * Designed for keyboard-fast flow: Tab → hours → Tab → description → Tab → next cell.
 */
function showDescriptionPopup(record : any, dayIndex : number, cellElement : HTMLElement) : void {
    // Close any existing popup
    descriptionPopup?.close?.();

    const commentField = `day${dayIndex}Comment`;
    const existing = (record.get(commentField) as string) ?? '';

    descriptionPopup = new Popup({
        anchor     : true,
        forElement : cellElement,
        cls        : 'ts-description-popup',
        width      : 260,
        autoClose  : true,
        closable   : false,
        modal      : false,
        items      : [
            {
                type          : 'textareafield',
                ref           : 'descInput',
                label         : 'Description',
                labelPosition : 'above',
                height        : 60,
                value         : existing,
                placeholder   : 'Enter description…'
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any
        ],
        bbar : [
            {
                type    : 'button',
                text    : 'OK',
                cls     : 'b-raised',
                ref     : 'okBtn',
                onClick : () => {
                    applyAndCloseDescriptionPopup(record, commentField);
                }
            },
            {
                type    : 'button',
                text    : 'Skip',
                cls     : 'b-transparent',
                onClick : () => {
                    descriptionPopup?.close?.();
                    descriptionPopup = null;
                }
            }
        ],
        listeners : {
            // Focus the text area when popup appears
            show() {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const input = (descriptionPopup as any)?.widgetMap?.descInput;
                if (input) {
                    setTimeout(() => input.focus(), 50);
                }
            },
            close() {
                descriptionPopup = null;
            }
        }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    // Wire Tab / Enter to close and save
    const el = (descriptionPopup as any).element as HTMLElement | undefined;
    if (el) {
        el.addEventListener('keydown', (e : KeyboardEvent) => {
            if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
                e.preventDefault();
                applyAndCloseDescriptionPopup(record, commentField);
            }
            if (e.key === 'Escape') {
                descriptionPopup?.close?.();
                descriptionPopup = null;
            }
        });
    }
}

/**
 * Apply the description value from the popup and close it.
 */
function applyAndCloseDescriptionPopup(record : any, commentField : string) : void {
    if (!descriptionPopup) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const input = (descriptionPopup as any)?.widgetMap?.descInput;
    const value = input?.value ?? '';
    record.set(commentField, value);
    record.set('dirty', true);
    descriptionPopup.close?.();
    descriptionPopup = null;
}

function wireCellEdit() : void {
    if (!grid) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (grid as any).on('finishCellEdit', (event: any) => {
        const record = event.record ?? event.editorContext?.record;
        const field  = event.field ?? event.editorContext?.column?.field;

        // Capture the cell element from editorContext before Bryntum cleans it up
        const editedCellEl = event.editorContext?.cell as HTMLElement | undefined;

        // Ignore non-day fields (or if field is unavailable)
        if (!field || !field.startsWith('day') || field.includes('Comment') || field.includes('Entry') || field.includes('ReadOnly')) {
            return;
        }

        // Recalculate row total
        if (typeof record.recalculateTotal === 'function') {
            record.recalculateTotal();
        }
        else {
            // Manual recalc for plain records
            let total = 0;
            for (let d = 0; d < 7; d++) {
                total += (record.get(`day${d}`) as number) ?? 0;
            }
            record.set('rowTotal', total);
        }

        // Mark dirty
        record.set('dirty', true);

        // Recalculate totals row
        updateTotalsRow();

        // If value is > 0, show description popup for chained keyboard entry
        // Use setTimeout to let Bryntum finish its cell navigation before showing popup
        const dayIndex = parseInt(field.replace('day', ''), 10);
        const hours = (record.get(field) as number) ?? 0;
        if (hours > 0 && !isNaN(dayIndex)) {
            const capturedRecord = record;
            const capturedDayIndex = dayIndex;
            setTimeout(() => {
                if (!grid) return;
                // Cancel any in-progress cell edit so popup can take focus
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const cellEdit = (grid as any).features?.cellEdit;
                if (cellEdit?.isEditing) {
                    cellEdit.cancelEditing();
                }
                // Use the cell element captured from editorContext at event time
                if (editedCellEl) {
                    showDescriptionPopup(capturedRecord, capturedDayIndex, editedCellEl);
                }
            }, 50);
        }

        // Trigger auto-save
        scheduleAutoSave();
    });
}

// ── Variation cell click ─────────────────────────────────────────────

function wireCellClick() : void {
    if (!grid) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (grid as any).on('cellClick', ({ record, column, event } : { record : any; column : any; event : MouseEvent }) => {
        // Click on green comment triangle → reopen description popup
        const target = event.target as HTMLElement;
        if (target.classList.contains('ts-comment-present')) {
            const dayIndex = parseInt(target.dataset.day ?? '', 10);
            if (!isNaN(dayIndex)) {
                const cellEl = target.closest('.b-grid-cell') as HTMLElement | null;
                if (cellEl) {
                    showDescriptionPopup(record, dayIndex, cellEl);
                }
            }
            return;
        }

        if (column.field !== 'variationTime') return;
        if (record.get('type') !== 'stdentry') return;

        openVariationDialog({
            record : record as TimesheetRowModel,
            onSave : () => updateTotalsRow()
        });
    });
}

// ── Week navigation ─────────────────────────────────────────────────

function navigateWeek(offsetDays : number) : void {
    const newDate = new Date(currentWeekStart);
    newDate.setDate(newDate.getDate() + offsetDays);
    currentWeekStart = getWeekStart(newDate);
    navigateToCurrentWeek();
}

function navigateToCurrentWeek() : void {
    cancelAutoSave();
    setTimesheetWeekStart(currentWeekStart);

    // Update URL params (preserves current route)
    navigate('timesheet', {
        resource : currentResourceId ?? undefined,
        week     : toISODateString(currentWeekStart)
    });

    loadWeekData();
}

// ── Default role ID resolution ──────────────────────────────────────

/**
 * Resolve the default resource category (role) for a resource.
 * Uses the first `msdyn_isdefault` category assignment, or falls back
 * to the first one in the list. Runs async without blocking.
 */
async function resolveDefaultRoleId(resourceId: string): Promise<void> {
    try {
        const categories = await getResourceCategories(resourceId);
        const defaultCat = categories.find((c) => c.msdyn_isdefault);
        defaultRoleId = defaultCat?._resourcecategory_value
            ?? categories[0]?._resourcecategory_value
            ?? null;
        console.log('[timesheetView] Default role ID:', defaultRoleId);
    }
    catch (err) {
        console.warn('[timesheetView] Failed to resolve default role ID:', err);
        defaultRoleId = null;
    }
}

// ── Pre-populate assignment rows ────────────────────────────────────

/**
 * Fetch resource assignments and add empty rows for project/task combos
 * that don't already exist in the pivot.  This mirrors the original
 * `getProjectsAndTasks()` behaviour that pre-seeded rows for every
 * assignment so users don't have to manually add them.
 */
async function prePopulateAssignmentRows(
    pivotRows          : PivotRow[],
    internalProjectIds : Set<string>
) : Promise<void> {
    if (!currentResourceId) return;

    try {
        // Fetch assignments and projects in parallel
        const [assignments, projects] = await Promise.all([
            getResourceAssignments(currentResourceId),
            getResourceProjects(currentResourceId)
        ]);

        // Build a lookup of project names
        const projectNameMap = new Map<string, string>();
        for (const p of projects) {
            projectNameMap.set(p.msdyn_projectid, p.msdyn_subject);
        }

        // Build a set of existing row keys
        const existingKeys = new Set(pivotRows.map((r) => r.id));

        // Group assignments by project to batch task lookups
        const projectAssignments = new Map<string, Set<string | null>>();
        for (const a of assignments) {
            const pid = a._msdyn_projectid_value;
            if (!pid) continue;
            if (!projectAssignments.has(pid)) {
                projectAssignments.set(pid, new Set());
            }
            projectAssignments.get(pid)!.add(a._msdyn_taskid_value);
        }

        // Fetch task names for projects that have task-level assignments
        const taskNameMap = new Map<string, string>();
        const taskFetchPromises : Promise<void>[] = [];

        for (const [pid, taskIds] of projectAssignments) {
            const hasTasks = [...taskIds].some((tid) => tid !== null);
            if (hasTasks) {
                taskFetchPromises.push(
                    getProjectTasks(pid, currentResourceId!).then((tasks) => {
                        for (const t of tasks) {
                            taskNameMap.set(t.msdyn_projecttaskid, t.msdyn_subject);
                        }
                    })
                );
            }
        }
        await Promise.all(taskFetchPromises);

        // Add empty rows for missing combos
        for (const [pid, taskIds] of projectAssignments) {
            const pName = projectNameMap.get(pid) ?? 'Unknown Project';
            const isInternal = internalProjectIds.has(pid);

            for (const tid of taskIds) {
                const key = getRowKey(pid, tid);
                if (existingKeys.has(key)) continue;

                const tName = tid ? (taskNameMap.get(tid) ?? 'Unknown Task') : '';
                const emptyRow = createEmptyPivotRow(
                    pid, pName, tid, tName, null,
                    isInternal ? 'intentry' : 'stdentry'
                );
                pivotRows.push(emptyRow);
                existingKeys.add(key);
            }
        }
    }
    catch (err) {
        // Non-critical — log and continue without pre-populated rows
        console.warn('[timesheetView] Failed to pre-populate assignment rows:', err);
    }
}

// ── Data loading ────────────────────────────────────────────────────

async function loadWeekData() : Promise<void> {
    if (!grid || !currentResourceId || loading) return;

    loading = true;
    setTimesheetLoading(true);
    showLoadingMask(true);

    try {
        const weekEndDate = new Date(currentWeekStart);
        weekEndDate.setDate(currentWeekStart.getDate() + 6);
        weekEndDate.setHours(23, 59, 59, 999);

        // Parallel data fetch
        const [entriesResult, settingsResult, userTimesheetResult] = await Promise.all([
            getTimeEntries({
                resourceId : currentResourceId,
                rangeStart : currentWeekStart,
                rangeEnd   : weekEndDate
            }),
            loadTimesheetSettings(),
            getUserTimesheet(currentResourceId, toISODateString(currentWeekStart))
        ]);

        const settings = settingsResult;
        currentUserTimesheet = userTimesheetResult;

        // Resolve time entries
        loadedTimeEntries = resolveTimeEntries(entriesResult.value);

        // Fetch variations for the current resource
        const variations = currentResourceId ? await getVariations(currentResourceId) : [];

        // Build pivot
        const internalIds = new Set(settings.internalProjectIds);
        const pivotRows = buildPivotRows(loadedTimeEntries, variations, currentWeekStart, internalIds);

        // Pre-populate empty rows from resource assignments (Gap 2)
        await prePopulateAssignmentRows(pivotRows, internalIds);

        const totalsRow = buildTotalsRow(pivotRows);

        // Store original for change detection
        originalPivotRows = pivotRows.map((r) => structuredClone(r));
        currentPivotRows  = [...pivotRows, totalsRow];

        // Convert to flat records and load into grid store
        const flatData : FlatPivotRecord[] = currentPivotRows.map(pivotRowToFlat);
        grid.store.data = flatData;

        // Update columns for new week dates
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (grid.columns as any).data = buildTimesheetColumns(currentWeekStart);

        // Update toolbar
        updateToolbarLabel();
        updateToolbarButtons();

        // Re-apply filter if persisted
        reapplyPersistedFilter();

        console.log(`[timesheetView] Loaded ${pivotRows.length} rows for week ${toISODateString(currentWeekStart)}`);
    }
    catch (err) {
        console.error('[timesheetView] Failed to load week data:', err);
        showErrorToast(`Failed to load timesheet data: ${(err as Error).message}`);
    }
    finally {
        loading = false;
        setTimesheetLoading(false);
        showLoadingMask(false);
    }
}

// ── Toolbar updates ─────────────────────────────────────────────────

function updateToolbarLabel() : void {
    if (!grid) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wm = (grid as any).widgetMap;
    const label = wm.weekLabel;
    if (label) {
        label.html = `<span class="ts-week-text">${formatWeekLabel(currentWeekStart)}</span>`;
    }
}

function updateToolbarButtons() : void {
    if (!grid) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wm = (grid as any).widgetMap;

    const compositeStatus = getCompositeStatus();

    const isEditable = compositeStatus === 'Draft' || compositeStatus === 'Returned';
    const isSubmitted = compositeStatus === 'Submitted';

    // Show recall only for submitted timesheets
    if (wm.recallButton) {
        wm.recallButton.hidden = !isSubmitted;
    }

    // Disable submit for already-submitted, approved, or completed
    if (wm.submitButton) {
        wm.submitButton.disabled = !isEditable;
    }

    // Disable save for non-editable states
    if (wm.saveButton) {
        wm.saveButton.disabled = !isEditable;
    }

    // Disable add row for non-editable states
    if (wm.addRowButton) {
        wm.addRowButton.disabled = !isEditable;
    }

    // Update status indicator badge
    updateStatusIndicator(compositeStatus);

    // Apply status class on grid element for row tinting
    applyGridStatusClass(compositeStatus);

    // Update entry count
    updateEntryCount();

    // Update approver comments
    updateApproverComments();

    // Lock or unlock cell editing based on status
    setGridReadOnly(!isEditable);
}

/**
 * Derive a composite status label from the user-timesheet record
 * and fall back to individual time entry statuses.
 */
function getCompositeStatus() : string {
    // If there is a user timesheet with an explicit status, prefer it
    if (currentUserTimesheet?.statuscode != null) {
        return USER_TIMESHEET_STATUS_LABELS[currentUserTimesheet.statuscode] ?? 'Draft';
    }

    // Otherwise derive from individual time entries
    if (loadedTimeEntries.length === 0) return 'Draft';

    const allSubmitted = loadedTimeEntries.every(
        (e) => e.status === TimeEntryStatus.Submitted
    );
    if (allSubmitted) return 'Submitted';

    const allApproved = loadedTimeEntries.every(
        (e) => e.status === TimeEntryStatus.Approved
    );
    if (allApproved) return 'Approved';

    const anyReturned = loadedTimeEntries.some(
        (e) => e.status === TimeEntryStatus.Returned
    );
    if (anyReturned) return 'Returned';

    return 'Draft';
}

/**
 * Update the status badge widget in the toolbar.
 */
function updateStatusIndicator(status : string) : void {
    if (!grid) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wm = (grid as any).widgetMap;
    const indicator = wm.statusIndicator;
    if (!indicator) return;

    const cls = `ts-badge ts-badge--${status.toLowerCase().replace(/\s+/g, '-')}`;
    indicator.html = `<span class="${cls}">${status}</span>`;
}

/** Status CSS classes applied to the grid element. */
const STATUS_CLASSES = ['ts-status-draft', 'ts-status-submitted', 'ts-status-approved', 'ts-status-returned', 'ts-status-recall-requested'];

/**
 * Apply a status CSS class on the grid element for row-level tinting.
 * Removes previous status class before applying the new one.
 */
function applyGridStatusClass(status : string) : void {
    if (!grid?.element) return;
    const el = grid.element;
    for (const c of STATUS_CLASSES) {
        el.classList.remove(c);
    }
    const statusCls = `ts-status-${status.toLowerCase().replace(/\s+/g, '-')}`;
    el.classList.add(statusCls);
}

/**
 * Update the entry count label in the toolbar.
 */
function updateEntryCount() : void {
    if (!grid) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wm = (grid as any).widgetMap;
    const label = wm.entryCountLabel;
    if (!label) return;

    const rowCount = currentPivotRows.filter((r) => r.type !== 'total').length;
    const entryCount = loadedTimeEntries.length;
    label.html = `<span class="ts-entry-count-text">${rowCount} row${rowCount !== 1 ? 's' : ''} · ${entryCount} entr${entryCount !== 1 ? 'ies' : 'y'}</span>`;
}

/**
 * Show or hide approver comments if present on the user timesheet.
 */
function updateApproverComments() : void {
    if (!grid) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wm = (grid as any).widgetMap;
    const widget = wm.approverComments;
    if (!widget) return;

    // ws_usertimesheet does not have an approver comments field in the original source.
    // If this feature is added later, fetch the field name from the entity metadata.
    widget.html = '';
    widget.hidden = true;
}

/**
 * Toggle read-only state on all day columns to prevent editing
 * when the timesheet is submitted or approved.
 */
function setGridReadOnly(readOnly : boolean) : void {
    if (!grid) return;

    // Disable / enable cell-edit feature
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cellEdit = (grid.features as any).cellEdit;
    if (cellEdit) {
        cellEdit.disabled = readOnly;
    }

    // Also visually mark each day-cell record as readOnly
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (grid.store as any).forEach((record : any) => {
        if (record.get('type') === 'total') return;
        for (let d = 0; d < 7; d++) {
            record.set(`day${d}ReadOnly`, readOnly || record.get(`day${d}ReadOnly`));
        }
    });
}

/** Simple HTML-escape for user-generated strings. */
function escapeHtml(str : string) : string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ── Totals row update ───────────────────────────────────────────────

function updateTotalsRow() : void {
    if (!grid) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = grid.store as any;
    const totalsRecord = store.findRecord('type', 'total');
    if (!totalsRecord) return;

    // Sum all non-total rows
    const dayTotals = new Array<number>(7).fill(0);
    let variationTotal = 0;

    store.forEach((record : TimesheetRowModel) => {
        if (record.get('type') === 'total') return;
        for (let d = 0; d < 7; d++) {
            dayTotals[d]! += (record.get(`day${d}`) as number) ?? 0;
        }
        variationTotal += (record.get('variationTime') as number) ?? 0;
    });

    for (let d = 0; d < 7; d++) {
        totalsRecord.set(`day${d}`, dayTotals[d]);
    }
    totalsRecord.set('variationTime', variationTotal);

    let grandTotal = 0;
    for (const dt of dayTotals) grandTotal += dt;
    totalsRecord.set('rowTotal', grandTotal);
}

// ── Add Row ─────────────────────────────────────────────────────────

async function handleAddRow() : Promise<void> {
    if (!currentResourceId) return;

    // Build set of already-used row keys
    const existingKeys = new Set(
        currentPivotRows.filter((r) => r.type !== 'total').map((r) => r.id)
    );

    // Open project picker dialog — returns when user picks or cancels
    const result : PickerResult = await openProjectPicker(
        currentResourceId,
        existingKeys,
        currentWeekStart
    );

    if (!result) return; // cancelled

    if (result.mode === 'helptask') {
        // Create a help task record in D365
        await handleCreateHelpTask(result);
        return;
    }

    // ── Project row mode ────────────────────────────────────────
    const { project, task } = result;
    const settings = getTimesheetSettings();
    const isInternal = settings.internalProjectIds.includes(project.msdyn_projectid);

    const newRow : FlatPivotRecord = {
        id : task
            ? `${project.msdyn_projectid}::${task.msdyn_projecttaskid}`
            : project.msdyn_projectid,
        type              : isInternal ? 'intentry' : 'stdentry',
        projectId         : project.msdyn_projectid,
        projectName       : project.msdyn_subject,
        taskId            : task?.msdyn_projecttaskid ?? null,
        taskName          : task?.msdyn_subject ?? '',
        assignmentId      : null,
        rowTotal          : 0,
        dirty             : false,
        day0              : 0, day1              : 0, day2              : 0, day3              : 0, day4              : 0, day5              : 0, day6              : 0,
        day0Comment       : '', day1Comment       : '', day2Comment       : '', day3Comment       : '', day4Comment       : '', day5Comment       : '', day6Comment       : '',
        day0EntryId       : null, day1EntryId       : null, day2EntryId       : null, day3EntryId       : null, day4EntryId       : null, day5EntryId       : null, day6EntryId       : null,
        day0ReadOnly      : false, day1ReadOnly      : false, day2ReadOnly      : false, day3ReadOnly      : false, day4ReadOnly      : false, day5ReadOnly      : false, day6ReadOnly      : false,
        variationTime     : 0,
        variationComment  : '',
        variationEntryId  : null,
        variationReasonId : null,
        variationEndDate  : null,
        variationChanged  : false
    };

    // Insert before totals row
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = grid!.store as any;
    const totalsIdx = store.indexOf(store.findRecord('type', 'total'));
    if (totalsIdx >= 0) {
        store.insert(totalsIdx, newRow);
    }
    else {
        store.add(newRow);
    }

    // Track in current pivot rows
    currentPivotRows.splice(
        currentPivotRows.findIndex((r) => r.type === 'total'),
        0,
        flatToPivotRow(newRow)
    );

    // Update entry count in toolbar
    updateEntryCount();

    console.log(`[timesheetView] Added row: ${newRow.projectName} / ${newRow.taskName}`);
    showSuccessToast(`Added ${newRow.projectName}${newRow.taskName ? ' / ' + newRow.taskName : ''}`);
}

// ── Help Task creation ──────────────────────────────────────────────

async function handleCreateHelpTask(
    result : { project : D365Project; hours : number; startDate : string; endDate : string; reason : string | null; comment : string }
) : Promise<void> {
    if (!currentResourceId) return;

    showLoadingMask(true);
    try {
        const payload : CreateHelpTaskPayload = {
            ws_name                  : `Help: ${result.project.msdyn_subject}`,
            ws_hours                 : result.hours,
            ws_startdate             : result.startDate,
            ws_enddate               : result.endDate,
            'ws_resource@odata.bind' : `/bookableresources(${currentResourceId})`,
            'ws_project@odata.bind'  : `/msdyn_projects(${result.project.msdyn_projectid})`
        };

        if (result.reason) {
            payload['ws_reason@odata.bind'] = `/ws_projecthelptaskreasonses(${result.reason})`;
        }
        if (result.comment) {
            payload.ws_description = result.comment;
        }

        await createHelpTask(payload);
        showSuccessToast(`Help task created for ${result.project.msdyn_subject}.`);
        console.log(`[timesheetView] Created help task for project: ${result.project.msdyn_subject}`);
    }
    catch (err) {
        console.error('[timesheetView] Failed to create help task:', err);
        showErrorToast(`Help task creation failed: ${(err as Error).message}`);
    }
    finally {
        showLoadingMask(false);
    }
}

// ── Save ────────────────────────────────────────────────────────────

async function handleSave() : Promise<void> {
    if (!grid || !currentResourceId) return;

    // Cancel any pending auto-save since we're saving now
    cancelAutoSave();

    // Build current pivot state from grid store
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = grid.store as any;
    const currentRows : PivotRow[] = [];
    store.forEach((record : TimesheetRowModel) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const flat = (record as any).data as FlatPivotRecord;
        if (flat.type !== 'total') {
            currentRows.push(flatToPivotRow(flat));
        }
    });

    // Enforce time rounding before diffing (Gap 7 — MINIMUMTIME enforcement)
    const settings = getTimesheetSettings();
    const increment = settings.minIncrement;
    if (increment > 0) {
        for (const row of currentRows) {
            for (let d = 0; d < 7; d++) {
                const entry = row.entries[d]!;
                if (entry.time > 0) {
                    entry.time = roundToIncrement(entry.time, increment);
                }
            }
        }
    }

    const changes = diffPivotRows(originalPivotRows, currentRows);
    if (!changes.hasChanges) {
        console.log('[timesheetView] No changes to save');
        return;
    }

    showLoadingMask(true);
    let savedCount = 0;

    try {
        const weekDays = getWeekDaysFromStart(currentWeekStart);

        // Process day-cell changes
        for (const change of changes.dayChanges) {
            const dayDate = weekDays[change.dayOffset]!;

            if (change.entryId && change.newTime === 0) {
                // Delete the time entry
                await deleteTimeEntry(change.entryId);
                savedCount++;
            }
            else if (change.entryId) {
                // Update existing
                await updateTimeEntry(change.entryId, {
                    msdyn_duration    : Math.round(change.newTime * 60),
                    msdyn_description : change.newComment || undefined
                });
                savedCount++;
            }
            else if (change.newTime > 0) {
                // Create new
                const payload = buildCreatePayload(
                    currentResourceId!,
                    dayDate,
                    change.newTime,
                    {
                        description        : change.newComment || undefined,
                        projectId          : change.projectId || undefined,
                        taskId             : change.taskId || undefined,
                        resourceCategoryId : defaultRoleId || undefined
                    }
                );
                await createTimeEntry(payload);
                savedCount++;
            }
        }

        // Process variation changes
        for (const change of changes.variationChanges) {
            if (change.entryId && change.newTime === 0) {
                await deleteVariation(change.entryId);
                savedCount++;
            }
            else if (change.entryId) {
                await updateVariation(change.entryId, {
                    ws_remainingtime         : Math.round(change.newTime * 60),  // hours → minutes
                    ws_comment               : change.newComment || undefined,
                    'ws_ReasonId@odata.bind' : change.reasonId
                        ? `/ws_timesheetvariationreasons(${change.reasonId})`
                        : undefined
                });
                savedCount++;
            }
            else if (change.newTime > 0) {
                // Variation binds to task + project + resource (not time entry)
                const row = currentRows.find((r) => r.id === change.rowId);
                if (row && row.projectId && currentResourceId) {
                    await createVariation({
                        ws_remainingtime           : Math.round(change.newTime * 60),  // hours → minutes
                        ws_comment                 : change.newComment || undefined,
                        'ws_TaskId@odata.bind'     : `/msdyn_projecttasks(${row.taskId})`,
                        'ws_ProjectId@odata.bind'  : `/msdyn_projects(${row.projectId})`,
                        'ws_ResourceId@odata.bind' : `/bookableresources(${currentResourceId})`,
                        'ws_ReasonId@odata.bind'   : change.reasonId
                            ? `/ws_timesheetvariationreasons(${change.reasonId})`
                            : undefined
                    });
                    savedCount++;
                }
            }
        }

        console.log(`[timesheetView] Saved ${savedCount} changes`);
        if (savedCount > 0) {
            showSuccessToast(`Saved ${savedCount} change${savedCount !== 1 ? 's' : ''}.`);
        }

        // Reload data to get fresh IDs and statuses
        await loadWeekData();
    }
    catch (err) {
        console.error('[timesheetView] Save failed:', err);
        showErrorToast(`Save failed: ${(err as Error).message}`);
    }
    finally {
        showLoadingMask(false);
    }
}

// ── Submit ──────────────────────────────────────────────────────────

async function handleSubmit() : Promise<void> {
    if (!grid || !currentResourceId) return;

    // Count submittable entries
    const draftCount = loadedTimeEntries.filter(
        (e) => e.status === TimeEntryStatus.Draft || e.status === TimeEntryStatus.Returned
    ).length;

    if (draftCount === 0) {
        showInfoToast('No draft entries to submit.');
        return;
    }

    // Confirmation dialog
    const confirmed = await showConfirmDialog(
        'Submit Timesheet',
        `Submit ${draftCount} time entr${draftCount !== 1 ? 'ies' : 'y'} for approval?`
    );
    if (!confirmed) return;

    // Save any pending changes first
    await handleSave();

    // Enforce variation requirement before submission
    const settings = getTimesheetSettings();
    if (settings.enforceAllVariations) {
        const rowsMissingVariation = currentPivotRows.filter((r) => {
            if (r.type !== 'stdentry') return false;
            const rowTotal = r.entries.reduce((sum, e) => sum + e.time, 0);
            return rowTotal > 0 && r.variation.time === 0 && !r.variation.entryId;
        });

        if (rowsMissingVariation.length > 0) {
            const names = rowsMissingVariation.map((r) => r.projectName).join(', ');
            showErrorToast(`Variation required for: ${names}. Please add a variation before submitting.`);
            return;
        }
    }

    showLoadingMask(true);

    try {
        // Re-filter after save (IDs may have changed)
        const draftIds = loadedTimeEntries
            .filter((e) => e.status === TimeEntryStatus.Draft || e.status === TimeEntryStatus.Returned)
            .map((e) => e.id);

        if (draftIds.length === 0) {
            showInfoToast('No draft entries to submit after save.');
            return;
        }

        // Submit via action
        await submitTimeEntries(draftIds);

        // Submit linked variations (PATCH statuscode → 100000001)
        // Variations bind to resource, not entries — submit all active variations for this resource
        const variations = currentResourceId ? await getVariations(currentResourceId) : [];
        const variationIds = variations
            .filter((v) => v.statuscode === 1)
            .map((v) => v.ws_timesheetvariationid);

        if (variationIds.length > 0) {
            await submitVariations(variationIds);
            console.log(`[timesheetView] Submitted ${variationIds.length} variation(s)`);
        }

        // Ensure user timesheet record exists
        const weekStr = toISODateString(currentWeekStart);
        if (!currentUserTimesheet) {
            const identity = await resolveIdentity();

            // Compute ws_enddate: today if within the same week, Sunday otherwise
            const today = new Date();
            const weekEnd = getWeekEnd(currentWeekStart);
            const endDate = today <= weekEnd ? toISODateString(today) : toISODateString(weekEnd);

            currentUserTimesheet = await createUserTimesheet(
                currentResourceId!,
                weekStr,
                `${identity.userFullName} — ${weekStr}`,
                endDate
            );
        }

        // Check if submit-and-complete is enabled
        const settings = getTimesheetSettings();
        if (settings.submitAndComplete && currentUserTimesheet) {
            await completeUserTimesheet(currentUserTimesheet.ws_usertimesheetid);
        }

        console.log(`[timesheetView] Submitted ${draftIds.length} entries`);
        showSuccessToast(`Submitted ${draftIds.length} time entr${draftIds.length !== 1 ? 'ies' : 'y'}.`);

        // Reload to reflect new statuses
        await loadWeekData();
    }
    catch (err) {
        console.error('[timesheetView] Submit failed:', err);
        showErrorToast(`Submit failed: ${(err as Error).message}`);
    }
    finally {
        showLoadingMask(false);
    }
}

// ── Recall ──────────────────────────────────────────────────────────

async function handleRecall() : Promise<void> {
    if (!currentUserTimesheet) return;

    // Confirmation dialog
    const confirmed = await showConfirmDialog(
        'Recall Timesheet',
        'Recall this submitted timesheet? It will return to Draft status for editing.'
    );
    if (!confirmed) return;

    showLoadingMask(true);

    try {
        await recallUserTimesheet(currentUserTimesheet.ws_usertimesheetid);
        console.log('[timesheetView] Timesheet recalled');
        showSuccessToast('Timesheet recalled — you can now edit entries.');

        // Reload
        await loadWeekData();
    }
    catch (err) {
        console.error('[timesheetView] Recall failed:', err);
        showErrorToast(`Recall failed: ${(err as Error).message}`);
    }
    finally {
        showLoadingMask(false);
    }
}

// ── Grid helpers ────────────────────────────────────────────────────

function showLoadingMask(show : boolean) : void {
    if (!grid) return;
    if (show) {
        grid.maskBody('Loading…');
    }
    else {
        grid.unmaskBody();
    }
}

// ── UI helpers ──────────────────────────────────────────────────────

function showSuccessToast(message : string) : void {
    Toast.show({
        html    : `<i class="fa fa-check-circle"></i> ${escapeHtml(message)}`,
        cls     : 'ts-toast ts-toast-success',
        timeout : 3000
    });
}

function showInfoToast(message : string) : void {
    Toast.show({
        html    : `<i class="fa fa-info-circle"></i> ${escapeHtml(message)}`,
        cls     : 'ts-toast ts-toast-info',
        timeout : 3000
    });
}

function showErrorToast(message : string) : void {
    console.error('[timesheetView]', message);
    Toast.show({
        html    : `<i class="fa fa-exclamation-triangle"></i> ${escapeHtml(message)}`,
        cls     : 'ts-toast ts-toast-error',
        timeout : 5000
    });
}

/**
 * Show a confirmation dialog using a Bryntum Popup.
 * Returns `true` if the user confirmed, `false` otherwise.
 */
function showConfirmDialog(title : string, message : string) : Promise<boolean> {
    return new Promise((resolve) => {
        const popup = new Popup({
            header   : title,
            cls      : 'ts-confirm-dialog',
            width    : 380,
            centered : true,
            modal    : true,
            closable : true,
            html     : `<p style="margin:0;padding:8px 0">${escapeHtml(message)}</p>`,
            bbar     : {
                items : {
                    cancelBtn : {
                        type : 'button',
                        text : 'Cancel',
                        cls  : 'b-transparent',
                        onClick() {
                            popup.close();
                            resolve(false);
                        }
                    },
                    confirmBtn : {
                        type : 'button',
                        text : 'Confirm',
                        cls  : 'b-raised b-blue',
                        onClick() {
                            popup.close();
                            resolve(true);
                        }
                    }
                }
            },
            onClose() {
                resolve(false);
            }
        });
        popup.show();
    });
}

// ── Date helpers ────────────────────────────────────────────────────

function getWeekDaysFromStart(weekStart : Date) : Date[] {
    return Array.from({ length : 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        return d;
    });
}

// ── Auto-save ───────────────────────────────────────────────────────

/**
 * Schedule an auto-save after the debounce delay.
 * Resets the timer on each call so rapid edits are batched.
 */
function scheduleAutoSave() : void {
    if (!autoSaveEnabled) return;

    cancelAutoSave();
    autoSaveTimer = setTimeout(() => {
        autoSaveTimer = null;
        handleSave().catch((err) =>
            console.error('[timesheetView] Auto-save failed:', err)
        );
    }, AUTO_SAVE_DELAY_MS);
}

/**
 * Cancel a pending auto-save (e.g. before manual save or navigation).
 */
function cancelAutoSave() : void {
    if (autoSaveTimer != null) {
        clearTimeout(autoSaveTimer);
        autoSaveTimer = null;
    }
}

/**
 * Enable or disable auto-save. When disabling, cancels any pending save.
 */
export function setAutoSaveEnabled(enabled : boolean) : void {
    autoSaveEnabled = enabled;
    if (!enabled) cancelAutoSave();
}

// ── Destroy ─────────────────────────────────────────────────────────

/**
 * Destroy the grid and reset state. Used for cleanup / testing.
 */
export function destroyTimesheetView() : void {
    cancelAutoSave();
    if (filterTimer != null) {
        clearTimeout(filterTimer);
        filterTimer = null;
    }
    destroyVariationDialog();
    destroyProjectPicker();
    resetProjectPickerCache();
    clearImpersonation();
    if (grid) {
        grid.destroy();
        grid = null;
    }
    initialised = false;
    originalPivotRows = [];
    currentPivotRows = [];
    currentResourceId = null;
    currentUserTimesheet = null;
    loadedTimeEntries = [];
    loading = false;
}
