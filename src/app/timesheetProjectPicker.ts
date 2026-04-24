/**
 * Project / Task Picker Dialog.
 *
 * A Bryntum Popup with two modes:
 *  1. **Project row** — pick a project + (optional) task to add a
 *     new time-entry row to the grid.
 *  2. **Help task** — request work on a project the resource is
 *     not assigned to (creates a ws_projecthelptasks record).
 *
 * Cascading Combos:
 *  - Project Combo: loaded from `getResourceProjects()`
 *  - Task Combo: populated when a project is selected via
 *    `getProjectTasks()` — cleared on project change
 *
 * Already-used project/task combinations are filtered out of the
 * available options so the user cannot add duplicates.
 *
 * The dialog resolves a Promise with the selected row data (or null
 * if cancelled) — the view orchestrator inserts the row.
 */

import {
    Popup
} from '@bryntum/schedulerpro';
import {
    getResourceProjects,
    getProjectTasks,
    getHelpTaskReasons
} from './timesheetDataService';
import type {
    D365Project,
    D365ProjectTask,
    D365HelpTaskReason
} from '../types/timesheet';

// ── Cached reference data ───────────────────────────────────────────

let cachedProjects : D365Project[] | null = null;
const cachedTasksByProject : Map<string, D365ProjectTask[]> = new Map();
let cachedHelpReasons : D365HelpTaskReason[] | null = null;

// ── Dialog state ────────────────────────────────────────────────────

let popup : Popup | null = null;

// ── Result types ────────────────────────────────────────────────────

export interface ProjectPickerResult {
    mode      : 'project';
    project   : D365Project;
    task      : D365ProjectTask | null;
}

export interface HelpTaskPickerResult {
    mode      : 'helptask';
    project   : D365Project;
    hours     : number;
    startDate : string;
    endDate   : string;
    reason    : string | null;
    comment   : string;
}

export type PickerResult = ProjectPickerResult | HelpTaskPickerResult | null;

// ── Public API ──────────────────────────────────────────────────────

/**
 * Open the project picker dialog and return the user's selection.
 *
 * @param resourceId       Current resource ID (for project/task loading).
 * @param existingRowKeys  Set of already-used `projectId` or `projectId::taskId` keys.
 * @param weekStart        Monday of the current week (used for help task dates).
 */
