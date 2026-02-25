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
    evenlyAllocated : '#6EE7B7', // green   (80-110%, all children also 80-110%)
    overallocated   : '#F87171', // red     (>110%)
    mixedState      : '#D8B4FE'  // purple  (parent 80-110%, but ≥1 child outside band)
};

/**
 * Leaf-state cache — populated as leaf bars are rendered.
 * Key: "resourceId:tickMs"  Value: 'under' | 'even' | 'over'
 *
 * On the very first render parents are processed before their children,
 * so the cache is empty and parents default to mixed-state (safe).
 * main.js schedules a single histogram.refresh() after first paint so that
 * the second pass sees fully-populated cache and colours parents correctly.
 */
const leafStateCache = new Map();

/**
 * Build a cache key from resource ID + tick start time.
 */
function cacheKey(resourceId, tickStart) {
    return `${resourceId}:${tickStart?.getTime?.() ?? 0}`;
}

/**
 * Collect all leaf (non-group) descendants of a TreeGroup resource.
 */
function getLeafDescendants(resource) {
    if (!resource.children || resource.children.length === 0) {
        return resource.isLeaf !== false ? [resource] : [];
    }
    const leaves = [];
    for (const child of resource.children) {
        leaves.push(...getLeafDescendants(child));
    }
    return leaves;
}

/**
 * Clear the leaf-state cache.
 * Call on data refresh so stale entries don't persist.
 */
export function clearLeafStateCache() {
    leafStateCache.clear();
}

/**
 * Returns a CSS class for each histogram bar based on utilisation,
 * AND applies inline color via domConfig to guarantee it overrides
 * Bryntum's default bar styling.
 *
 * Leaf resources:
 *   < 80%    → 'b-underallocated'   (orange)
 *   80-110%  → 'b-evenly-allocated' (green)
 *   > 110%   → 'b-overallocated'    (red)
 *
 * Parent nodes (Practice/Role):
 *   < 80%    → 'b-underallocated'   (orange)
 *   80-110%  → 'b-evenly-allocated' (green)  when ALL children are also 80-110%
 *   80-110%  → 'b-mixed-state'      (purple) when ≥1 child is outside 80-110%
 *   > 110%   → 'b-overallocated'    (red)
 *
 * Signature: getBarClass(series, domConfig, datum, index, renderData)
 * Allocation data lives on the 3rd parameter `datum` (ResourceAllocationInterval).
 * The 5th parameter `renderData` carries the resource model for this row.
 */
function getBarClass(series, domConfig, datum, index, renderData) {
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

    // Try to resolve the resource model for cache operations
    const resource = renderData?.resource ?? datum?.resource ?? datum?.owner;

    let resultClass;
    let color;

    if (allocationPercent > OVERALLOCATED_THRESHOLD) {
        resultClass = 'b-overallocated';
        color       = BAR_COLORS.overallocated;
        if (!isParent && resource) {
            leafStateCache.set(cacheKey(resource.id, datum.startDate), 'over');
        }
    }
    else if (allocationPercent < UNDERALLOCATED_THRESHOLD) {
        resultClass = 'b-underallocated';
        color       = BAR_COLORS.underallocated;
        if (!isParent && resource) {
            leafStateCache.set(cacheKey(resource.id, datum.startDate), 'under');
        }
    }
    else if (isParent) {
        // Parent is 80-110%: green only if ALL leaf children are also 80-110%
        let isMixed  = false;
        let hasData  = false;

        if (resource) {
            const leaves = getLeafDescendants(resource);
            for (const leaf of leaves) {
                const state = leafStateCache.get(cacheKey(leaf.id, datum.startDate));
                if (state) {
                    hasData = true;
                    if (state !== 'even') {
                        isMixed = true;
                        break;
                    }
                }
            }
        }

        if (!hasData || isMixed) {
            // No cached child data yet (first render) or at least one child uneven
            resultClass = 'b-mixed-state';
            color       = BAR_COLORS.mixedState;
        }
        else {
            resultClass = 'b-evenly-allocated';
            color       = BAR_COLORS.evenlyAllocated;
        }
    }
    else {
        // Leaf 80-110%
        resultClass = 'b-evenly-allocated';
        color       = BAR_COLORS.evenlyAllocated;
        if (resource) {
            leafStateCache.set(cacheKey(resource.id, datum.startDate), 'even');
        }
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
