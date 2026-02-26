/**
 * D365 OData entity interfaces — typed from actual field access patterns
 * in crudFunctions, CustomEventModel, and CustomResourceModel.
 */

// ── Bookable Resource (from bookableresources) ─────────────────────

export interface D365Contact {
    contactid: string;
    entityimage: string | null;
}

export interface D365BookableResource {
    bookableresourceid: string;
    name: string;
    ws_workinghours: number | null;
    statecode: number;
    resourcetype: number;
    ContactId?: D365Contact | null;
}

// ── Resource Category Assignment (from bookableresourcecategoryassns)

export interface D365ResourceCategory {
    bookableresourcecategoryid: string;
    name: string;
    ws_practice: string | number | null;
    'ws_practice@OData.Community.Display.V1.FormattedValue'?: string;
}

export interface D365ResourceCategoryAssignment {
    _resource_value: string;
    _resourcecategory_value: string;
    msdyn_isdefault: boolean;
    ResourceCategory?: D365ResourceCategory | null;
}

// ── Resource Assignment (from msdyn_resourceassignments) ────────────

export interface D365ProjectExpand {
    msdyn_subject?: string;
    ws_projectid?: string;
    _msdyn_customer_value?: string;
    '_msdyn_customer_value@OData.Community.Display.V1.FormattedValue'?: string;
}

export interface D365TaskExpand {
    msdyn_effortremaining: number | null;
    ws_projecttasknumber?: string;
}

export interface D365ResourceAssignment {
    msdyn_resourceassignmentid: string;
    msdyn_name?: string;
    msdyn_start: string;
    msdyn_finish: string;
    msdyn_effort: number;
    _msdyn_bookableresourceid_value: string;
    _msdyn_taskid_value?: string;
    '_msdyn_taskid_value@OData.Community.Display.V1.FormattedValue'?: string;
    _msdyn_projectid_value?: string;
    '_msdyn_projectid_value@OData.Community.Display.V1.FormattedValue'?: string;
    '@odata.etag'?: string;
    msdyn_projectid?: D365ProjectExpand | null;
    msdyn_taskid?: D365TaskExpand | null;
}

// ── OData response wrapper ──────────────────────────────────────────

export interface ODataResponse<T> {
    value: T[];
    '@odata.nextLink'?: string;
}