export function openProjectPicker(
    resourceId      : string,
    existingRowKeys : Set<string>,
    weekStart       : Date
) : Promise<PickerResult> {
    return new Promise((resolve) => {
        // Destroy any existing dialog
        destroyProjectPicker();

        let currentMode : 'project' | 'helptask' = 'project';

        // ── Build Popup ─────────────────────────────────────────

        popup = new Popup({
            header   : 'Add Row',
            cls      : 'ts-project-picker',
            width    : 440,
            centered : true,
            modal    : true,
            closable : true,
            autoShow : false,
            items    : {
                // ── Mode toggle ─────────────────────────────────
                modeToggle : {
                    type  : 'container',
                    ref   : 'modeToggle',
                    cls   : 'ts-picker-mode-toggle',
                    items : [
                        {
                            type : 'button',
                            ref  : 'projectModeBtn',
                            text : 'Project Row',
                            cls  : 'b-raised b-blue',
                            onClick() {
                                switchMode('project');
                            }
                        },
                        {
                            type : 'button',
                            ref  : 'helpModeBtn',
                            text : 'Help Task',
                            cls  : 'b-transparent',
                            onClick() {
                                switchMode('helptask');
                            }
                        }
                    ]
                },

                // ── Project Row fields ──────────────────────────
                projectCombo : {
                    type         : 'combo',
                    ref          : 'projectCombo',
                    label        : 'Project',
                    placeholder  : 'Select a project…',
                    editable     : true,
                    clearable    : true,
                    displayField : 'label',
                    valueField   : 'value',
                    items        : [],
                    listItemTpl  : (item : { label : string; code? : string }) =>
                        item.code
                            ? `<span class="ts-picker-item">${item.label} <small class="ts-picker-code">${item.code}</small></span>`
                            : `<span class="ts-picker-item">${item.label}</span>`
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } as any,

                taskCombo : {
                    type         : 'combo',
                    ref          : 'taskCombo',
                    label        : 'Task',
                    placeholder  : 'Select a task (optional)…',
                    editable     : true,
                    clearable    : true,
                    displayField : 'label',
                    valueField   : 'value',
                    items        : [],
                    disabled     : true,
                    listItemTpl  : (item : { label : string; code? : string }) =>
                        item.code
                            ? `<span class="ts-picker-item">${item.label} <small class="ts-picker-code">${item.code}</small></span>`
                            : `<span class="ts-picker-item">${item.label}</span>`
                } as object,

                // ── Help Task fields (hidden by default) ────────
                helpHoursField : {
                    type   : 'numberfield',
                    ref    : 'helpHoursField',
                    label  : 'Hours',
                    min    : 0.25,
                    max    : 999,
                    step   : 0.25,
                    value  : 8,
                    hidden : true
                },

                helpStartField : {
                    type   : 'datefield',
                    ref    : 'helpStartField',
                    label  : 'Start Date',
                    value  : weekStart,
                    hidden : true
                },

                helpEndField : {
                    type   : 'datefield',
                    ref    : 'helpEndField',
                    label  : 'End Date',
                    value  : new Date(weekStart.getTime() + 6 * 86400000),
                    hidden : true
                },

                helpReasonCombo : {
                    type         : 'combo',
                    ref          : 'helpReasonCombo',
                    label        : 'Reason',
                    placeholder  : 'Select a reason…',
                    editable     : true,
                    clearable    : true,
                    displayField : 'label',
                    valueField   : 'value',
                    items        : [],
                    hidden       : true
                } as object,

                helpCommentField : {
                    type        : 'textareafield',
                    ref         : 'helpCommentField',
                    label       : 'Comment',
                    placeholder : 'Describe the help needed…',
                    height      : 60,
                    hidden      : true
                }
            },
            bbar : {
                items : {
                    cancelBtn : {
                        type : 'button',
                        text : 'Cancel',
                        cls  : 'b-transparent',
                        onClick() {
                            popup?.close();
                            resolve(null);
                        }
                    },
                    addBtn : {
                        type     : 'button',
                        ref      : 'addBtn',
                        text     : 'Add Row',
                        cls      : 'b-raised b-blue',
                        disabled : true,
                        onClick() {
                            const result = buildResult(currentMode, weekStart);
                            popup?.close();
                            resolve(result);
                        }
                    }
                }
            },
            listeners : {
                close() {
                    resolve(null);
                }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any
        });

        // Wire projectCombo change handler (separate from config to avoid ESLint key-spacing issues with method shorthands)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (popup as any).widgetMap.projectCombo.on('change', ({ value } : { value : string | null }) => {
            onProjectChange(value, resourceId, existingRowKeys);
        });

        // ── Mode switching ──────────────────────────────────────

        function switchMode(mode : 'project' | 'helptask') {
            currentMode = mode;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const wm = (popup as any).widgetMap;

            const isProject = mode === 'project';

            // Toggle button styles
            wm.projectModeBtn.cls = isProject ? 'b-raised b-blue' : 'b-transparent';
            wm.helpModeBtn.cls    = isProject ? 'b-transparent' : 'b-raised b-blue';

            // Toggle field visibility — project fields
            wm.taskCombo.hidden = !isProject;

            // Toggle field visibility — help task fields
            wm.helpHoursField.hidden   = isProject;
            wm.helpStartField.hidden   = isProject;
            wm.helpEndField.hidden     = isProject;
            wm.helpReasonCombo.hidden  = isProject;
            wm.helpCommentField.hidden = isProject;

            // Update add button text
            wm.addBtn.text = isProject ? 'Add Row' : 'Create Help Task';

            // Load help task reasons if switching to help mode
            if (!isProject) {
                loadHelpReasons();
            }

            validateForm();
        }

        // Load projects on open
        loadProjectItems(resourceId, existingRowKeys);

        popup.show();
    });
}

/**
 * Destroy the picker dialog (cleanup).
 */
export function destroyProjectPicker() : void {
    if (popup) {
        popup.destroy();
        popup = null;
    }
}

/**
 * Reset cached project/task data (e.g. on view destroy, resource change).
 */
export function resetProjectPickerCache() : void {
    cachedProjects = null;
    cachedTasksByProject.clear();
    cachedHelpReasons = null;
}

// ── Internal helpers ────────────────────────────────────────────────

/**
 * Load project Combo items, caching the raw D365 records.
 */
