/**
 * ResourceHistogram configuration.
 *
 * Partnered with the SchedulerPro instance so time axis, zoom,
 * and horizontal scroll stay in sync.
 *
 * Uses the same TreeGroup levels as the scheduler so the
 * Practice → Role → Resource hierarchy is identical.
 */

/**
 * Returns a CSS class for each histogram bar based on utilisation.
 * Green when at-or-under capacity, red when over.
 */
function getBarClass({ value, maxValue }) {
    if (value > maxValue) {
        return 'b-overallocated';
    }
    return 'b-underallocated';
}

export const histogramConfig = {
    appendTo    : 'histogram',
    hideHeaders : true,        // time header already visible in the partner
    showBarTip  : true,
    showMaxEffort : true,

    columns : [
        {
            type  : 'tree',
            text  : 'Name',
            field : 'name',
            width : 400
        }
    ],

    features : {
        tree      : true,
        treeGroup : {
            levels        : ['practiceName', 'roleName'],
            expandParents : false
        }
    },

    getBarClass
};
