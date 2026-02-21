import { ResourceModel } from '@bryntum/schedulerpro';
import { getToken } from '../auth.js';

// Fetch and cache the default unknown resource image
let defaultResourceImageBase64 = null;
const defaultImageUrl = `https://${import.meta.env.VITE_MICROSOFT_DYNAMICS_ORG_ID}.crm6.dynamics.com/Webresources/msdyn_/fps/ScheduleBoard/css/images/unknownResource.jpg`;

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

// Custom resource model for D365 Field Service bookable resources
export default class CustomResourceModel extends ResourceModel {
    static $name = 'CustomResourceModel';

    static fields = [
        { name : 'id', dataSource : 'bookableresourceid' },
        { name : 'bookableresourceid', type : 'string' },
        {
            name    : 'imageUrl',
            type    : 'string',
            convert : (_value, data) => {
                const entityImage = data.ContactId?.entityimage;
                if (entityImage) {
                    // entityimage is base64 encoded, convert to data URL
                    return `data:image/jpeg;base64,${entityImage}`;
                }
                // Return the default resource image if available
                return defaultResourceImageBase64;
            }
        },
        {
            name    : 'etag',
            type    : 'string',
            convert : (_value, data) => {
                const raw = data['@odata.etag'];
                return raw ? raw.replace(/\\"/g, '"') : null;
            }
        },
        // Tree grouping fields (used by synthetic nodes)
        { name : 'isLeafNode', type : 'boolean', defaultValue : true },
        { name : 'isProject', type : 'boolean', defaultValue : false },
        { name : 'isPractice', type : 'boolean', defaultValue : false },
        { name : 'projectName', type : 'string', defaultValue : '' },
        { name : 'practiceName', type : 'string', defaultValue : '' },
        { name : 'eventColor', type : 'string' }
    ];
}
