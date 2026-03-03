import { signOut } from './auth';
import type { ViewMode } from '../types/app';

const today = new Date();

/**
 * Map friendly view-mode names (day / week / month) to Bryntum view-preset ids.
 */
export const VIEW_MODE_PRESETS = {
    day   : 'weekAndDayLetter',
    week  : 'weekAndMonth',
    month : 'monthAndYear'
} as const satisfies Record<ViewMode, string>;

/** Resolve the configured default view-mode to a Bryntum preset id. */
export const DEFAULT_VIEW_PRESET: string =
    VIEW_MODE_PRESETS[(import.meta.env.VITE_DEFAULT_VIEW_MODE || 'day').toLowerCase() as ViewMode] || 'weekAndDayLetter';

// How many days beyond the visible scheduler viewport to pre-fetch assignments.
// Increase for smoother scrolling (fewer mid-scroll fetches); decrease to reduce payload.
export const VIEWPORT_BUFFER_DAYS: number = Number(import.meta.env.VITE_VIEWPORT_BUFFER_DAYS) || 28;

// Shared project color palette
export const PROJECT_COLORS = [
    '#4991E5', '#E5A449', '#7BC86C', '#CD5A91', '#A37EDE',
    '#29CCB1', '#F87171', '#FBBF24', '#6EE7B7', '#93C5FD',
    '#C084FC', '#FB923C', '#5EEAD4', '#FCA5A5', '#86EFAC'
] as const;

interface NameRendererArg {
    record: { name?: string; imageUrl?: string };
}

/**
 * Renders the name cell for leaf resource rows (actual resources).
 * Generated TreeGroup parents use parentRenderer instead.
 */
export function nameRenderer({ record }: NameRendererArg): string {
    const name     = record.name || '';
    const imageUrl = record.imageUrl;

    if (imageUrl) {
        return `<div style="display: flex; align-items: center; gap: 8px;">
            <img src="${imageUrl}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;" />
            <span>${name}</span>
        </div>`;
    }

    return `<span>${name}</span>`;
}

interface TreeGroupParentRendererArg {
    field: string;
    value: string;
}

/**
 * Renders the name cell for generated TreeGroup parent rows (Practice / Role).
 */
