async function ws_applyVariationToTask(primaryControl) {
    const status = window.parent.Xrm.Page.getAttribute('statuscode').getValue();
    if (status != 100000001) {
        await Xrm.Navigation.openAlertDialog({ text : 'Please ensure the record is in submitted status before applying.', title : 'Incorrect Status' });
        return;
    }
    Xrm.Utility.showProgressIndicator('Applying Effort and End Dates to task...');
    const v = {
        ws_estimatedenddate        : window.parent.Xrm.Page.getAttribute('ws_estimatedenddate').getValue(),
        ws_remainingtime           : window.parent.Xrm.Page.getAttribute('ws_remainingtime').getValue(),
        _ws_taskid_value           : window.parent.Xrm.Page.getAttribute('ws_taskid').getValue()[0].id.substring(1, 37),
        ws_timesheetvariationid    : window.parent.Xrm.Page.data.entity.getId().substring(1, 37),
        ws_approvedfinishdate      : window.parent.Xrm.Page.getAttribute('ws_approvedfinishdate').getValue(),
        ws_approvedremainingeffort : window.parent.Xrm.Page.getAttribute('ws_approvedremainingeffort').getValue(),
        ws_reasonid                : window.parent.Xrm.Page.getAttribute('ws_reasonid').getValue(),
        ws_approvedreasonid        : window.parent.Xrm.Page.getAttribute('ws_approvedreasonid').getValue()

    };
    await UpdateProjectTask(v);
    Xrm.Utility.closeProgressIndicator();
    window.parent.Xrm.Page.data.refresh(false);
}

async function ws_applyGridVaraitionToTask(selected, selectedRefs) {
    Xrm.Utility.showProgressIndicator('Applying Effort and End Dates to tasks...');
    var t = 0;
    for (const variation of selectedRefs) {
        // Fetch the variation  /api/data/v9.2/ws_timesheetvariations
        // use the taskid from that fetch to get the projecttasks
        const fetchVariation = await fetch(`/api/data/v9.2/ws_timesheetvariations(${variation.Id})`);
        const v = await fetchVariation.json();
        if (v.statuscode == 100000001) {
            await UpdateGridProjectTask(v);
            t++;
        }
    }
    Xrm.Utility.closeProgressIndicator();
    await Xrm.Navigation.openAlertDialog({ text : `${t} out of ${selectedRefs.length} Records updated.\nPlease refresh the view.`, title : 'Completed' });
}

async function UpdateGridProjectTask(v) {
    const fetchProject = await fetch(`/api/data/v9.2/msdyn_projecttasks(${v._ws_taskid_value})`);
    const p = await fetchProject.json();

    const templateJSON = {
        'UpdatedProjectTask'     : null,
        'MoveBookings'           : true,
        'RescheduleWBS'          : true,
        'OnlyUpdateStartEndDate' : false,
        'entity'                 : {
            '@odata.type'         : 'Microsoft.Dynamics.CRM.msdyn_projecttask',
            'msdyn_projecttaskid' : p.msdyn_projecttaskid
        }
    };
    if (!v.ws_approvedfinishdate) v.ws_approvedfinishdate = v.ws_estimatedenddate;
    const afdt = new Date(v.ws_approvedfinishdate);
    // This one is stored in minutes so need to convert to hours.
    // if (!v.ws_approvedremainingeffort) v.ws_approvedremainingeffort = v.ws_remainingtime / 60;
    if (v.ws_approvedremainingeffort == null) {
        v.ws_approvedremainingeffort = v.ws_remainingtime / 60;
    }
    if (!v._ws_approvedreasonid_value) v._ws_approvedreasonid_value = v._ws_reasonid_value;
    const updatedProjectTask = {
        'id'              : p.msdyn_projecttaskid,
        'subject'         : p.msdyn_subject,
        'startDateTime'   : p.msdyn_start,
        'endDateTime'     : afdt,
        'effort'          : p.msdyn_effort,
        'effortRemaining' : v.ws_approvedremainingeffort,
        'remainingCost'   : p.msdyn_remainingcost,
        'duration'        : p.msdyn_duration,
        'parentTask'      : p._msdyn_parenttask_value,
        'description'     : p.msdyn_description,
        'displaySequence' : p.msdyn_displaysequence,
        'outlineLevel'    : p.msdyn_outlinelevel,
        'category'        : { 'id' : null },
        'role'            : { 'id' : null },
        'orgunit'         : { 'id' : null },
        'project'         : p._msdyn_project_value
    };
    templateJSON.UpdatedProjectTask = JSON.stringify(updatedProjectTask);
    // this is the api call when updating the project task in the project thing
    const postProject = await fetch(`/api/data/v9.2/msdyn_projecttasks(${v._ws_taskid_value})/Microsoft.Dynamics.CRM.msdyn_updateprojecttask`, {
        'headers' : { 'content-type' : 'application/json' },
        'body'    : JSON.stringify(templateJSON),
        'method'  : 'POST'
    });
    // then run the update fetch.
    const updateFetch = await fetch('/api/data/v9.2/msdyn_PostProjectTaskUpdateAction', {
        'headers' : { 'content-type' : 'application/json' },
        'body'    : JSON.stringify({ 'TaskId' : p.msdyn_projecttaskid, 'IsSingleRecordUpdate' : false }),
        'method'  : 'POST'
    });
    const updateStatus = await fetch(`/api/data/v9.2/ws_timesheetvariations(${v.ws_timesheetvariationid})`, {
        'headers' : { 'content-type' : 'application/json' },
        'method'  : 'PATCH',
        'body'    : JSON.stringify({
            statuscode                       : 2,
            statecode                        : 1,
            ws_approvedremainingeffort       : v.ws_approvedremainingeffort,
            'ws_ApprovedReasonId@odata.bind' : `/ws_timesheetvariationreasons(${v._ws_approvedreasonid_value})`,
            ws_approvedfinishdate            : afdt.getFullYear() + '-' + ('' + (afdt.getMonth() + 1)).padStart(2, '0') + '-' + ('' + afdt.getDate()).padStart(2, '0')
        })
    });
}