async function loadProjectItems(
    resourceId      : string,
    _existingRowKeys : Set<string>
) : Promise<void> {
    if (!popup) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wm = (popup as any).widgetMap;

    try {
        if (!cachedProjects) {
            cachedProjects = await getResourceProjects(resourceId);
        }

        // Build combo items — mark already-fully-used projects as disabled
        const items = cachedProjects.map((p) => ({
            value : p.msdyn_projectid,
            label : p.msdyn_subject,
            code  : p.ws_projectid ?? ''
        }));

        wm.projectCombo.items = items;
    }
    catch (err) {
        console.error('[projectPicker] Failed to load projects:', err);
    }
}

/**
 * Called when a project is selected – loads tasks for the project.
 */
async function onProjectChange(
    projectId       : string | null,
    resourceId      : string,
    existingRowKeys : Set<string>
) : Promise<void> {
    if (!popup) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wm = (popup as any).widgetMap;

    // Reset task combo
    wm.taskCombo.value = null;
    wm.taskCombo.items = [];
    wm.taskCombo.disabled = true;

    validateForm();

    if (!projectId) return;

    try {
        let tasks = cachedTasksByProject.get(projectId);
        if (!tasks) {
            tasks = await getProjectTasks(projectId, resourceId);
            cachedTasksByProject.set(projectId, tasks);
        }

        // Filter out tasks already in the timesheet
        const available = tasks.filter((t) => {
            const key = `${projectId}::${t.msdyn_projecttaskid}`;
            return !existingRowKeys.has(key);
        });

        if (available.length > 0) {
            wm.taskCombo.items = available.map((t) => ({
                value : t.msdyn_projecttaskid,
                label : t.msdyn_subject,
                code  : t.ws_projecttasknumber ?? ''
            }));
            wm.taskCombo.disabled = false;
        }
    }
    catch (err) {
        console.error('[projectPicker] Failed to load tasks:', err);
    }

    validateForm();
}

/**
 * Load help task reasons into the reason Combo.
 */
async function loadHelpReasons() : Promise<void> {
    if (!popup) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wm = (popup as any).widgetMap;

    try {
        if (!cachedHelpReasons) {
            cachedHelpReasons = await getHelpTaskReasons();
        }
        wm.helpReasonCombo.items = cachedHelpReasons.map((r) => ({
            value : r.ws_projecthelptaskreasonsid,
            label : r.ws_name
        }));
    }
    catch (err) {
        console.error('[projectPicker] Failed to load help task reasons:', err);
    }
}

/**
 * Enable / disable the Add button based on form validity.
 */
function validateForm() : void {
    if (!popup) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wm = (popup as any).widgetMap;

    const hasProject = !!wm.projectCombo.value;
    wm.addBtn.disabled = !hasProject;
}

/**
 * Build the result object from current form state.
 */
function buildResult(
    mode      : 'project' | 'helptask',
    weekStart : Date
) : PickerResult {
    if (!popup) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wm = (popup as any).widgetMap;

    const projectId = wm.projectCombo.value as string | null;
    if (!projectId || !cachedProjects) return null;

    const project = cachedProjects.find((p) => p.msdyn_projectid === projectId);
    if (!project) return null;

    if (mode === 'project') {
        const taskId = wm.taskCombo.value as string | null;
        let task : D365ProjectTask | null = null;
        if (taskId) {
            const tasks = cachedTasksByProject.get(projectId);
            task = tasks?.find((t) => t.msdyn_projecttaskid === taskId) ?? null;
        }
        return { mode : 'project', project, task };
    }

    // Help task mode
    const hours     = (wm.helpHoursField.value as number) ?? 8;
    const startDate = wm.helpStartField.value
        ? toISO(wm.helpStartField.value as Date)
        : toISO(weekStart);
    const endDate   = wm.helpEndField.value
        ? toISO(wm.helpEndField.value as Date)
        : toISO(new Date(weekStart.getTime() + 6 * 86400000));
    const reason    = wm.helpReasonCombo.value as string | null;
    const comment   = (wm.helpCommentField.value as string) ?? '';

    return {
        mode : 'helptask',
        project,
        hours,
        startDate,
        endDate,
        reason,
        comment
    };
}

/** Format a Date to YYYY-MM-DD. */
function toISO(d : Date) : string {
    return d.toISOString().split('T')[0]!;
}