export function treeGroupParentRenderer({ field, value }: TreeGroupParentRendererArg): string {
    if (field === 'practiceName') {
        return `<div style="display: flex; align-items: center; gap: 8px;">
            <i class="fa fa-users" style="font-size: 16px; color: #666; width: 20px; text-align: center;"></i>
            <strong>${value}</strong>
        </div>`;
    }
    if (field === 'roleName') {
        return `<div style="display: flex; align-items: center; gap: 8px;">
            <i class="fa fa-briefcase" style="font-size: 14px; color: #888; width: 20px; text-align: center;"></i>
            <strong>${value}</strong>
        </div>`;
    }
    return `<strong>${value}</strong>`;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export const schedulerproConfig: Record<string, any> = {
    appendTo    : 'app',
    startDate   : new Date(today.getTime() - (today.getDay() || 7 - 1) * 24 * 60 * 60 * 1000), // Snap to Monday of the current week
    endDate     : new Date(today.getFullYear(), today.getMonth(), 1 + (12 * 12)),
    viewPreset  : DEFAULT_VIEW_PRESET,
    visibleDate : { date : new Date(), block : 'nearest' },
    barMargin   : 5,

    eventRenderer({ eventRecord, renderData }: { eventRecord: any; renderData: any }) {
        if (eventRecord.effortRemaining == null || eventRecord.effortRemaining === 0) {
            renderData.eventColor = 'gray';
            renderData.cls.add('b-inactive');
        }
        if (eventRecord.isRescheduledFromPast) {
            renderData.cls.add('b-rescheduled-from-past');
        }
        return eventRecord.name;
    },

    columns : [
        {
            type       : 'tree',
            text       : 'Name',
            field      : 'name',
            readOnly   : true,
            width      : 400,
            htmlEncode : false,
            renderer   : nameRenderer
        }
    ],
    readOnly : true,
    features : {
        dependencies : false,
        taskEdit     : true,
        tree         : true,
        timeRanges   : {
            showCurrentTimeLine : true
        },
        eventTooltip : {
            template({ eventRecord }: { eventRecord: any }) {
                const start  = eventRecord.startDate ? new Intl.DateTimeFormat('en-AU', { weekday : 'short', year : 'numeric', month : 'short', day : 'numeric' }).format(eventRecord.startDate) : '';
                const end    = eventRecord.endDate ? new Intl.DateTimeFormat('en-AU', { weekday : 'short', year : 'numeric', month : 'short', day : 'numeric' }).format(eventRecord.endDate) : '';
                const originalStart = eventRecord.originalStartDate ? new Intl.DateTimeFormat('en-AU', { weekday : 'short', year : 'numeric', month : 'short', day : 'numeric' }).format(eventRecord.originalStartDate) : '';
                const originalEnd = eventRecord.originalEndDate ? new Intl.DateTimeFormat('en-AU', { weekday : 'short', year : 'numeric', month : 'short', day : 'numeric' }).format(eventRecord.originalEndDate) : '';
                const effort      = eventRecord.effort != null ? `${eventRecord.effort} hrs` : '';
                const effortRemaining = eventRecord.effortRemaining;
                const clientName   = eventRecord.clientName || '';
                const projectName  = eventRecord.projectName || '';
                const projectNum   = eventRecord.projectNumber || '';
                const projectLabel = projectNum ? `${projectNum}: ${projectName}` : projectName;
                const taskNum      = eventRecord.taskNumber || '';
                const taskName     = eventRecord.name || '';
                const taskLabel    = taskNum ? `${taskNum}: ${taskName}` : taskName;
                return `<div class="b-sch-event-tooltip">
                    <div><strong>Client:</strong> ${clientName}</div>
                    <div><strong>Project:</strong> ${projectLabel}</div>
                    <div><strong>Task:</strong> ${taskLabel}</div>
                    <div style="margin-top: 8px; border-top: 1px solid #e5e5e5; padding-top: 8px;">
                    ${eventRecord.isRescheduledFromPast ? `
                    <div style="font-style: italic; color: #666;">
                        <div><strong>Originally Scheduled:</strong></div>
                        <div>${originalStart} → ${originalEnd}</div>
                    </div>
                    ` : ''}\
                    <div><strong>Scheduled:</strong></div>
                    <div>${start} → ${end}</div>
                    </div>
                    <div style="margin-top: 8px; border-top: 1px solid #e5e5e5; padding-top: 8px;">
                    <div><strong>Effort:</strong> ${effort}</div>
                    ${effortRemaining != null ? `<div><strong>Remaining:</strong> ${effortRemaining} hrs</div>` : ''}
                    </div>
                </div>`;
            }
        },
        treeGroup : {
            levels         : ['practiceName', 'roleName'],
            expandParents  : false,
            parentRenderer : treeGroupParentRenderer
        }
    },
    tbar : {
        type  : 'container',
        cls   : 'b-multi-row-toolbar',
        items : [
            {
                type  : 'toolbar',
                cls   : 'b-toolbar-row-1',
                items : {
                    refreshButton : {
                        type    : 'button',
                        ref     : 'refreshButton',
                        icon    : 'fa fa-sync',
                        tooltip : 'Refresh data',
                        cls     : 'b-transparent'
                    },
                    viewPresetGroup : {
                        type        : 'buttongroup',
                        ref         : 'viewPresetGroup',
                        toggleGroup : true,
                        cls         : 'b-zoom-presets',
                        items       : [
                            { text : 'Day',   ref : 'zoomDay',   toggleable : true, pressed : DEFAULT_VIEW_PRESET === 'weekAndDayLetter',  dataset : { preset : 'weekAndDayLetter' } },
                            { text : 'Week',  ref : 'zoomWeek',  toggleable : true, pressed : DEFAULT_VIEW_PRESET === 'weekAndMonth',      dataset : { preset : 'weekAndMonth' } },
                            { text : 'Month', ref : 'zoomMonth', toggleable : true, pressed : DEFAULT_VIEW_PRESET === 'monthAndYear',     dataset : { preset : 'monthAndYear' } }
                        ]
                    },
                    zoomOutButton : {
                        type    : 'button',
                        ref     : 'zoomOutButton',
                        icon    : 'fa fa-search-minus',
                        tooltip : 'Zoom out',
                        cls     : 'b-transparent'
                    },
                    zoomInButton : {
                        type    : 'button',
                        ref     : 'zoomInButton',
                        icon    : 'fa fa-search-plus',
                        tooltip : 'Zoom in',
                        cls     : 'b-transparent'
                    },
                    effortToggle : {
                        type          : 'slidetoggle',
                        ref           : 'effortToggle',
                        label         : 'Use Effort Remaining ',
                        labelPosition : 'before',
                        tooltip       : 'Toggle histogram between total effort and remaining effort',
                        checked       : false
                    },
                    allocationFilter : {
                        type        : 'combo',
                        ref         : 'allocationFilter',
                        label       : 'Allocation',
                        multiSelect : false,
                        editable    : false,
                        clearable   : false,
                        width       : 300,
                        placeholder : 'All allocations',
                        items       : [
                            { value : 'all', text : 'All' },
                            { value : 'over', text : 'Overallocated' },
                            { value : 'under', text : 'Underallocated' },
                            { value : 'balanced', text : 'Balanced' },
                            { value : 'mixed', text : 'Mixed' }
                        ],
                        value : 'all'
                    },
                    spacer1       : { type : 'widget', flex : 1 },
                    signoutButton : {
                        text : 'Signout',
                        icon : 'fa fa-sign-out',
                        onClick() {
                            signOut().then(() => {
                                location.reload();
                            });
                        }
                    }
                }
            },
            {
                type  : 'toolbar',
                cls   : 'b-toolbar-row-2',
                items : {
                    practiceFilter : {
                        type        : 'combo',
                        ref         : 'practiceFilter',
                        label       : 'Practice',
                        multiSelect : true,
                        editable    : false,
                        clearable   : true,
                        width       : 350,
                        placeholder : 'All Practices',
                        items       : [] as string[],
                        chipView    : { closable : true },
                        listItemTpl(record: { text: string }) {
                            return record.text;
                        }
                    },
                    roleFilter : {
                        type           : 'combo',
                        ref            : 'roleFilter',
                        label          : 'Role',
                        multiSelect    : true,
                        editable       : true,
                        clearable      : true,
                        width          : 350,
                        placeholder    : 'All Roles',
                        items          : [] as string[],
                        chipView       : { closable : true },
                        filterOperator : '*',
                        listItemTpl(record: { text: string }) {
                            return record.text;
                        }
                    },
                    resourceFilter : {
                        type           : 'combo',
                        ref            : 'resourceFilter',
                        label          : 'Resource',
                        multiSelect    : true,
                        editable       : true,
                        clearable      : true,
                        width          : 350,
                        placeholder    : 'All Resources',
                        items          : [] as string[],
                        chipView       : { closable : true },
                        filterOperator : '*',
                        listItemTpl(record: { text: string }) {
                            return record.text;
                        }
                    }
                }
            }
        ]
    }
};
/* eslint-enable @typescript-eslint/no-explicit-any */
