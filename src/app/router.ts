/**
 * Lightweight hash-based router for view switching.
 *
 * Two routes:
 *   #/planner   — Scheduler Pro + Histogram (default)
 *   #/timesheet — Full-page Bryntum Grid timesheet view
 *
 * Query parameters are preserved across navigations:
 *   #/timesheet?resource={id}&week={YYYY-MM-DD}
 *
 * The router simply shows/hides the two view containers and
 * invokes registered callbacks so each view can initialise lazily.
 */

// ── Types ───────────────────────────────────────────────────────────

export type Route = 'planner' | 'timesheet';

export interface RouteParams {
    resource?: string;
    week?: string;
    [key: string]: string | undefined;
}

export interface RouteChangeEvent {
    route: Route;
    params: RouteParams;
    previousRoute: Route | null;
}

type RouteHandler = (event: RouteChangeEvent) => void | Promise<void>;

// ── State ───────────────────────────────────────────────────────────

let currentRoute: Route | null = null;
const handlers: RouteHandler[] = [];

// ── DOM container IDs ───────────────────────────────────────────────

const VIEW_CONTAINERS: Record<Route, string[]> = {
    planner   : ['app', 'histogram'],
    timesheet : ['timesheet-view']
};

// ── Parsing ─────────────────────────────────────────────────────────

/**
 * Parse the current `window.location.hash` into a route + params.
 */
export function parseHash(hash: string = window.location.hash): { route: Route; params: RouteParams } {
    const cleaned = hash.replace(/^#\/?/, '');
    const [path, queryString] = cleaned.split('?');

    const route: Route = path === 'timesheet' ? 'timesheet' : 'planner';

    const params: RouteParams = {};
    if (queryString) {
        const searchParams = new URLSearchParams(queryString);
        searchParams.forEach((value, key) => {
            params[key] = value;
        });
    }

    return { route, params };
}

// ── Navigation ──────────────────────────────────────────────────────

/**
 * Navigate to a route. Updates the hash and triggers view switching.
 */
export function navigate(route: Route, params: RouteParams = {}): void {
    const queryString = Object.entries(params)
        .filter(([, v]) => v != null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v!)}`)
        .join('&');

    const hash = `#/${route}${queryString ? `?${queryString}` : ''}`;

    if (window.location.hash !== hash) {
        window.location.hash = hash;
        // hashchange listener will handle the rest
    }
    else {
        // Same hash — still apply (e.g. refresh)
        applyRoute();
    }
}

// ── View switching ──────────────────────────────────────────────────

function showContainers(ids: string[]): void {
    for (const id of ids) {
        const el = document.getElementById(id);
        if (el) el.style.display = 'flex';
    }
}

function hideContainers(ids: string[]): void {
    for (const id of ids) {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    }
}

function applyRoute(): void {
    const { route, params } = parseHash();
    const previousRoute = currentRoute;

    // Skip if nothing changed and we've already initialised
    if (route === currentRoute) return;

    currentRoute = route;

    // Hide all view containers, then show route's containers
    for (const [, containerIds] of Object.entries(VIEW_CONTAINERS)) {
        hideContainers(containerIds);
    }
    showContainers(VIEW_CONTAINERS[route]);

    // Notify registered handlers
    const event: RouteChangeEvent = { route, params, previousRoute };
    for (const handler of handlers) {
        try {
            handler(event);
        }
        catch (err) {
            console.error('[router] Handler error:', err);
        }
    }
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Register a callback for route changes.
 */
export function onRouteChange(handler: RouteHandler): void {
    handlers.push(handler);
}

/**
 * Get the current active route.
 */
export function getCurrentRoute(): Route | null {
    return currentRoute;
}

/**
 * Get the current route params.
 */
export function getCurrentParams(): RouteParams {
    return parseHash().params;
}

/**
 * Initialise the router — listens for `hashchange` and applies the
 * initial route. Call once after DOM is ready.
 */
export function initRouter(): void {
    window.addEventListener('hashchange', () => applyRoute());

    // If no hash set, default to planner
    if (!window.location.hash || window.location.hash === '#' || window.location.hash === '#/') {
        window.location.hash = '#/planner';
    }
    else {
        applyRoute();
    }
}
