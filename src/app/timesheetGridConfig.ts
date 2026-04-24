/**
 * Bryntum Grid configuration for the timesheet pivot view.
 *
 * Configures:
 * - Locked left columns (Project, Task)
 * - Day columns (Mon–Sun) with inline CellEdit
 * - Variation/Remaining column
 * - Total column
 * - Toolbar with week navigation, save, submit, etc.
 */

import { DateHelper } from '@bryntum/schedulerpro';
import { DAY_COUNT, type FlatPivotRecord } from '../lib/timesheetPivotUtils';

// ── Day header helpers ──────────────────────────────────────────────

/** Short day names for column headers (Mon → Sun). */
const SHORT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/**
 * Build the full header text for a day column.
 * e.g. "Mon\n09 Jun"
 */
function dayHeaderText(dayIndex : number, weekStart : Date) : string {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + dayIndex);
    const formatted = DateHelper.format(date, 'DD MMM');
    return `${SHORT_DAYS[dayIndex]}\n${formatted}`;
}

// ── Cell renderers ──────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Render a day cell — shows hours (or blank if zero).
 * Applies read-only and status styling.
 */
function dayCellRenderer({ value, record, column } : any) : string {
    const dayIndex = column.dayIndex as number;
    const isTotal  = record.type === 'total';
    const readOnly = record.get(`day${dayIndex}ReadOnly`);
    const hours    = value as number ?? 0;
    const comment  = (record.get(`day${dayIndex}Comment`) as string) ?? '';

    const cls : string[] = ['ts-day-cell'];
    if (isTotal) cls.push('ts-total-row');
    if (readOnly) cls.push('ts-readonly');
    if (hours > 0) cls.push('ts-has-value');

    const display = hours > 0 ? hours.toString() : '';

    // Triangle indicators: red = missing comment, green = has comment (clickable)
    let indicator = '';
    if (hours > 0 && !isTotal) {
        if (comment) {
            indicator = `<span class="ts-comment-triangle ts-comment-present" data-day="${dayIndex}" title="${comment.replace(/"/g, '&quot;')}"></span>`;
        }
        else {
            indicator = '<span class="ts-comment-triangle ts-comment-missing" title="Description required"></span>';
        }
    }
    return `<div class="${cls.join(' ')}">${display}${indicator}</div>`;
}

/**
 * Render the project column.
 */
function projectRenderer({ record } : any) : string {
    if (record.type === 'total') {
        return '<strong>Total</strong>';
    }
    return record.projectName ?? '';
}

/**
 * Render the task column.
 */
function taskRenderer({ record } : any) : string {
    if (record.type === 'total') return '';
    return record.taskName ?? '';
}

/**
 * Render the row total column.
 */
function totalRenderer({ value } : any) : string {
    const hours = (value as number) ?? 0;
    return hours > 0 ? `<strong>${hours}</strong>` : '';
}

/**
 * Render the variation/remaining column.
 * Shows a clickable cell for stdentry rows with an edit indicator.
 */
