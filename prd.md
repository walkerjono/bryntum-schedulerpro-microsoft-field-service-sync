# PRD: WS Planner — Bryntum Scheduler Pro × Dynamics 365 Project Operations Sync

## 1. Overview

WS Planner is a web-based resource scheduling viewer that connects **Bryntum Scheduler Pro** (with a partnered **Resource Histogram**) to **Microsoft Dynamics 365 Project Operations**.
It provides a read-only, interactive timeline of resource assignments pulled live from Dataverse, with hierarchical Practice → Role → Resource grouping, cascading filters, and a dual effort/remaining-effort mode.

It is based on the following [Bryntum Example](https://bryntum.com/blog/how-to-connect-bryntum-scheduler-pro-to-a-microsoft-dynamics-365-field-service-project/)

**Status:** Read-only viewer (no write-back to D365 yet).

---

## 2. Architecture

| Layer         | Technology                                  | Details                                                          |
| ------------- | ------------------------------------------- | ---------------------------------------------------------------- |
| **Frontend**  | Vanilla JS (ES Modules)                     | No framework — direct DOM + Bryntum API                          |
| **Scheduler** | Bryntum Scheduler Pro 7.1.x (trial)         | TreeGroup-based resource store, custom models                    |
| **Histogram** | Bryntum ResourceHistogram                   | Partnered with scheduler; shows allocation bars per resource     |
| **Auth**      | MSAL.js 4.x (`@azure/msal-browser`)         | OAuth2 popup flow via Microsoft Entra ID                         |
| **API**       | Dynamics 365 Dataverse Web API v9.2         | OData REST calls with bearer token                               |
| **Build**     | Vite 7.x                                    | Dev server + bundler, console-forward plugin                     |
| **Styling**   | Bryntum Svalbard Light theme + Poppins font | Custom CSS for inactive events, histogram bars, and current-time |

---

## 3. Authentication

- **Provider:** Microsoft Entra ID (Azure AD) via MSAL.js popup-based login.
- **Token scope:** `https://{orgId}.api.crm6.dynamics.com/.default`
- **Session persistence:** Username stored in `sessionStorage` under key `msalAccount`. On reload, silent token acquisition is attempted first; interactive popup is triggered on `InteractionRequiredAuthError`.
- **Sign-out:** Clears session and triggers MSAL logout popup, then reloads the page.

### Environment Variables (required in `.env`)

| Variable                         | Purpose                                                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `VITE_MICROSOFT_ENTRA_APP_ID`    | Entra app registration client ID                                                                                                                 |
| `VITE_MICROSOFT_ENTRA_TENANT_ID` | Entra tenant ID                                                                                                                                  |
| `VITE_MICROSOFT_DYNAMICS_ORG_ID` | Dynamics 365 org identifier (used in API URL construction)                                                                                       |
| `VITE_USE_EFFORT_REMAINING`      | Default for effort mode (`true` = remaining effort). Can be overridden at runtime via URL param `?useRemainingEffort=true` or the toolbar toggle |

---

## 4. Data Model & D365 Entities

### 4.1 Bookable Resources (`bookableresources`)

Fetched via `getResources()`. Only active resources of type "User" (`statecode eq 0 and resourcetype eq 3`).

| D365 Field              | Scheduler Field | Notes                                                                      |
| ----------------------- | --------------- | -------------------------------------------------------------------------- |
| `bookableresourceid`    | `id`            | Primary key                                                                |
| `name`                  | `name`          | Display name                                                               |
| `ws_workinghours`       | `workingHours`  | Weekly working hours (default 40); drives per-resource calendar generation |
| `ContactId.entityimage` | `imageUrl`      | Base64-encoded avatar from expanded Contact entity                         |

A default "unknown resource" image is fetched from the D365 web resources (`msdyn_/fps/ScheduleBoard/css/images/unknownResource.jpg`) and cached as a fallback when no contact image exists.

### 4.2 Resource Assignments (`msdyn_resourceassignments`)

Fetched via `getAssignments()`. Filtered to active projects (`msdyn_projectid/statecode eq 0`). Represents task assignments (events on the timeline).

| D365 Field                                          | Scheduler Field   | Notes                                                                |
| --------------------------------------------------- | ----------------- | -------------------------------------------------------------------- |
| `msdyn_resourceassignmentid`                        | `id`              | Primary key                                                          |
| `msdyn_start`                                       | `startDate`       | Assignment start                                                     |
| `msdyn_finish`                                      | `endDate`         | Assignment end                                                       |
| `msdyn_effort`                                      | `effort`          | Total effort in hours                                                |
| `msdyn_taskid.msdyn_effortremaining`                | `effortRemaining` | Remaining effort from project task (via `$expand=msdyn_taskid`)      |
| `msdyn_taskid.ws_projecttasknumber`                 | `taskNumber`      | Custom task number field                                             |
| `_msdyn_bookableresourceid_value`                   | `resourceId`      | FK to bookable resource                                              |
| `_msdyn_taskid_value` (formatted)                   | `name`            | Task display name (via OData annotation); falls back to `msdyn_name` |
| `msdyn_projectid.msdyn_subject`                     | `projectName`     | Project name (via `$expand=msdyn_projectid`)                         |
| `msdyn_projectid.ws_projectid`                      | `projectNumber`   | Custom project number field                                          |
| `msdyn_projectid._msdyn_customer_value` (formatted) | `clientName`      | Client/customer name (via OData annotation on expanded project)      |
| `@odata.etag`                                       | `etag`            | Concurrency token (stored for future write-back)                     |

### 4.3 Resource Category Assignments (`bookableresourcecategoryassns`)

Fetched via `getResourcePractices()`. Used to group resources by "Practice" and "Role".
Returns `{ practiceMap, roleMap }` — two `Map<resourceId, string>` lookups.

| D365 Field                     | Mapped To       | Notes                                                         |
| ------------------------------ | --------------- | ------------------------------------------------------------- |
| `_resource_value`              | Resource ID key | Links to bookableresource                                     |
| `ResourceCategory.ws_practice` | Practice name   | Custom field — formatted value preferred via OData annotation |
| `ResourceCategory.name`        | Role name       | Default role/category name; falls back to "Unassigned"        |

Only records where `msdyn_isdefault eq true` are fetched.

---

## 5. Features (Current State)

### 5.1 Hierarchical Resource Grouping (TreeGroup)

Uses Bryntum's built-in **TreeGroup** feature with flat resource data. A single grouping mode:

```text
Practice → Role → Resource (3-level tree)
```

- **Level 1:** Practice groups (from `ws_practice` custom field on bookable resource category)
- **Level 2:** Role groups (from `bookableresourcecategory.name`; "Unassigned" fallback)
- **Level 3 (leaf):** Individual resources

TreeGroup is configured on both the SchedulerPro and the ResourceHistogram with identical levels (`['practiceName', 'roleName']`), keeping both views in sync.

### 5.2 Project Color Coding

A palette of 15 distinct colors is cycled across projects (sorted alphabetically). Colors are applied to event bars on the timeline.

Completed assignments (where `effortRemaining` is `0` or `null`) are rendered with a grey color and diagonal stripe pattern via the `b-inactive` CSS class.

### 5.3 Custom Column Renderers

The Name column (400px, read-only, `htmlEncode: false`) renders context-aware HTML:

**Leaf resource rows** (`nameRenderer`):

- Avatar image (32×32 circle) + name (if `imageUrl` exists)
- Plain name text (fallback)

**TreeGroup parent rows** (`treeGroupParentRenderer`):

- **Practice nodes:** Users icon (`fa-users`) + bold name
- **Role nodes:** Briefcase icon (`fa-briefcase`) + bold name
- **Other parents:** Bold name

### 5.4 Timeline Configuration

| Setting           | Value                                                                       |
| ----------------- | --------------------------------------------------------------------------- |
| View preset       | `weekAndDayLetter`                                                          |
| Start date        | 1st of current month                                                        |
| End date          | ~12 weeks from 1st of current month                                         |
| Visible date      | Today (scrolled to start)                                                   |
| Bar margin        | 5px                                                                         |
| Read-only         | Yes                                                                         |
| Dependencies      | Disabled                                                                    |
| Task edit         | Enabled (read-only context)                                                 |
| Tree feature      | Enabled                                                                     |
| Current time line | Shown (green `#94CA14`, hidden label on scheduler, date label on histogram) |

### 5.5 Resource Histogram

A **ResourceHistogram** is rendered below the scheduler (40% height), partnered with the scheduler for synchronized time axis, zoom, and horizontal scroll.

| Setting         | Value                                                                       |
| --------------- | --------------------------------------------------------------------------- |
| Headers         | Hidden (shared with scheduler)                                              |
| Bar tips        | Shown                                                                       |
| Max effort line | Shown                                                                       |
| Bar text        | Hidden                                                                      |
| Bar coloring    | Green (`#6EE7B7`) when under-allocated, Red (`#F87171`) when over-allocated |
| Current time    | Shown with formatted date label (en-AU)                                     |

Histogram allocation is driven by `units` on AssignmentModel records, calculated as:
`units = (effort / workingHours) * 100` where working hours = weekdays × 8h/day between assignment start and end.

### 5.6 Working-Time Calendars

- **Default calendar (`business`):** Mon–Fri, 08:00–16:00 (8h/day, 40h/week). `unspecifiedTimeIsWorking: false`.
- **Per-resource calendars:** Automatically generated for resources whose `ws_workinghours` ≠ 40. The daily working window is proportionally adjusted (e.g., 32h/week → 08:00–14:24 daily).
- Project-level config: `hoursPerDay: 8`, `daysPerWeek: 5`.

### 5.7 Effort / Remaining Effort Toggle

A **slide toggle** in the toolbar switches between two effort modes:

**Total effort mode** (default):

- Uses `msdyn_effort` from the assignment
- Event start dates use the original D365 `msdyn_start`

**Remaining effort mode:**

- Uses `msdyn_taskid.msdyn_effortremaining` from the project task
- Event start dates are **clamped to today** so remaining effort is spread over future working days only
- Completed assignments (`effortRemaining === 0`) keep their original D365 dates and are not shifted

When toggled, the scheduler recalculates:

1. Event start dates (clamp/restore)
2. Event durations (recalculated in hours)
3. Assignment `units` (recomputed allocation %)
4. URL query parameter `useRemainingEffort`

### 5.8 Event Tooltip

Rich tooltip rendered on event hover:

| Field            | Source                                      |
| ---------------- | ------------------------------------------- |
| Client           | `clientName`                                |
| Project          | `projectNumber: projectName` (or just name) |
| Task             | `taskNumber: name` (or just name)           |
| Start            | Formatted date (en-AU: `Wed, 25 Feb 2026`)  |
| End              | Formatted date (en-AU)                      |
| Effort           | Total effort in hours                       |
| Effort Remaining | Shown only when available                   |

### 5.9 Toolbar

Left-to-right layout:

1. **Refresh button** — Sync icon (`fa-sync`); re-fetches all data from D365, rebuilds stores, and re-applies project colors. Spins icon while loading.
2. **Practice filter** — Multi-select combo (`width: 350`); filters resources by practice. Cascades into Role and Resource filter options.
3. **Role filter** — Multi-select combo (`width: 350`); editable with `*` filter operator for search. Cascades into Resource filter options.
4. **Resource filter** — Multi-select combo (`width: 350`); editable with `*` filter operator for search.
5. **Effort toggle** — Slide toggle labelled "Use Effort Remaining"; toggles remaining-effort mode.
6. **Spacer** — Flex spacer pushing sign-out to the right.
7. **Sign-out button** — Triggers MSAL logout + page reload.

All filter selections and the effort toggle state are **persisted as URL query parameters** (`practice`, `role`, `resource`, `useRemainingEffort`) and restored on page load.

### 5.10 Loading UX

1. Spinner shown on initial page load
2. If no session exists → "Sign in with Microsoft" button shown (centered image link)
3. If session exists → data loads automatically, spinner hidden, scheduler + histogram rendered

---

## 6. File Structure

```text
├── index.html                          # Shell with #app + #histogram containers, sign-in link, loader
├── package.json                        # Dependencies: MSAL, Bryntum (trial), Vite
├── vite.config.ts                      # Vite + console-forward plugin
├── eslint.config.mjs                   # Bryntum-style ESLint rules (aligned colons, 4-space indent)
├── src/
│   ├── main.js                         # App entry: auth gating, data fetch, scheduler + histogram init,
│   │                                   #   calendar generation, filter combos, effort toggle, refresh, URL params
│   ├── auth.js                         # MSAL config, signIn/signOut/getToken
│   ├── crudFunctions.js                # D365 API calls (getResources, getAssignments, getResourcePractices)
│   ├── schedulerproConfig.js           # Scheduler config: columns, features, toolbar, renderers, tooltip
│   ├── histogramConfig.js              # ResourceHistogram config: bar coloring, tree columns, time ranges
│   ├── style.css                       # Bryntum theme imports, Poppins font, loader, inactive events,
│   │                                   #   histogram bar colors, current-time styling
│   └── lib/
│       ├── CustomEventModel.js         # Extends EventModel with D365 field mappings (effort, project, task, client)
│       └── CustomResourceModel.js      # Extends ResourceModel with imageUrl, practiceName, roleName,
│                                       #   workingHours, calendar; also exports loadDefaultImage()
```

---

## 7. Dependencies

| Package                                    | Version | Purpose                           |
| ------------------------------------------ | ------- | --------------------------------- |
| `@bryntum/schedulerpro` (trial)            | ^7.1.3  | Scheduler Pro + ResourceHistogram |
| `@azure/msal-browser`                      | ^4.26.0 | Microsoft Entra ID authentication |
| `vite`                                     | ^7.1.7  | Build tool / dev server           |
| `vite-console-forward-plugin`              | ^2.0.1  | Forward browser logs to terminal  |
| `eslint`                                   | ^9.38.0 | Linting                           |
| `@rollup/wasm-node`                        | ^4.57.1 | Rollup WASM support               |
| `@rollup/rollup-win32-x64-msvc` (optional) | ^4.57.1 | Platform-specific Rollup binary   |

---

## 8. Known Limitations / Not Yet Implemented

1. **No error UI** — API errors logged to console only, no user-facing error states
2. **Trial license** — Currently uses `@bryntum/schedulerpro-trial`
3. **Hardcoded CRM region** — API URLs use `.crm6.dynamics.com` (Australia region)
4. **Hardcoded redirect URI** — MSAL redirect is set to `http://localhost:5173`
5. **No write-back** — All data is read-only; `etag` values are captured for future write-back support
6. **Debug code in API** — `getResources()` contains a commented-out single-resource filter (`TODO: temp limit`)
7. **No tests** — No unit or integration tests
8. **localhost redirect only** — MSAL redirect URI hardcoded to `http://localhost:5173`

## TODO: changes

1. [ ] **Read-only** — No create, update, or delete operations back to D365
1. [ ] **No pagination** — All resources/assignments fetched in a single request (may not scale)
1. [x] **No filtering** — No date range filter, resource search, or project filter
1. [x] Add effort to rollover
1. [x] Add project name to assignment bar
1. [x] today visual indicator
1. [x] Add Practice Filter
1. [ ] Add Exclude MSC filter - TBC on field to use
1. [x] Add grid refresh button
1. [x] add effort remaining from task. display in tooltip, grey out scheduler bars when effort remaining = 0, add page toggle to update historgram between effort/remaining
1. [-] fix histogram fill
1. [-] fix histogram conditional formatting (traffic light)
1. [ ] histogram scale / calendar? showing 7 days
1. [ ] auto-expand when selecting role or resource
