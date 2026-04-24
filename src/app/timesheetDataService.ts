/**
 * Timesheet data service — all D365 API operations beyond basic
 * time entry CRUD (which lives in timesheetCrud.ts).
 *
 * Covers: variations, variation reasons, projects, tasks, assignments,
 * help tasks, help task reasons, user timesheets, and completion.
 */

import { getToken } from './auth';
import {
    orgUrl,
    apiVersion,
    buildHeaders,
    fetchAllPages
} from './odataHelper';
import type {
    D365Variation,
    D365VariationReason,
    D365Project,
    D365ProjectTask,
    D365ResourceAssignmentLite,
    D365HelpTask,
    D365HelpTaskReason,
    D365UserTimesheet,
    CreateVariationPayload,
    UpdateVariationPayload,
    CreateHelpTaskPayload
} from '../types/timesheet';

// ── Variation Reasons ───────────────────────────────────────────────

/**
 * Fetch all active variation reasons.
 */
export async function getVariationReasons(): Promise<D365VariationReason[]> {
    const token = await getToken();
    const headers = buildHeaders(token);
    const url = `${orgUrl}/api/data/${apiVersion}/ws_timesheetvariationreasons?$select=ws_timesheetvariationreasonid,ws_name,statecode&$filter=statecode eq 0&$orderby=ws_name asc`;

    const { value } = await fetchAllPages<D365VariationReason>(url, headers, { label : 'variation reasons' });
    return value;
}

// ── Variations CRUD ─────────────────────────────────────────────────

const variationPath = `${orgUrl}/api/data/${apiVersion}/ws_timesheetvariations`;

/**
 * Fetch `ws_timesheetvariation` records for a resource (active only).
 * Variations bind to task+project+resource — not individual time entries.
 */
export async function getVariations(resourceId: string): Promise<D365Variation[]> {
    if (!resourceId) return [];

    const token = await getToken();
    const headers = buildHeaders(token, {
        'Prefer' : 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"'
    });

    const select = [
        'ws_timesheetvariationid',
        'ws_remainingtime',
        'ws_estimatedenddate',
        'ws_comment',
        '_ws_reasonid_value',
        '_ws_taskid_value',
        '_ws_projectid_value',
        '_ws_resourceid_value',
        'statuscode'
    ].join(',');

    const filter = `_ws_resourceid_value eq ${resourceId} and (statuscode eq 1)`;

    const url = `${variationPath}?$select=${select}&$filter=${filter}`;

    const { value } = await fetchAllPages<D365Variation>(url, headers, { label : 'variations' });
    return value;
}

/**
 * Create a new variation record.
 */
export async function createVariation(payload: CreateVariationPayload): Promise<D365Variation> {
    const token = await getToken();
    const headers = buildHeaders(token, {
        'Content-Type' : 'application/json',
        'Prefer'       : 'return=representation'
    });

    const response = await fetch(variationPath, {
        method : 'POST',
        headers,
        body   : JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create variation: ${errorText}`);
    }

    return response.json();
}

/**
 * Update an existing variation.
 */
export async function updateVariation(
    id: string,
    payload: UpdateVariationPayload
): Promise<void> {
    const token = await getToken();
    const headers = buildHeaders(token, { 'Content-Type' : 'application/json' });

    const response = await fetch(`${variationPath}(${id})`, {
        method : 'PATCH',
        headers,
        body   : JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to update variation: ${errorText}`);
    }
}

/**
 * Submit (transition) variations to Submitted status.
 * PATCHes each variation with `statuscode: 100000001`.
 */
