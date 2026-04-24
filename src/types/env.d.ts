/// <reference types="vite/client" />

interface ImportMetaEnv {
    /** Azure Entra (AAD) Application (client) ID */
    readonly VITE_MICROSOFT_ENTRA_APP_ID: string;
    /** Azure Entra (AAD) Tenant ID */
    readonly VITE_MICROSOFT_ENTRA_TENANT_ID: string;
    /** Dynamics 365 Organisation ID (subdomain) */
    readonly VITE_MICROSOFT_DYNAMICS_ORG_ID: string;
    /** OAuth redirect URI (default: window.location.origin) */
    readonly VITE_REDIRECT_URI?: string;
    /** Dataverse CRM region e.g. 'crm6' (default: 'crm6') */
    readonly VITE_CRM_REGION?: string;
    /** Dataverse Web API version e.g. 'v9.2' (default: 'v9.2') */
    readonly VITE_DATAVERSE_API_VERSION?: string;
    /** Max OData pages to fetch before stopping (default: '20') */
    readonly VITE_ODATA_MAX_PAGES?: string;
    /** Enable effort-remaining mode: 'true' | 'false' (default: 'false') */
    readonly VITE_USE_EFFORT_REMAINING?: string;
    /** Days to offset start date or 'current_week' (default: '7') */
    readonly VITE_EFFORT_REMAINING_OFFSET_DAYS?: string;
    /** Days to buffer beyond visible viewport for OData queries (default: '28') */
    readonly VITE_VIEWPORT_BUFFER_DAYS?: string;
    /** Hours per working day for allocation calculation (default: '8') */
    readonly VITE_HOURS_PER_DAY?: string;
    /** Default view mode: 'day' | 'week' | 'month' (default: 'day') */
    readonly VITE_DEFAULT_VIEW_MODE?: string;
    /** Under-allocated threshold percentage (default: '80') */
    readonly VITE_UNDERALLOCATED_THRESHOLD?: string;
    /** Over-allocated threshold percentage (default: '110') */
    readonly VITE_OVERALLOCATED_THRESHOLD?: string;
    /** Enable timesheet panel feature: 'true' | 'false' (default: 'false') */
    readonly VITE_TIMESHEET_ENABLED?: string;
    /** Maximum hours per single time entry (default: '24') */
    readonly VITE_TIMESHEET_MAX_HOURS?: string;
    /** Minimum time entry increment in hours (default: '0.25') */
    readonly VITE_TIMESHEET_MIN_INCREMENT?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