async function UpdateProjectTask(v) {
    const fetchProject = await fetch(`/api/data/v9.2/msdyn_projecttasks(${v._ws_taskid_value})`);
    const p = await fetchProject.json();

    const templateJSON = {
        'UpdatedProjectTask'     : null,
        'MoveBookings'           : true,
        'RescheduleWBS'          : true,
        'OnlyUpdateStartEndDate' : false,
        'entity'                 : {
            '@odata.type'         : 'Microsoft.Dynamics.CRM.msdyn_projecttask',
            'msdyn_projecttaskid' : p.msdyn_projecttaskid
        }
    };
    if (!v.ws_approvedfinishdate) v.ws_approvedfinishdate = v.ws_estimatedenddate;
    const afdt = new Date(v.ws_approvedfinishdate);
    // This one is stored in minutes so need to convert to hours.
    // if (!v.ws_approvedremainingeffort) v.ws_approvedremainingeffort = v.ws_remainingtime / 60;
    if (v.ws_approvedremainingeffort == null) {
        v.ws_approvedremainingeffort = v.ws_remainingtime / 60;
    }
    if (!v.ws_approvedreasonid) v.ws_approvedreasonid = v.ws_reasonid;
    const updatedProjectTask = {
        'id'              : p.msdyn_projecttaskid,
        'subject'         : p.msdyn_subject,
        'startDateTime'   : p.msdyn_start,
        'endDateTime'     : afdt,
        'effort'          : p.msdyn_effort,
        'effortRemaining' : v.ws_approvedremainingeffort,
        'remainingCost'   : p.msdyn_remainingcost,
        'duration'        : p.msdyn_duration,
        'parentTask'      : p._msdyn_parenttask_value,
        'description'     : p.msdyn_description,
        'displaySequence' : p.msdyn_displaysequence,
        'outlineLevel'    : p.msdyn_outlinelevel,
        'category'        : { 'id' : null },
        'role'            : { 'id' : null },
        'orgunit'         : { 'id' : null },
        'project'         : p._msdyn_project_value
    };
    templateJSON.UpdatedProjectTask = JSON.stringify(updatedProjectTask);
    // this is the api call when updating the project task in the project thing
    const postProject = await fetch(`/api/data/v9.2/msdyn_projecttasks(${v._ws_taskid_value})/Microsoft.Dynamics.CRM.msdyn_updateprojecttask`, {
        'headers' : { 'content-type' : 'application/json' },
        'body'    : JSON.stringify(templateJSON),
        'method'  : 'POST'
    });
    // then run the update fetch.
    const updateFetch = await fetch('/api/data/v9.2/msdyn_PostProjectTaskUpdateAction', {
        'headers' : { 'content-type' : 'application/json' },
        'body'    : JSON.stringify({ 'TaskId' : p.msdyn_projecttaskid, 'IsSingleRecordUpdate' : false }),
        'method'  : 'POST'
    });
    v.ws_approvedreasonid[0].id = v.ws_approvedreasonid[0].id.slice(1, -1);
    const updateStatus = await fetch(`/api/data/v9.2/ws_timesheetvariations(${v.ws_timesheetvariationid})`, {
        'headers' : { 'content-type' : 'application/json' },
        'method'  : 'PATCH',
        'body'    : JSON.stringify({
            statuscode                       : 2,
            statecode                        : 1,
            ws_approvedremainingeffort       : v.ws_approvedremainingeffort,
            'ws_ApprovedReasonId@odata.bind' : `/ws_timesheetvariationreasons(${v.ws_approvedreasonid[0].id})`,
            ws_approvedfinishdate            : afdt.getFullYear() + '-' + ('' + (afdt.getMonth() + 1)).padStart(2, '0') + '-' + ('' + afdt.getDate()).padStart(2, '0')
        })
    });
}