export async function submitVariations(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    const token = await getToken();
    const headers = buildHeaders(token, { 'Content-Type' : 'application/json' });

    for (const id of ids) {
        const response = await fetch(`${variationPath}(${id})`, {
            method : 'PATCH',
            headers,
            body   : JSON.stringify({ statuscode : 100000001 })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.warn(`[timesheetDataService] Failed to submit variation ${id}: ${errorText}`);
        }
    }
}

/**
 * Delete a variation record.
 */
export async function deleteVariation(id: string): Promise<void> {
    const token = await getToken();
    const headers = buildHeaders(token);

    const response = await fetch(`${variationPath}(${id})`, {
        method : 'DELETE',
        headers
    });

    if (!response.ok && response.status !== 404) {
        const errorText = await response.text();
        throw new Error(`Failed to delete variation: ${errorText}`);
    }
}

// ── Projects ────────────────────────────────────────────────────────

/**
 * Fetch active projects assigned to a resource (via resource assignments).
 */
export async function getResourceProjects(resourceId: string): Promise<D365Project[]> {
    const token = await getToken();
    const headers = buildHeaders(token);

    // First get distinct project IDs from resource assignments
    const assignmentUrl = `${orgUrl}/api/data/${apiVersion}/msdyn_resourceassignments?$select=_msdyn_projectid_value&$filter=_msdyn_bookableresourceid_value eq ${resourceId}`;
    const { value: assignments } = await fetchAllPages<{ _msdyn_projectid_value: string }>(
        assignmentUrl, headers, { label : 'resource project assignments' }
    );

    const projectIds = [...new Set(assignments.map((a) => a._msdyn_projectid_value).filter(Boolean))];
    if (projectIds.length === 0) return [];

    // Fetch project details
    const filter = projectIds.map((id) => `msdyn_projectid eq ${id}`).join(' or ');
    const projectUrl = `${orgUrl}/api/data/${apiVersion}/msdyn_projects?$select=msdyn_projectid,msdyn_subject,ws_projectid,statecode&$filter=(${filter}) and statecode eq 0&$orderby=msdyn_subject asc`;

    const { value : projects } = await fetchAllPages<D365Project>(projectUrl, headers, { label : 'projects' });
    return projects;
}

// ── Project Tasks ───────────────────────────────────────────────────

/**
 * Fetch tasks for a project using FetchXML (matches original D365 pattern).
 * Returns only leaf-level tasks that the resource is assigned to.
 */
export async function getProjectTasks(
    projectId: string,
    resourceId: string
): Promise<D365ProjectTask[]> {
    const token = await getToken();
    const headers = buildHeaders(token, {
        'Prefer' : 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"'
    });

    // Use OData filter approach — simpler and works without FetchXML privilege issues
    const url = `${orgUrl}/api/data/${apiVersion}/msdyn_projecttasks?$select=msdyn_projecttaskid,msdyn_subject,ws_projecttasknumber,_msdyn_project_value&$filter=_msdyn_project_value eq ${projectId}&$orderby=msdyn_subject asc`;

    const { value : allTasks } = await fetchAllPages<D365ProjectTask>(url, headers, { label : 'project tasks' });

    // If we need to filter by resource assignment, get assignments
    const assignmentUrl = `${orgUrl}/api/data/${apiVersion}/msdyn_resourceassignments?$select=_msdyn_taskid_value&$filter=_msdyn_bookableresourceid_value eq ${resourceId} and _msdyn_projectid_value eq ${projectId}`;
    const { value: assignments } = await fetchAllPages<{ _msdyn_taskid_value: string | null }>(
        assignmentUrl, headers, { label : 'task assignments' }
    );

    const assignedTaskIds = new Set(assignments.map((a) => a._msdyn_taskid_value).filter(Boolean));

    // If no task-level assignments, return all tasks (project-level assignment)
    if (assignedTaskIds.size === 0) return allTasks;

    return allTasks.filter((t) => assignedTaskIds.has(t.msdyn_projecttaskid));
}

// ── Resource Assignments ────────────────────────────────────────────

/**
 * Fetch resource assignments for a resource in a date range.
 */
export async function getResourceAssignments(
    resourceId: string
): Promise<D365ResourceAssignmentLite[]> {
    const token = await getToken();
    const headers = buildHeaders(token);

    const url = `${orgUrl}/api/data/${apiVersion}/msdyn_resourceassignments?$select=msdyn_resourceassignmentid,_msdyn_bookableresourceid_value,_msdyn_projectid_value,_msdyn_taskid_value&$filter=_msdyn_bookableresourceid_value eq ${resourceId}`;

    const { value } = await fetchAllPages<D365ResourceAssignmentLite>(url, headers, { label : 'resource assignments' });
    return value;
}

// ── Help Tasks ──────────────────────────────────────────────────────

const helpTaskPath = `${orgUrl}/api/data/${apiVersion}/ws_projecthelptaskses`;

/**
 * Fetch help tasks for a resource.
 */
export async function getHelpTasks(resourceId: string): Promise<D365HelpTask[]> {
    const token = await getToken();
    const headers = buildHeaders(token, {
        'Prefer' : 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"'
    });

    const url = `${helpTaskPath}?$select=ws_projecthelptasksid,ws_name,ws_description,ws_hours,ws_startdate,ws_enddate,_ws_project_value,_ws_resource_value,_ws_reason_value,statecode&$filter=_ws_resource_value eq ${resourceId} and statecode eq 0&$orderby=ws_name asc`;

    const { value } = await fetchAllPages<D365HelpTask>(url, headers, { label : 'help tasks' });
    return value;
}

/**
 * Create a help task.
 */
export async function createHelpTask(payload: CreateHelpTaskPayload): Promise<D365HelpTask> {
    const token = await getToken();
    const headers = buildHeaders(token, {
        'Content-Type' : 'application/json',
        'Prefer'       : 'return=representation'
    });

    const response = await fetch(helpTaskPath, {
        method : 'POST',
        headers,
        body   : JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create help task: ${errorText}`);
    }

    return response.json();
}

// ── Help Task Reasons ───────────────────────────────────────────────

/**
 * Fetch all active help task reasons.
 */
export async function getHelpTaskReasons(): Promise<D365HelpTaskReason[]> {
    const token = await getToken();
    const headers = buildHeaders(token);
    const url = `${orgUrl}/api/data/${apiVersion}/ws_projecthelptaskreasonses?$select=ws_projecthelptaskreasonsid,ws_name,statecode&$filter=statecode eq 0&$orderby=ws_name asc`;

    const { value } = await fetchAllPages<D365HelpTaskReason>(url, headers, { label : 'help task reasons' });
    return value;
}

// ── User Timesheets ─────────────────────────────────────────────────

const userTimesheetPath = `${orgUrl}/api/data/${apiVersion}/ws_usertimesheets`;

/**
 * Fetch the user timesheet record for a resource + week.
 */
export async function getUserTimesheet(
    resourceId: string,
    weekStartDate: string
): Promise<D365UserTimesheet | null> {
    const token = await getToken();
    const headers = buildHeaders(token);

    // ws_startdate is a DateTime field, so use a date-range filter rather than eq.
    // The original source never filters ws_usertimesheets by resource; row-level security
    // ensures the current user only sees their own records.
    const url = `${userTimesheetPath}?$select=ws_usertimesheetid,ws_name,ws_startdate,ws_enddate,statuscode,statecode&$filter=ws_startdate ge ${weekStartDate}T00:00:00Z and ws_startdate lt ${weekStartDate}T23:59:59Z&$top=1`;

    const response = await fetch(url, { headers });
    if (!response.ok) {
        const errorBody = await response.text();
        console.warn('[timesheetDataService] Failed to fetch user timesheet:', response.statusText, errorBody);
        return null;
    }

    const data = await response.json();
    return data.value?.[0] ?? null;
}

/**
 * Create a user timesheet record (for week tracking).
 *
 * @param endDate  Optional ISO date string for ws_enddate. If omitted, no
 *                 end date is set (consistent with draft creation). The
 *                 caller (submit/complete) should compute the end date:
 *                 current date if within the same week, Sunday otherwise.
 */
export async function createUserTimesheet(
    resourceId: string,
    weekStartDate: string,
    name: string,
    endDate?: string
): Promise<D365UserTimesheet> {
    const token = await getToken();
    const headers = buildHeaders(token, {
        'Content-Type' : 'application/json',
        'Prefer'       : 'return=representation'
    });

    // Original source creates user timesheets without a resource binding.
    const payload: Record<string, string> = {
        ws_startdate : weekStartDate,
        ws_name      : name
    };

    if (endDate) {
        payload.ws_enddate = endDate;
    }

    const response = await fetch(userTimesheetPath, {
        method : 'POST',
        headers,
        body   : JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create user timesheet: ${errorText}`);
    }

    return response.json();
}

// ── Complete Timesheet ──────────────────────────────────────────────

/**
 * Mark a user timesheet as completed via custom action or status update.
 */
export async function completeUserTimesheet(timesheetId: string): Promise<void> {
    const token = await getToken();
    const headers = buildHeaders(token, { 'Content-Type' : 'application/json' });

    // Try custom action first
    const actionUrl = `${orgUrl}/api/data/${apiVersion}/ws_usertimesheets(${timesheetId})/Microsoft.Dynamics.CRM.ws_CompleteTimesheet`;

    const actionResponse = await fetch(actionUrl, {
        method : 'POST',
        headers,
        body   : JSON.stringify({})
    });

    if (actionResponse.ok) {
        console.log('[timesheetDataService] Timesheet completed via action');
        return;
    }

    // Fallback: update status directly
    console.warn('[timesheetDataService] Complete action failed, falling back to PATCH');
    const patchUrl = `${userTimesheetPath}(${timesheetId})`;
    const patchResponse = await fetch(patchUrl, {
        method : 'PATCH',
        headers,
        body   : JSON.stringify({ statuscode : 192350003 }) // Completed
    });

    if (!patchResponse.ok) {
        const errorText = await patchResponse.text();
        throw new Error(`Failed to complete timesheet: ${errorText}`);
    }
}

// ── Recall Timesheet ────────────────────────────────────────────────

/**
 * Recall a submitted user timesheet.
 */
export async function recallUserTimesheet(timesheetId: string): Promise<void> {
    const token = await getToken();
    const headers = buildHeaders(token, { 'Content-Type' : 'application/json' });

    const patchUrl = `${userTimesheetPath}(${timesheetId})`;
    const response = await fetch(patchUrl, {
        method : 'PATCH',
        headers,
        body   : JSON.stringify({ statuscode : 192350000 }) // Draft
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to recall timesheet: ${errorText}`);
    }
}
