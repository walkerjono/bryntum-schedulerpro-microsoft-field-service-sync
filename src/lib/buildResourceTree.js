/**
 * Builds a hierarchical resource tree and remaps event resourceIds to synthetic leaf nodes.
 *
 * Supports two modes:
 *  - 'resource' : Resource (parent) → Project (child leaf) per assignment
 *  - 'project'  : Project (parent) → Resource (child leaf) per assignment
 *
 * Synthetic leaf IDs use the format: `{parentKey}____{childKey}` to encode both dimensions.
 */

// Distinct colors for project-based color coding
const PROJECT_COLORS = [
    '#4991E5', '#E5A449', '#7BC86C', '#CD5A91', '#A37EDE',
    '#29CCB1', '#F87171', '#FBBF24', '#6EE7B7', '#93C5FD',
    '#C084FC', '#FB923C', '#5EEAD4', '#FCA5A5', '#86EFAC'
];

const SEPARATOR = '____';

/**
 * Build a 2-level resource tree and remap events to leaf nodes.
 *
 * @param {Array} resources     - Flat array of raw D365 resource records (already mapped by CustomResourceModel)
 * @param {Array} events        - Flat array of raw D365 assignment records (already mapped by CustomEventModel)
 * @param {'resource'|'project'} mode - Grouping mode
 * @returns {{ treeData: Array, remappedEvents: Array, projectColorMap: Map }}
 */
export function buildResourceTree(resources, events, mode = 'resource') {
    // Build lookup maps
    const resourceMap = new Map();
    for (const r of resources) {
        resourceMap.set(r.id || r.bookableresourceid, r);
    }

    // Collect unique project names and assign colors
    const projectNames = [...new Set(events.map(e => e.projectName || 'Unassigned'))].sort();
    const projectColorMap = new Map();
    projectNames.forEach((name, i) => {
        projectColorMap.set(name, PROJECT_COLORS[i % PROJECT_COLORS.length]);
    });

    if (mode === 'resource') {
        return buildResourceFirst(resources, events, resourceMap, projectColorMap);
    }

    return buildProjectFirst(resources, events, resourceMap, projectColorMap);
}

/**
 * Resource → Project hierarchy
 * Parent rows = resources, leaf rows = projects (one per unique resource+project combo)
 */
function buildResourceFirst(resources, events, resourceMap, projectColorMap) {
    // Group events by resourceId, then by projectName
    const resourceGroups = new Map();

    for (const evt of events) {
        const resId = evt.resourceId || evt._msdyn_bookableresourceid_value;
        const projName = evt.projectName || 'Unassigned';

        if (!resourceGroups.has(resId)) {
            resourceGroups.set(resId, new Map());
        }
        const projMap = resourceGroups.get(resId);
        if (!projMap.has(projName)) {
            projMap.set(projName, []);
        }
        projMap.get(projName).push(evt);
    }

    const treeData = [];
    const remappedEvents = [];

    // Create parent node for each resource that has assignments
    for (const [resId, projMap] of resourceGroups) {
        const resource = resourceMap.get(resId);
        if (!resource) continue;

        const children = [];
        for (const [projName, projEvents] of projMap) {
            const leafId = `${resId}${SEPARATOR}${projName}`;
            children.push({
                id          : leafId,
                name        : projName,
                imageUrl    : null,
                isLeafNode  : true,
                isProject   : true,
                projectName : projName,
                eventColor  : projectColorMap.get(projName)
            });

            // Remap each event to point at the synthetic leaf
            for (const evt of projEvents) {
                remappedEvents.push({
                    ...evt,
                    resourceId : leafId,
                    eventColor : projectColorMap.get(projName)
                });
            }
        }

        // Sort children alphabetically by project name
        children.sort((a, b) => a.name.localeCompare(b.name));

        treeData.push({
            id         : resId,
            name       : resource.name,
            imageUrl   : resource.imageUrl,
            isLeafNode : false,
            isProject  : false,
            expanded   : false,
            children
        });
    }

    // Sort parent resources alphabetically
    treeData.sort((a, b) => a.name.localeCompare(b.name));

    return { treeData, remappedEvents, projectColorMap };
}

/**
 * Project → Resource hierarchy
 * Parent rows = projects, leaf rows = resources (one per unique project+resource combo)
 */
function buildProjectFirst(resources, events, resourceMap, projectColorMap) {
    // Group events by projectName, then by resourceId
    const projectGroups = new Map();

    for (const evt of events) {
        const projName = evt.projectName || 'Unassigned';
        const resId = evt.resourceId || evt._msdyn_bookableresourceid_value;

        if (!projectGroups.has(projName)) {
            projectGroups.set(projName, new Map());
        }
        const resMap = projectGroups.get(projName);
        if (!resMap.has(resId)) {
            resMap.set(resId, []);
        }
        resMap.get(resId).push(evt);
    }

    const treeData = [];
    const remappedEvents = [];

    for (const [projName, resMap] of projectGroups) {
        const children = [];
        for (const [resId, resEvents] of resMap) {
            const resource = resourceMap.get(resId);
            if (!resource) continue;

            const leafId = `${projName}${SEPARATOR}${resId}`;
            children.push({
                id          : leafId,
                name        : resource.name,
                imageUrl    : resource.imageUrl,
                isLeafNode  : true,
                isProject   : false,
                projectName : projName,
                eventColor  : projectColorMap.get(projName)
            });

            for (const evt of resEvents) {
                remappedEvents.push({
                    ...evt,
                    resourceId : leafId,
                    eventColor : projectColorMap.get(projName)
                });
            }
        }

        // Sort children alphabetically by resource name
        children.sort((a, b) => a.name.localeCompare(b.name));

        treeData.push({
            id          : `project_${projName}`,
            name        : projName,
            imageUrl    : null,
            isLeafNode  : false,
            isProject   : true,
            projectName : projName,
            eventColor  : projectColorMap.get(projName),
            expanded    : false,
            children
        });
    }

    // Sort parent projects alphabetically
    treeData.sort((a, b) => a.name.localeCompare(b.name));

    return { treeData, remappedEvents, projectColorMap };
}
