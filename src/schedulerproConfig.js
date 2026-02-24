import { signOut } from './auth.js';

const today = new Date();

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
    appendTo   : 'app',
    startDate  : new Date(today.getFullYear(), today.getMonth(), 1),
    endDate    : new Date(today.getFullYear(), today.getMonth() + 4, 0),
    viewPreset : 'weekAndMonth',
    barMargin  : 5,
    columns    : [
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
                const clientName   = eventRecord.clientName || '';
                const projectName  = eventRecord.projectName || '';
                const projectNum   = eventRecord.projectNumber || '';
                const projectLabel = projectNum ? `${projectNum} - ${projectName}` : projectName;
                return `<div class="b-sch-event-tooltip">
                    <div><strong>Client:</strong> ${clientName}</div>
                    <div><strong>Project:</strong> ${projectLabel}</div>
                    <div><strong>Start:</strong> ${start}</div>
                    <div><strong>End:</strong> ${end}</div>
                    <div><strong>Effort:</strong> ${effort}</div>
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
        items : {
            refreshButton : {
                type    : 'button',
                icon    : 'fa fa-sync',
                tooltip : 'Refresh data',
                cls     : 'b-transparent'
            },
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
                type        : 'combo',
                ref         : 'roleFilter',
                label       : 'Role',
                multiSelect : true,
                editable    : false,
                clearable   : true,
                width       : 350,
                placeholder : 'All Roles',
                items       : [],
                chipView    : { closable : true },
                listItemTpl(record) {
                    return record.text;
                }
            },
            spacer        : { type : 'widget', flex : 1 },
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
    }
};

