var type_work = '192350000';

function ws_timeEntry_onload(executionContext) {
    var formContext = executionContext.getFormContext();
    ws_type_Onchange(executionContext);
    ws_project_OnChange(executionContext);
    //project_LookupFilter(executionContext);
    setCutomer(executionContext);
    formContext.getAttribute('msdyn_type').addOnChange(ws_type_Onchange);
    formContext.getAttribute('ws_caseid').addOnChange(ws_case_OnChange);
    formContext.getAttribute('msdyn_project').addOnChange(ws_project_OnChange);
}

function setCutomer(executionContext) {
    var formContext = executionContext.getFormContext();
    formContext.getControl('ws_customer').setEntityTypes(['account']);

}
//Trigger on formload and onchange
function ws_type_Onchange(executionContext) {

    var formContext = executionContext.getFormContext();
    var type = formContext.getAttribute('msdyn_type').getValue();
    if (type != null && type == type_work)
        formContext.getAttribute('ws_customer').setRequiredLevel('required');
    else
        formContext.getAttribute('ws_customer').setRequiredLevel('none');
}

//A case is selected, then auto populate project and task from the project and task on the case
function ws_case_OnChange(executionContext) {
    'use strict';
    var formContext = executionContext.getFormContext();
    var lookup = formContext.getAttribute('ws_caseid').getValue();
    if (lookup != null) {
        var lookupId = lookup[0].id;
        Xrm.WebApi.retrieveMultipleRecords('incident', '?$select=ws_projectid,ws_projecttaskid&$filter=incidentid eq ' + lookupId + '').then(
            function success(result) {

                var Project_name = result.entities[0]['_ws_projectid_value@OData.Community.Display.V1.FormattedValue'];
                var Project_id = result.entities[0]['_ws_projectid_value'];
                var value = new Array(); //create a new object array
                value[0] = new Object();
                value[0].id = Project_id;
                value[0].name = Project_name;
                value[0].entityType = result.entities[0]['_ws_projectid_value@Microsoft.Dynamics.CRM.lookuplogicalname'];
                if (Project_name != null) {
                    formContext.getAttribute('msdyn_project').setValue(value);
                    formContext.getControl('msdyn_project').setDisabled(true);
                }
                Project_name = result.entities[0]['_ws_projecttaskid_value@OData.Community.Display.V1.FormattedValue'];
                Project_id = result.entities[0]['_ws_projecttaskid_value'];
                value = new Array(); //create a new object array
                value[0] = new Object();
                value[0].id = Project_id;
                value[0].name = Project_name;
                value[0].entityType = result.entities[0]['_ws_projecttaskid_value@Microsoft.Dynamics.CRM.lookuplogicalname'];
                if (Project_name != null) {
                    formContext.getAttribute('msdyn_projecttask').setValue(value);
                }
            },
            function(error) {
                Xrm.Utility.alertDialog(error.message);
            }
        );
    }
    else {
        console.log('Please enter the Project value');
        formContext.getAttribute('msdyn_project').setValue(null);
        formContext.getAttribute('msdyn_projecttask').setValue(null);
        formContext.getControl('msdyn_project').setDisabled(false);
        formContext.getControl('ws_caseid').setDisabled(false);
        formContext.getAttribute('msdyn_projecttask').setRequiredLevel('none');
        //formContext.getAttribute("msdyn_project").setRequiredLevel("none");
    }
}


async function ws_project_OnChange(executionContext) {
    'use strict';
    var formContext = executionContext.getFormContext();
    //project_LookupFilter(executionContext);
    var projectlookup = formContext.getAttribute('msdyn_project').getValue();
    var caselookup = formContext.getAttribute('ws_caseid').getValue();
    if (projectlookup != null) {
        const projid = projectlookup[0].id.substring(1, 37);
        var proj = await Xrm.WebApi.retrieveRecord('msdyn_project', projid, '?$select=ws_caseprojecttaskenforcement');
        var tmp = await Xrm.WebApi.retrieveMultipleRecords('salesorderdetail', "?$filter=_msdyn_project_value eq '" + proj.msdyn_projectid + "' and (ws_contractlinetype eq 100000000 or ws_contractlinetype eq 100000003)");
        console.log('Weirdness here: ' + proj.msdyn_projectid);
        console.log(tmp);
        var isRetainer = tmp.entities.length > 0;
        if (proj.ws_caseprojecttaskenforcement == 100000001) {//No
            formContext.getControl('msdyn_projecttask').setDisabled(false);
            formContext.getAttribute('msdyn_projecttask').setRequiredLevel('required');
            formContext.getControl('ws_caseid').setDisabled(true);
            formContext.getAttribute('ws_caseid').setRequiredLevel('none');
            formContext.getAttribute('ws_caseid').setValue(null);
        }
        else if (proj.ws_caseprojecttaskenforcement == 100000000 && !isRetainer) {//Yes
            formContext.getControl('ws_caseid').setDisabled(false);
            formContext.getAttribute('ws_caseid').setRequiredLevel('required');
            formContext.getControl('msdyn_projecttask').setDisabled(true);
            formContext.getAttribute('msdyn_projecttask').setRequiredLevel('none');
            formContext.getAttribute('msdyn_projecttask').setValue(null);
        }
        else if (proj.ws_caseprojecttaskenforcement == 100000000 && isRetainer) {//Yes
            formContext.getControl('ws_caseid').setDisabled(false);
            formContext.getAttribute('ws_caseid').setRequiredLevel('none');
            formContext.getControl('msdyn_projecttask').setDisabled(false);
            formContext.getAttribute('msdyn_projecttask').setRequiredLevel('none');
        }
    }
}

