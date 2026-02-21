import { SchedulerPro } from '@bryntum/schedulerpro';
import './style.css';
import { schedulerproConfig } from './schedulerproConfig';
import { signIn } from './auth.js';
import { getResources, getBookings } from './crudFunctions.js';
import CustomEventModel from './lib/CustomEventModel.js';
import CustomResourceModel, { loadDefaultImage } from './lib/CustomResourceModel.js';

const signInLink = document.getElementById('signin');
const loaderContainer = document.querySelector('.loader-container');

async function displayUI() {
    const account = sessionStorage.getItem('msalAccount');
    if (!account) {
        await signIn();
    }
    signInLink.style = 'display: none';
    const content = document.getElementById('content');
    content.style = 'display: block';

    // Display Scheduler Pro after sign in
    // Wait for resources, bookings, and default image to load
    const [resourcesData, bookingsData] = await Promise.all([
        getResources(),
        getBookings(),
        loadDefaultImage().catch(() => {})
    ]);

    // Initialize Scheduler Pro with raw D365 data
    // Field mapping is handled by CustomEventModel and CustomResourceModel
    window.schedulerPro = new SchedulerPro({
        ...schedulerproConfig,
        resourceStore : {
            modelClass : CustomResourceModel,
            data       : resourcesData.value,
            sorters    : [{ field : 'name', ascending : true }]
        },
        eventStore : {
            modelClass : CustomEventModel,
            data       : bookingsData.value
        }
    });
}

if (sessionStorage.getItem('msalAccount')) {
    displayUI();
    signInLink.style = 'display: none';
}
else {
    signInLink.style = 'display: block';
}

loaderContainer.style = 'display: none';

signInLink.addEventListener('click', displayUI);
