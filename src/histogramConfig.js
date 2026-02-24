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
 *
 * Signature: getBarClass(series, domConfig, datum, index, renderData)
 * Allocation data lives on the 3rd parameter `datum` (ResourceAllocationInterval).
 */
function getBarClass(series, domConfig, datum) {
    return datum?.isOverallocated ? 'b-overallocated' : 'b-underallocated';
}

export const histogramConfig = {
    appendTo      : 'histogram',
    hideHeaders   : true,        // time header already visible in the partner
    showBarTip    : true,
    showMaxEffort : true,
    showBarText   : false,

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
        },
        timeRanges : {
            showCurrentTimeLine : {
                name : new Intl.DateTimeFormat('en-AU', { day : 'numeric', month : 'short', year : 'numeric' }).format(new Date())
            }
        }
    },

    getBarClass
};
