import { signOut } from './auth.js';

const today = new Date();

/**
 * Renders a tree-aware name cell.
 * Parent nodes: bold text with optional avatar (resources) or folder icon (projects).
 * Leaf nodes: avatar + name (resources) or color-coded project badge (projects).
 */
function nameRenderer({ record }) {
    const name = record.name || '';
    const imageUrl = record.imageUrl;
    const isLeaf = record.isLeaf;
    const isProject = record.data?.isProject;
    const eventColor = record.data?.eventColor;

    const isPractice = record.data?.isPractice;
    const isRole = record.data?.isRole;

    // Parent node
    if (!isLeaf) {
        // Practice parent (top-level group in resource-first mode)
        if (isPractice) {
            return `<div style="display: flex; align-items: center; gap: 8px;">
                <i class="fa fa-users" style="font-size: 16px; color: #666; width: 20px; text-align: center;"></i>
                <strong>${name}</strong>
            </div>`;
        }
        // Role parent (second-level group in resource-first mode)
        if (isRole) {
            return `<div style="display: flex; align-items: center; gap: 8px;">
                <i class="fa fa-briefcase" style="font-size: 14px; color: #888; width: 20px; text-align: center;"></i>
                <strong>${name}</strong>
            </div>`;
        }
        if (imageUrl) {
            // Resource parent (resource-first mode)
            return `<div style="display: flex; align-items: center; gap: 8px;">
                <img src="${imageUrl}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;" />
                <strong>${name}</strong>
            </div>`;
        }
        // Project parent (project-first mode)
        const color = eventColor || '#888';
        return `<div style="display: flex; align-items: center; gap: 8px;">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color}"></span>
            <strong>${name}</strong>
        </div>`;
    }

    // Leaf node
    if (isProject) {
        // Project leaf (resource-first mode)
        const color = eventColor || '#888';
        return `<div style="display: flex; align-items: center; gap: 8px; padding-left: 4px;">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color}"></span>
            <span>${name}</span>
        </div>`;
    }

    // Resource leaf (project-first mode)
    if (imageUrl) {
        return `<div style="display: flex; align-items: center; gap: 8px;">
            <img src="${imageUrl}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;" />
            <span>${name}</span>
        </div>`;
    }

    return `<div style="display: flex; align-items: center; gap: 8px;">
        <span>${name}</span>
    </div>`;
}

export const schedulerproConfig = {
    appendTo   : 'app',
    startDate  : new Date(today.getFullYear(), today.getMonth(), today.getDate()),
    endDate    : new Date(today.getFullYear(), today.getMonth(), today.getDate() + 14),
    viewPreset : 'weekAndDay',
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
        tree         : true
        // rollups is a Gantt-only feature, not available in SchedulerPro
    },
    tbar : {
        items : {
            groupToggle : {
                type       : 'button',
                text       : 'Group by: Resource',
                icon       : 'fa fa-sitemap',
                toggleable : true,
                pressed    : false,
                cls        : 'b-raised',
                onToggle({ pressed }) {
                    // Callback is set dynamically in main.js via window._onGroupToggle
                    if (window._onGroupToggle) {
                        window._onGroupToggle(pressed);
                    }
                }
            },
            signoutButton : {
                text  : 'Signout',
                icon  : 'fa fa-sign-out',
                style : 'margin-left: auto;',
                onClick() {
                    signOut().then(() => {
                        location.reload();
                    });
                }
            }
        }
    }
};

