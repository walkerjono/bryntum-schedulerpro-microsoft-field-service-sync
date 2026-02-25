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
 * Allocation thresholds (percent)
 */
const UNDERALLOCATED_THRESHOLD = 80;  // < 80% = underallocated (orange)
const OVERALLOCATED_THRESHOLD  = 110; // > 110% = overallocated (red)

/**
 * Color map for each allocation state.
 */
const BAR_COLORS = {
    underallocated  : '#FBBF24', // orange  (<80%)
    evenlyAllocated : '#6EE7B7', // green   (80-110%, leaf)
    overallocated   : '#F87171', // red     (>110%)
    mixedState      : '#D8B4FE'  // purple  (80-110%, parent)
};

/**
 * Returns a CSS class for each histogram bar based on utilisation,
 * AND applies inline color via domConfig to guarantee it overrides
 * Bryntum's default bar styling.
 *
 * Leaf resources:
 *   < 80% → 'b-underallocated' (orange)
 *   80-110% → 'b-evenly-allocated' (green)
 *   > 110% → 'b-overallocated' (red)
 *
 * Parent nodes (Practice/Role):
 *   < 80% → 'b-underallocated' (orange)
 *   80-110% → 'b-mixed-state' (purple, indicates mixed child states)
 *   > 110% → 'b-overallocated' (red)
 *
 * Signature: getBarClass(series, domConfig, datum, index, renderData)
 * Allocation data lives on the 3rd parameter `datum` (ResourceAllocationInterval).
 */
function getBarClass(series, domConfig, datum) {
    // Calculate allocation % from effort/maxEffort (both in ms).
    // datum.units is unreliable for aggregate (group) rows.
    const maxEffort = datum?.maxEffort ?? 0;
    if (!maxEffort) {
        // No capacity in this tick – nothing meaningful to colour
        return '';
    }

    const allocationPercent = (datum.effort / maxEffort) * 100;

    // datum.isGroup is true for TreeGroup parent nodes (Practice/Role)
    const isParent = !!datum.isGroup;

    let resultClass;
    let color;

    if (allocationPercent > OVERALLOCATED_THRESHOLD) {
        resultClass = 'b-overallocated';
        color = BAR_COLORS.overallocated;
    }
    else if (allocationPercent < UNDERALLOCATED_THRESHOLD) {
        resultClass = 'b-underallocated';
        color = BAR_COLORS.underallocated;
    }
    else if (isParent) {
        resultClass = 'b-mixed-state';
        color = BAR_COLORS.mixedState;
    }
    else {
        resultClass = 'b-evenly-allocated';
        color = BAR_COLORS.evenlyAllocated;
    }

    // Apply inline fill to the SVG <rect> to override Bryntum defaults
    domConfig.style = { fill : color };

    return resultClass;
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
