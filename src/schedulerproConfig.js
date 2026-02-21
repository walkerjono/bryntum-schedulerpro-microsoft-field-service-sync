import { DateHelper } from '@bryntum/schedulerpro';
import { signOut } from './auth.js';
import {
    updateBooking,
    createBooking,
    deleteBooking
} from './crudFunctions.js';

const today = new Date();

const updateSavingValue = (text = 'Idle', color = 'green') => {
    if (window.schedulerPro) {
        const { savingValue } = window.schedulerPro.widgetMap;
        if (savingValue) {
            savingValue.html = text;
            savingValue.element.style.color = color;
        }
    }
};

export const schedulerproConfig = {
    appendTo   : 'app',
    startDate  : new Date(today.getFullYear(), today.getMonth(), today.getDate(), 8),
    endDate    : new Date(today.getFullYear(), today.getMonth(), today.getDate(), 21),
    viewPreset : 'weekAndDay',
    columns    : [
        {
            text          : 'Name',
            field         : 'name',
            readOnly      : true,
            cellMenuItems : true,
            width         : 300,
            htmlEncode    : false,
            renderer({ record }) {
                const imageUrl = record.imageUrl;
                const name = record.name || '';

                return `<div style="display: flex; align-items: center; gap: 8px;">
                    <img src="${imageUrl}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;" />
                    <span>${name}</span>
                </div>`;
            }
        }
    ],
    features : {
        dependencies : false,
        eventBuffer  : {
            // The event buffer time spans are considered as unavailable time
            bufferIsUnavailableTime : true,
            tooltipTemplate         : ({ duration }) => `<i class="fa fa-car"></i>Travel time: ${duration}`
        },

        taskEdit : {
            items : {
                generalTab : {
                    items : {
                        percentDoneField : null,
                        effortField      : null,
                        postambleField   : null,
                        preambleField    : null
                    }
                }
            }
        }
    },
    listeners : {
        afterEventSave({ eventRecord, source }) {
            if (eventRecord.id.startsWith('_generated')) {
                createBookingItem(eventRecord, source);
            }
            // Updates are handled by dataChange listener
        },

        dataChange : function(event) {
            updateDynamics365FieldService(event);
        }
    },
    tbar : {
        items : {
            savingStatus : {
                type   : 'container',
                layout : 'hbox',
                items  : {
                    label       : 'Saving status:',
                    savingValue : 'Idle'
                }
            },
            deleteButton : {
                text  : 'Signout',
                icon  : 'fa fa-sign-out',
                style : 'margin-left: auto;',
                onClick() {
                    signOut().then(() => {
                        // Refresh the page after sign out
                        location.reload();
                    });
                }
            }
        }
    }
};

async function createBookingItem(eventRecord, source) {
    updateSavingValue('Updating Field Service', 'orange');
    try {
        const recordData = eventRecord.data;

        // Get the resource ID from the event's resource assignment
        const resourceId = recordData.Resource?.bookableresourceid ||
                         eventRecord.resources?.[0]?.id ||
                         eventRecord.resources?.[0]?.bookableresourceid;

        if (!resourceId) {
            console.log('Cannot create booking - no resource assigned');
            updateSavingValue();
            return;
        }

        const bookingData = {
            name                  : recordData.name,
            'Resource@odata.bind' : `/bookableresources(${resourceId})`,
            starttime             : recordData.msdyn_estimatedarrivaltime?.toISOString() || recordData.startDate?.toISOString(),
            endtime               : recordData.endtime?.toISOString() || recordData.endDate?.toISOString(),
            duration              : Math.round(recordData.duration)
        };

        const newBooking = await createBooking(bookingData);
        const newId = newBooking.bookableresourcebookingid;

        // Update the event with the real D365 ID
        source.project.eventStore.applyChangeset({
            updated : [
                {
                    $PhantomId                : eventRecord.id,
                    id                        : newId,
                    bookableresourcebookingid : newId
                }
            ]
        });

        updateSavingValue();
    }
    catch (error) {
        console.error('Error creating booking in Field Service:', error);
        updateSavingValue('Error', 'red');
        setTimeout(() => updateSavingValue(), 5000);
    }
}

async function updateDynamics365FieldService(event) {
    const { action, store, records } = event;
    const storeId = store.id;

    // Only handle events store (bookings)
    if (storeId !== 'events') {
        return;
    }

    updateSavingValue('Updating Field Service', 'orange');

    try {
        if (action === 'remove') {
            for (const record of records) {
                const recordData = record.data;
                // Skip if this is a generated ID (never saved to D365)
                if (`${recordData?.id}`.startsWith('_generated')) {
                    continue;
                }

                if (recordData.bookableresourcebookingid) {
                    await deleteBooking(recordData.bookableresourcebookingid);
                }
            }
        }
        else if (action === 'update') {
            for (const record of records) {
                const recordData = record.data;

                // Skip new records with generated IDs - they're handled by afterEventSave
                if (`${record.id}`.startsWith('_generated')) {
                    continue;
                }

                const modifiedFields = record.meta?.modified || {};

                if (Object.keys(modifiedFields).length === 0) {
                    continue;
                }

                const bookingUpdates = {};

                // Get travel duration from the travelDuration field (mapped to msdyn_estimatedtravelduration)
                let travelMinutes = null;
                if (recordData?.preamble) {
                    travelMinutes = DateHelper.parseDuration(recordData.preamble).magnitude;
                }

                // Check if any time-related field changed
                const hasTimeChange = 'startDate' in modifiedFields || 'endDate' in modifiedFields || 'duration' in modifiedFields;

                // Build update payload from modified fields
                Object.keys(modifiedFields).forEach(key => {
                    switch (key) {
                        case 'name':
                            bookingUpdates.name = record.name;
                            break;
                        case 'startDate':
                        case 'endDate':
                        case 'duration':
                            // Time fields are handled together below
                            break;
                        case 'resourceId': {
                            // Get the resource ID from the event's resource assignment
                            const resourceId = recordData.Resource?.bookableresourceid || record.resources?.[0]?.id || record.resources?.[0]?.bookableresourceid;
                            if (resourceId) {
                                bookingUpdates['Resource@odata.bind'] = `/bookableresources(${resourceId})`;
                            }
                            break;
                        }
                    }
                });

                // Handle all time fields together when any time field changes
                if (hasTimeChange) {
                    const hasStartChange = 'startDate' in modifiedFields;
                    const hasEndChange = 'endDate' in modifiedFields;

                    if (hasStartChange) {
                        // Calculate starttime by subtracting travel from work start time
                        // Field Service will calculate msdyn_estimatedarrivaltime = starttime + travel
                        const workStartTime = record.startDate;
                        const actualStartTime = new Date(workStartTime.getTime());
                        actualStartTime.setMinutes(actualStartTime.getMinutes() - travelMinutes);

                        bookingUpdates.starttime = actualStartTime.toISOString();
                    }

                    if (hasEndChange) {
                        const workEndTime = record.endDate;
                        const actualEndTime = new Date(workEndTime.getTime());
                        actualEndTime.setMinutes(actualEndTime.getMinutes() - travelMinutes);

                        bookingUpdates.endtime = actualEndTime.toISOString();
                    }
                }

                if (Object.keys(bookingUpdates).length > 0 && recordData.bookableresourcebookingid) {
                    await updateBooking(recordData.bookableresourcebookingid, bookingUpdates);
                }
            }
        }

        updateSavingValue();
    }
    catch (error) {
        console.error('Error syncing to Field Service:', error);
        updateSavingValue('Error', 'red');
        setTimeout(() => updateSavingValue(), 5000);
    }
}