function variationRenderer({ record } : any) : string {
    if (record.type !== 'stdentry') return '';
    const hours = record.variationTime as number ?? 0;
    const display = hours > 0 ? hours.toString() : '—';
    return `<div class="ts-variation-cell" title="Click to edit variation">${display} <i class="fa fa-pencil ts-variation-icon"></i></div>`;
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// ── Column definitions ──────────────────────────────────────────────

/**
 * Build all Grid columns for a given week start date.
 */
export function buildTimesheetColumns(weekStart : Date) : object[] {
    const columns : object[] = [
        // Frozen left columns
        {
            text     : 'Project',
            field    : 'projectName',
            width    : 300,
            locked   : true,
            readOnly : true,
            renderer : projectRenderer
        },
        {
            text     : 'Task',
            field    : 'taskName',
            width    : 400,
            locked   : true,
            readOnly : true,
            renderer : taskRenderer
        }
    ];

    // Day columns (Mon–Sun)
    for (let d = 0; d < DAY_COUNT; d++) {
        const isWeekend = d >= 5; // Sat = 5, Sun = 6
        columns.push({
            text       : dayHeaderText(d, weekStart),
            field      : `day${d}`,
            width      : 80,
            align      : 'center',
            type       : 'number',
            dayIndex   : d,
            renderer   : dayCellRenderer,
            htmlEncode : false,
            editor     : {
                type     : 'numberfield',
                min      : 0,
                max      : 24,
                step     : 0.25,
                triggers : { spin : null }
            },
            cls : isWeekend ? 'ts-weekend-col' : ''
        });
    }

    // Total column
    columns.push({
        text       : 'Total',
        field      : 'rowTotal',
        width      : 80,
        align      : 'center',
        readOnly   : true,
        renderer   : totalRenderer,
        htmlEncode : false
    });

    // Variation / Remaining column — opens dialog on click, no inline editor
    columns.push({
        text       : 'Remaining',
        field      : 'variationTime',
        width      : 100,
        align      : 'center',
        renderer   : variationRenderer,
        htmlEncode : false,
        readOnly   : true,
        editor     : false
    });

    return columns;
}

// ── Toolbar config ──────────────────────────────────────────────────

/**
 * Build the timesheet toolbar configuration.
 * Event handlers are wired externally by the view orchestrator.
 */
export function buildTimesheetToolbar() : object {
    return {
        type  : 'toolbar',
        cls   : 'ts-toolbar',
        items : {
            backButton : {
                type    : 'button',
                ref     : 'backButton',
                icon    : 'fa fa-arrow-left',
                tooltip : 'Back to Planner',
                cls     : 'b-transparent'
            },
            weekLabel : {
                type : 'widget',
                ref  : 'weekLabel',
                cls  : 'ts-week-label',
                html : ''
            },
            prevWeekButton : {
                type    : 'button',
                ref     : 'prevWeekButton',
                icon    : 'fa fa-chevron-left',
                tooltip : 'Previous week',
                cls     : 'b-transparent'
            },
            todayButton : {
                type    : 'button',
                ref     : 'todayButton',
                text    : 'Today',
                tooltip : 'Go to current week',
                cls     : 'b-transparent'
            },
            nextWeekButton : {
                type    : 'button',
                ref     : 'nextWeekButton',
                icon    : 'fa fa-chevron-right',
                tooltip : 'Next week',
                cls     : 'b-transparent'
            },
            statusIndicator : {
                type : 'widget',
                ref  : 'statusIndicator',
                cls  : 'ts-status-indicator',
                html : ''
            },
            approverComments : {
                type   : 'widget',
                ref    : 'approverComments',
                cls    : 'ts-approver-comments',
                html   : '',
                hidden : true
            },
            resourceCombo : {
                type         : 'combo',
                ref          : 'resourceCombo',
                cls          : 'ts-resource-combo',
                placeholder  : 'Select resource…',
                editable     : true,
                clearable    : false,
                displayField : 'label',
                valueField   : 'value',
                items        : [],
                hidden       : true,
                listItemTpl  : (item : { label : string }) =>
                    `<span class="ts-resource-item">${item.label}</span>`
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any,
            impersonationBanner : {
                type   : 'widget',
                ref    : 'impersonationBanner',
                cls    : 'ts-impersonation-banner',
                html   : '',
                hidden : true
            },
            spacer1     : { type : 'widget', flex : 1 },
            filterField : {
                type        : 'textfield',
                ref         : 'filterField',
                cls         : 'ts-filter-field',
                placeholder : 'Filter by project or task…',
                clearable   : true,
                width       : 220,
                triggers    : {
                    search : {
                        cls   : 'fa fa-search',
                        align : 'start'
                    }
                }
            },
            filterPreset : {
                type         : 'combo',
                ref          : 'filterPreset',
                cls          : 'ts-filter-preset',
                placeholder  : 'Filter preset…',
                editable     : false,
                clearable    : true,
                width        : 170,
                displayField : 'text',
                valueField   : 'id',
                items        : [
                    { id : 'myTasks',       text : 'My Tasks' },
                    { id : 'withTime',      text : 'Tasks with Time' },
                    { id : 'hideCompleted', text : 'Hide Completed' },
                    { id : 'internal',      text : 'WS Internal' },
                    { id : 'helpTasks',     text : 'Help Tasks' }
                ]
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any,
            entryCountLabel : {
                type : 'widget',
                ref  : 'entryCountLabel',
                cls  : 'ts-entry-count',
                html : ''
            },
            addRowButton : {
                type    : 'button',
                ref     : 'addRowButton',
                icon    : 'fa fa-plus',
                text    : 'Add Row',
                tooltip : 'Add a new time entry row',
                cls     : 'b-transparent'
            },
            saveButton : {
                type    : 'button',
                ref     : 'saveButton',
                icon    : 'fa fa-save',
                text    : 'Save',
                tooltip : 'Save changes',
                cls     : 'b-raised'
            },
            submitButton : {
                type    : 'button',
                ref     : 'submitButton',
                icon    : 'fa fa-paper-plane',
                text    : 'Submit',
                tooltip : 'Submit timesheet for approval',
                cls     : 'b-raised'
            },
            recallButton : {
                type    : 'button',
                ref     : 'recallButton',
                icon    : 'fa fa-undo',
                text    : 'Recall',
                tooltip : 'Recall submitted timesheet',
                cls     : 'b-transparent',
                hidden  : true
            }
        }
    };
}

// ── Grid config factory ─────────────────────────────────────────────

/**
 * Build the complete Bryntum Grid config object.
 *
 * @param weekStart  Monday of the week to display.
 * @param data       Flattened pivot records to populate the store.
 */
export function buildTimesheetGridConfig(
    weekStart : Date,
    data      : FlatPivotRecord[] = []
) : object {
    return {
        appendTo   : 'timesheet-view',
        cls        : 'ts-grid',
        autoHeight : false,
        flex       : 1,

        // Store
        store : {
            modelClass : 'TimesheetRowModel',
            data
        },

        // Columns
        columns : buildTimesheetColumns(weekStart),

        // Features
        features : {
            cellEdit : {
                addNewAtEnd : false
            },
            stripe     : true,
            sort       : false,
            group      : false,
            cellMenu   : false,
            headerMenu : false
        },

        // Toolbar
        tbar : buildTimesheetToolbar(),

        // Row class assignment based on record type / status
        getRowClass({ record } : { record : { type? : string; dirty? : boolean; get? : (f : string) => unknown } }) : string {
            const classes : string[] = [];

            // Totals row
            if (record.type === 'total') {
                classes.push('ts-row-totals');
            }

            // Help task row
            if (record.type === 'helptask') {
                classes.push('ts-row-helptask');
            }

            // Dirty (unsaved) row
            if (record.dirty || (typeof record.get === 'function' && record.get('dirty'))) {
                classes.push('ts-row-dirty');
            }

            return classes.join(' ');
        },

        // Custom listeners wired externally
        selectionMode : {
            row  : false,
            cell : true
        }
    };
}

/**
 * Format the week label for the toolbar.
 * e.g. "09 Jun – 15 Jun 2025"
 */
export function formatWeekLabel(weekStart : Date) : string {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const startStr = DateHelper.format(weekStart, 'DD MMM');
    const endStr   = DateHelper.format(weekEnd, 'DD MMM YYYY');

    return `${startStr} – ${endStr}`;
}
