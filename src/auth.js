import {
    PublicClientApplication,
    InteractionRequiredAuthError
} from '@azure/msal-browser';

const msalConfig = {
    auth : {
        clientId  : import.meta.env.VITE_MICROSOFT_ENTRA_APP_ID,
        authority : `https://login.microsoftonline.com/${
    import.meta.env.VITE_MICROSOFT_ENTRA_TENANT_ID
  }`,
        redirectUri : import.meta.env.VITE_REDIRECT_URI || window.location.origin
    }
};

// Initialize a PublicClientApplication object.
const msalInstance =
  await PublicClientApplication.createPublicClientApplication(msalConfig);
const crmRegion = import.meta.env.VITE_CRM_REGION || 'crm6';
const msalRequest = { scopes : [`https://${
    import.meta.env.VITE_MICROSOFT_DYNAMICS_ORG_ID
  }.api.${crmRegion}.dynamics.com/.default`] };

// Log the user in
export async function signIn() {
    console.log('[auth] Opening login popup…');
    const authResult = await msalInstance.loginPopup(msalRequest);
    sessionStorage.setItem('msalAccount', authResult.account.username);
    console.log('[auth] Signed in as', authResult.account.username);
}

export async function getToken() {
    const account = sessionStorage.getItem('msalAccount');
    if (!account) {
        throw new Error(
            'User info cleared from session storage. Please sign out and sign in again.'
        );
    }
    try {
        // First, attempt to get the token silently
        const silentRequest = {
            scopes  : msalRequest.scopes,
            account : msalInstance.getAccountByUsername(account)
        };
        const silentResult = await msalInstance.acquireTokenSilent(silentRequest);
        return silentResult.accessToken;
    }
    catch (silentError) {
        // If silent request fails with InteractionRequiredAuthError,
        // attempt to get the token interactively
        if (silentError instanceof InteractionRequiredAuthError) {
            const interactiveResult = await msalInstance.acquireTokenPopup(
                msalRequest
            );
            return interactiveResult.accessToken;
        }
        else {
            throw silentError;
        }
    }
}

export async function signOut() {
    const account = sessionStorage.getItem('msalAccount');
    if (account) {
        const logoutRequest = {
            account : msalInstance.getAccountByUsername(account)
        };
        await msalInstance.logoutPopup(logoutRequest);
        sessionStorage.removeItem('msalAccount');
    }
}