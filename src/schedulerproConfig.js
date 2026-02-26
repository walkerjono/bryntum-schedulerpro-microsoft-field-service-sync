import { signOut } from './auth.js';

const today = new Date();

// How many days beyond the visible scheduler viewport to pre-fetch assignments.
// Increase for smoother scrolling (fewer mid-scroll fetches); decrease to reduce payload.
export const VIEWPORT_BUFFER_DAYS = Number(import.meta.env.VITE_VIEWPORT_BUFFER_DAYS) || 28;

// Shared project color palette
export const PROJECT_COLORS = [
    '#4991E5', '#E5A449', '#7BC86C', '#CD5A91', '#A37EDE',
    '#29CCB1', '#F87171', '#FBBF24', '#6EE7B7', '#93C5FD',
    '#C084FC', '#FB923C', '#5EEAD4', '#FCA5A5', '#86EFAC'
];

/**
 * Renders the name cell for leaf resource rows (actual resources).
 * Generated TreeGroup parents use parentRenderer instead.
 */
function nameRenderer({ record }) {
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

/**
 * Renders the name cell for generated TreeGroup parent rows (Practice / Role).
 */
function treeGroupParentRenderer({ field, value }) {
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

export const schedulerproConfig = {
    appendTo    : 'app',
    startDate   : new Date(today.getFullYear(), today.getMonth(), 1),
    endDate     : new Date(today.getFullYear(), today.getMonth(), 1 + (12 * 7)),
    viewPreset  : 'weekAndDayLetter',
    visibleDate : { date : new Date(), block : 'start' },
    barMargin   : 5,

    eventRenderer({ eventRecord, renderData }) {
        if (eventRecord.effortRemaining == null || eventRecord.effortRemaining === 0) {
            renderData.eventColor = 'gray';
            renderData.cls.add('b-inactive');
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
            template({ eventRecord }) {
                const start  = eventRecord.startDate ? new Intl.DateTimeFormat('en-AU', { weekday : 'short', year : 'numeric', month : 'short', day : 'numeric' }).format(eventRecord.startDate) : '';
                const end    = eventRecord.endDate ? new Intl.DateTimeFormat('en-AU', { weekday : 'short', year : 'numeric', month : 'short', day : 'numeric' }).format(eventRecord.endDate) : '';
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
                    <div><strong>Start:</strong> ${start}</div>
                    <div><strong>End:</strong> ${end}</div>
                    <div><strong>Effort:</strong> ${effort}</div>
                    ${effortRemaining != null ? `<div><strong>Effort Remaining:</strong> ${effortRemaining} hrs</div>` : ''}
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
                            { text : 'Day',   ref : 'zoomDay',   toggleable : true, pressed : true,  dataset : { preset : 'weekAndDayLetter' } },
                            { text : 'Week',  ref : 'zoomWeek',  toggleable : true, pressed : false, dataset : { preset : 'weekAndMonth' } },
                            { text : 'Month', ref : 'zoomMonth', toggleable : true, pressed : false, dataset : { preset : 'monthAndYear' } }
                        ]
                    },
                    effortToggle : {
                        type          : 'slidetoggle',
                        ref           : 'effortToggle',
                        label         : 'Use Effort Remaining ',
                        labelPosition : 'before',
                        tooltip       : 'Toggle histogram between total effort and remaining effort',
                        checked       : false
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
                        items       : [],
                        chipView    : { closable : true },
                        listItemTpl(record) {
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
                        items          : [],
                        chipView       : { closable : true },
                        filterOperator : '*',
                        listItemTpl(record) {
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
                        items          : [],
                        chipView       : { closable : true },
                        filterOperator : '*',
                        listItemTpl(record) {
                            return record.text;
                        }
                    }
                }
            }
        ]
    }
};

