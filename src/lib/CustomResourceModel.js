import { ResourceModel } from '@bryntum/schedulerpro';
import { getToken } from '../auth.js';

// Fetch and cache the default unknown resource image
let defaultResourceImageBase64 = null;
const crmRegion = import.meta.env.VITE_CRM_REGION || 'crm6';
const defaultImageUrl = `https://${import.meta.env.VITE_MICROSOFT_DYNAMICS_ORG_ID}.${crmRegion}.dynamics.com/Webresources/msdyn_/fps/ScheduleBoard/css/images/unknownResource.jpg`;

// Function to load the default image (called after authentication)
export async function loadDefaultImage() {
    // Return immediately if already loaded
    if (defaultResourceImageBase64) {
        return;
    }

    try {
        const token = await getToken();
        const response = await fetch(defaultImageUrl, {
            headers : {
                'Authorization'    : `Bearer ${token}`,
                'Accept'           : 'application/json',
                'OData-MaxVersion' : '4.0',
                'OData-Version'    : '4.0'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch default resource image: ${response.statusText}`);
        }

        const blob = await response.blob();

        // Convert blob to base64 using a promise-based approach
        defaultResourceImageBase64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }
    catch {
        // Silently continue if the default image cannot be loaded
    }
}

/**
 * Custom resource model for D365 Field Service bookable resources.
 *
 * Data is pre-processed in main.js — fields are plain values, no convert needed.
 * TreeGroup uses practiceName & roleName to build Practice → Role → Resource tree.
 */
export default class CustomResourceModel extends ResourceModel {
    static $name = 'CustomResourceModel';

    static fields = [
        { name : 'imageUrl', type : 'string' },
        // Fields used by TreeGroup for Practice → Role grouping
        { name : 'practiceName', type : 'string', defaultValue : 'Unassigned' },
        { name : 'roleName', type : 'string', defaultValue : 'Unassigned' },
        // Working hours per week (from D365 ws_workinghours)
        { name : 'workingHours', type : 'number', defaultValue : 40 },
        // Calendar reference – links resource to a working-time calendar
        { name : 'calendar', type : 'string', defaultValue : 'business' }
    ];
}
