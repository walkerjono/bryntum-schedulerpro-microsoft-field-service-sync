import { getToken } from './auth.js';

const orgUrl = `https://${import.meta.env.VITE_MICROSOFT_DYNAMICS_ORG_ID}.api.crm6.dynamics.com`;
const apiVersion = 'v9.2';

export async function getResources() {
    const token = await getToken();

    const response = await fetch(
        `${orgUrl}/api/data/${apiVersion}/bookableresources?` +
        `$select=bookableresourceid,name&` +
        `$expand=ContactId($select=contactid,entityimage)`,
        {
            headers : {
                'Authorization'    : `Bearer ${token}`,
                'Accept'           : 'application/json',
                'OData-MaxVersion' : '4.0',
                'OData-Version'    : '4.0'
            }
        }
    );

    if (!response.ok) {
        throw new Error(`Failed to fetch resources: ${response.statusText}`);
    }

    return await response.json();
}

export async function getBookings() {
    const token = await getToken();

    const response = await fetch(
        `${orgUrl}/api/data/${apiVersion}/bookableresourcebookings?` +
        `$select=bookableresourcebookingid,name,starttime,endtime,duration,msdyn_estimatedtravelduration,msdyn_estimatedarrivaltime&` +
        `$expand=Resource($select=bookableresourceid)`,
        {
            headers : {
                'Authorization'    : `Bearer ${token}`,
                'Accept'           : 'application/json',
                'OData-MaxVersion' : '4.0',
                'OData-Version'    : '4.0'
            }
        }
    );

    if (!response.ok) {
        const errorText = await response.text();
        console.error('Bookings API Error:', errorText);
        throw new Error(`Failed to fetch bookings: ${response.statusText}`);
    }

    return await response.json();
}

export async function createBooking(bookingData) {
    const token = await getToken();

    const response = await fetch(
      `${orgUrl}/api/data/${apiVersion}/bookableresourcebookings`,
      {
          method  : 'POST',
          headers : {
              'Authorization'    : `Bearer ${token}`,
              'Content-Type'     : 'application/json',
              'OData-MaxVersion' : '4.0',
              'OData-Version'    : '4.0',
              'Prefer'           : 'return=representation'
          },
          body : JSON.stringify(bookingData)
      }
    );

    if (!response.ok) {
        throw new Error(`Failed to create booking: ${response.statusText}`);
    }

    return await response.json();
}

export async function updateBooking(bookingId, updates) {
    // Safety check: don't try to update records that haven't been created yet
    if (`${bookingId}`.startsWith('_generated')) {
        console.error('Cannot update booking with generated ID:', bookingId);
        throw new Error('Cannot update a booking that has not been created in D365. Use createBooking instead.');
    }

    const token = await getToken();

    const response = await fetch(
        `${orgUrl}/api/data/${apiVersion}/bookableresourcebookings(${bookingId})`,
        {
            method  : 'PATCH',
            headers : {
                'Authorization'    : `Bearer ${token}`,
                'Content-Type'     : 'application/json',
                'Accept'           : 'application/json',
                'OData-MaxVersion' : '4.0',
                'OData-Version'    : '4.0'
            },
            body : JSON.stringify(updates)
        }
    );

    if (!response.ok) {
        const errorText = await response.text();
        console.error('Update booking failed:', response.status, errorText);
        throw new Error(`Failed to update booking: ${response.status} ${response.statusText}`);
    }
}

export async function deleteBooking(bookingId) {
    // Don't try to delete records that were never created
    if (`${bookingId}`.startsWith('_generated')) {
        return;
    }

    const token = await getToken();

    const response = await fetch(
        `${orgUrl}/api/data/${apiVersion}/bookableresourcebookings(${bookingId})`,
        {
            method  : 'DELETE',
            headers : {
                'Authorization'    : `Bearer ${token}`,
                'OData-MaxVersion' : '4.0',
                'OData-Version'    : '4.0'
            }
        }
    );

    if (!response.ok) {
        throw new Error(`Failed to delete booking: ${response.statusText}`);
    }
}
