# PRD: WS Planner — Bryntum Scheduler Pro × Dynamics 365 Project Operations Sync

## 1. Overview

WS Planner is a web-based resource scheduling viewer that connects **Bryntum Scheduler Pro** (with a partnered **Resource Histogram**) to **Microsoft Dynamics 365 Project Operations**.
It provides a read-only, interactive timeline of resource assignments pulled live from Dataverse, with hierarchical Practice → Role → Resource grouping, cascading filters, and a dual effort/remaining-effort mode.

It is based on the following [Bryntum Example](https://bryntum.com/blog/how-to-connect-bryntum-scheduler-pro-to-a-microsoft-dynamics-365-field-service-project/)

**Status:** Read-only viewer (no write-back to D365 yet).

**Technology:** Fully migrated to TypeScript with comprehensive type definitions for improved type safety, IDE support, and code documentation.

---

## 2. Architecture

| Layer         | Technology                                  | Details                                                          |
| ------------- | ------------------------------------------- | ---------------------------------------------------------------- |
| **Frontend**  | TypeScript (ES Modules)                     | No framework — direct DOM + Bryntum API with full type safety    |
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

| Variable                            | Purpose                                                                                                                                                       | Default                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `VITE_MICROSOFT_ENTRA_APP_ID`       | Entra app registration client ID                                                                                                                              | _(required)_             |
| `VITE_MICROSOFT_ENTRA_TENANT_ID`    | Entra tenant ID                                                                                                                                               | _(required)_             |
| `VITE_MICROSOFT_DYNAMICS_ORG_ID`    | Dynamics 365 org identifier (used in API URL construction)                                                                                                    | _(required)_             |
| `VITE_REDIRECT_URI`                 | MSAL redirect URI after login                                                                                                                                 | `window.location.origin` |
| `VITE_CRM_REGION`                   | D365 CRM region suffix for API URLs (e.g. `crm6` = Australia, `crm` = North America)                                                                          | `crm6`                   |
| `VITE_DATAVERSE_API_VERSION`        | Dataverse Web API version string                                                                                                                              | `v9.2`                   |
| `VITE_USE_EFFORT_REMAINING`         | Default for effort mode (`true` = remaining effort). Can be overridden at runtime via URL param `?useRemainingEffort=true` or the toolbar toggle              | `false`                  |
| `VITE_VIEWPORT_BUFFER_DAYS`         | Days beyond the visible scheduler viewport to pre-fetch assignments. Increase for smoother scrolling, decrease to reduce payload                              | `28`                     |
| `VITE_HOURS_PER_DAY`                | Standard working hours per day (used for allocation % and calendar generation)                                                                                | `8`                      |
| `VITE_EFFORT_REMAINING_OFFSET_DAYS` | When using remaining-effort mode, offset the effective start date. Set a number for days in the past, or `current_week` to snap to Monday of the current week | `7`                      |
| `VITE_DEFAULT_VIEW_MODE`            | Default scheduler zoom level: `day`, `week`, or `month`. Can be overridden at runtime via the toolbar or `?zoom` URL param                                    | `day`                    |
| `VITE_UNDERALLOCATED_THRESHOLD`     | Histogram allocation % below which a bar is considered underallocated (orange)                                                                                | `80`                     |
| `VITE_OVERALLOCATED_THRESHOLD`      | Histogram allocation % above which a bar is considered overallocated (red)                                                                                    | `110`                    |
| `VITE_ODATA_MAX_PAGES`              | Maximum number of OData pagination pages to follow before stopping                                                                                            | `20`                     |

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

### 5.5.1 Histogram Bar Styling Rules

Bars are colored based on allocation percentage, calculated as `(effort / maxEffort) × 100` for each time tick.

| Allocation % | Node type                     | CSS class            | Color              |
| ------------ | ----------------------------- | -------------------- | ------------------ |
| **< 80%**    | Any                           | `b-underallocated`   | Orange (`#FBBF24`) |
| **80–110%**  | Leaf                          | `b-evenly-allocated` | Green (`#6EE7B7`)  |
| **80–110%**  | Parent, all children even     | `b-evenly-allocated` | Green (`#6EE7B7`)  |
| **80–110%**  | Parent, ≥1 child outside band | `b-mixed-state`      | Purple (`#D8B4FE`) |
| **> 110%**   | Any                           | `b-overallocated`    | Red (`#F87171`)    |

- Thresholds are defined as constants: `UNDERALLOCATED_THRESHOLD = 80`, `OVERALLOCATED_THRESHOLD = 110`.
- Parent vs leaf distinction uses `datum.isGroup` (true for TreeGroup aggregate rows).
- Parent rows in the 80–110% band inspect cached leaf-descendant states for the same tick: green if every leaf is also 80–110%, purple if any leaf is under- or over-allocated.
- A **leaf-state cache** is built as leaf bars render. Because parent rows render before children in tree order, main.js schedules a single `histogram.refresh()` after first paint so the second pass sees fully-populated cache. The cache is cleared on data refresh.
- Color is applied both as a CSS class on the bar element and as an inline `fill` style on the SVG `<rect>` to reliably override Bryntum defaults.
- Bars with zero `maxEffort` (no capacity) receive no class or color.

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
├── package.json                        # Dependencies: MSAL, Bryntum (trial), Vite, TypeScript
├── vite.config.ts                      # Vite + Vitest config (jsdom env, setup file)
├── tsconfig.json                       # TypeScript compiler config
├── eslint.config.mjs                   # Bryntum-style ESLint rules (aligned colons, 4-space indent)
├── .env.test                           # Dummy VITE_* env vars for test runner
├── src/
│   ├── main.ts                         # App entry: auth gating, data fetch, scheduler + histogram init,
│   │                                   #   calendar generation, filter combos, effort toggle, refresh, URL params
│   ├── app/
│   │   ├── appState.ts                 # Global application state management
│   │   ├── auth.ts                     # MSAL config, signIn/signOut/getToken
│   │   ├── crudFunctions.ts            # D365 API calls (getResources, getAssignments, getResourcePractices)
│   │   ├── dataLoader.ts               # Data fetching and merging logic
│   │   ├── filterManager.ts            # Filter combo configuration and cascading logic
│   │   ├── schedulerproConfig.ts       # Scheduler config: columns, features, toolbar, renderers, tooltip
│   │   ├── histogramConfig.ts          # ResourceHistogram config: bar coloring, tree columns, time ranges
│   │   └── uiSetup.ts                  # UI initialization and event handlers
│   ├── style.css                       # Bryntum theme imports, Poppins font, loader, inactive events,
│   │                                   #   histogram bar colors, current-time styling
│   ├── lib/
│   │   ├── CustomEventModel.ts         # Extends EventModel with D365 field mappings (effort, project, task, client)
│   │   ├── CustomResourceModel.ts      # Extends ResourceModel with imageUrl, practiceName, roleName,
│   │   │                               #   workingHours, calendar; also exports loadDefaultImage()
│   │   ├── schedulingUtils.ts          # Pure functions: countWeekdays, computeBufferedRange, clampStartToToday,
│   │   │                               #   calcUnits, getProjectColor, resolveRawAssignments, generateCalendars
│   │   └── filterUtils.ts              # URL filter utilities: readFilterParams, writeFilterParams
│   ├── types/
│   │   ├── app.ts                      # Application-level type definitions
│   │   ├── bryntum.d.ts                # Bryntum type augmentations
│   │   ├── d365.ts                     # Dynamics 365 API response types
│   │   └── env.d.ts                    # Environment variable type definitions
│   └── test/
│       ├── setup.ts                    # Global Vitest mocks for Bryntum Scheduler Pro + MSAL
│       ├── auth.test.ts                # Auth module tests (signIn, getToken, signOut)
│       ├── crudFunctions.test.ts       # CRUD/API tests (pagination, error handling)
│       ├── envVars.test.ts             # Environment variable validation tests
│       ├── schedulerproConfig.test.ts  # Renderer tests (nameRenderer, treeGroupParent, eventRenderer, tooltip)
│       ├── histogramConfig.test.ts     # Histogram tests (getBarClass thresholds, getLeafDescendants, cache)
│       └── lib/
│           ├── schedulingUtils.test.ts # 56 tests for pure scheduling functions
│           ├── filterUtils.test.ts     # 19 tests for URL filter round-trip
│           ├── CustomEventModel.test.ts    # 25 tests for field mappings + convert fallback chains
│           └── CustomResourceModel.test.ts # 9 tests for field defaults + loadDefaultImage
```

---

## 7. Dependencies

| Package                                    | Version | Purpose                           |
| ------------------------------------------ | ------- | --------------------------------- |
| `@bryntum/schedulerpro` (trial)            | ^7.1.3  | Scheduler Pro + ResourceHistogram |
| `@azure/msal-browser`                      | ^4.26.0 | Microsoft Entra ID authentication |
| `typescript`                               | ^5.9.3  | TypeScript compiler               |
| `vite`                                     | ^7.1.7  | Build tool / dev server           |
| `vite-console-forward-plugin`              | ^2.0.1  | Forward browser logs to terminal  |
| `eslint`                                   | ^9.38.0 | Linting                           |
| `@rollup/wasm-node`                        | ^4.57.1 | Rollup WASM support               |
| `@rollup/rollup-win32-x64-msvc` (optional) | ^4.57.1 | Platform-specific Rollup binary   |
| `vitest`                                   | ^4.0.18 | Unit test runner (dev)            |
| `@vitest/coverage-v8`                      | ^4.0.18 | V8 code coverage (dev)            |
| `jsdom`                                    | ^28.1.0 | DOM environment for tests (dev)   |

---

## 8. Known Limitations / Not Yet Implemented

1. **No error UI** — API errors logged to console only, no user-facing error states
2. **Trial license** — Currently uses `@bryntum/schedulerpro-trial`
3. **CRM region via env** — API URLs use `VITE_CRM_REGION` (defaults to `crm6` / Australia); set to `crm` for North America etc.
4. **Redirect URI via env** — MSAL redirect URI is configurable via `VITE_REDIRECT_URI` (defaults to `window.location.origin`)
5. **No write-back** — All data is read-only; `etag` values are captured for future write-back support
6. **Debug code in API** — `getResources()` contains a commented-out single-resource filter (`TODO: temp limit`)
7. **No E2E / security tests** — 214 unit tests exist (see [Tests Required](#tests-required)); end-to-end and security tests are not yet implemented

## TODO: changes

1. [ ] **Read-only** — No create, update, or delete operations back to D365
1. [x] **No pagination** — All resources/assignments fetched in a single request (may not scale)
1. [x] **Viewport-based date filtering** — Filter assignments by the visible scheduler date range (± buffer as config) to reduce API payload size and improve load times for large datasets
1. [x] **No filtering** — No date range filter, resource search, or project filter
1. [x] Add effort to rollover
1. [x] Add project name to assignment bar
1. [x] today visual indicator
1. [x] Add Practice Filter
1. [x] Add grid refresh button
1. [x] add effort remaining from task. display in tooltip, grey out scheduler bars when effort remaining = 0, add page toggle to update historgram between effort/remaining
1. [x] fix histogram fill
1. [x] fix histogram conditional formatting (traffic light)
1. [x] histogram scale / calendar? showing 7 days
1. [x] auto-expand when selecting role or resource
1. [x] sarah grant not showing overallocated correctly
1. [ ] add filter/logic for projectTask.DeliveryStatusCode
1. [ ] order assignments logically
1. [x] do we need to consider timezone? or are start/finish date only fields? `msdyn_start` and `msdyn_finish` are date only fields
1. [ ] SWA deployment (x2 environments)
1. [ ] change to AU date format in tooltips, check elsewhere e.g. edit
1. [ ] consider project task dependencies
1. [ ] day, week don't auto scroll to nearest start of week
1. [ ] use bookableresourceid in url paramater to avoid duplicate issue

## Tests Required

### Unit Tests

#### `countWeekdays(start, end)` — [schedulingUtils.ts](src/lib/schedulingUtils.ts)

- [x] Same-day input returns 1 (minimum clamp)
- [x] Span including weekends skips Sat/Sun correctly
- [x] Span entirely within a weekend returns 1
- [x] Multi-week span returns correct weekday count
- [x] Start date after end date — verify behavior

#### `clampStartToToday(date)` — [schedulingUtils.ts](src/lib/schedulingUtils.ts)

- [x] Date in the future returns the original date unchanged
- [x] Date in the past with numeric offset returns today + offset
- [x] `EFFORT_REMAINING_OFFSET_DAYS = 'current_week'` snaps to Monday of current week
- [x] Date already on a Monday vs mid-week — correct Monday snap
- [x] Offset of 0 returns today

#### `calcUnits(effort, effortRemaining, startDate, endDate, resourceId)` — [schedulingUtils.ts](src/lib/schedulingUtils.ts)

- [x] Standard allocation (e.g. 40h over 5 weekdays at 8h/day) returns 100%
- [x] `useRemainingEffort = true` path uses `effortRemaining` instead of `effort`
- [x] `useRemainingEffort = false` path uses `effort`
- [x] `effortRemaining = null` treated as 0 via `?? 0`
- [x] `effortRemaining = 0` returns 0% allocation
- [x] Resource with custom `hoursPerDay` (non-8h) scales correctly
- [x] Resource not in `resourceHoursMap` falls back to default hours

#### `getProjectColor(projectName)` — [schedulingUtils.ts](src/lib/schedulingUtils.ts)

- [x] Same name called twice returns the same color (stable mapping)
- [x] `null` project name returns `'#888'`
- [x] 16+ unique project names wraps around the 15-color palette

#### `computeBufferedRange(start, end)` — [schedulingUtils.ts](src/lib/schedulingUtils.ts)

- [x] Extends start and end by `VIEWPORT_BUFFER_DAYS` in each direction
- [x] Different buffer day values produce correct ranges

#### `resolveRawAssignments()` — [schedulingUtils.ts](src/lib/schedulingUtils.ts)

- [x] Well-formed record produces correct event + assignment objects
- [x] Record with `startDate > endDate` is skipped with console warning
- [x] Record where `effectiveStart > endDate` after clamping sets `effectiveStart = endDate`
- [x] Record with `effortRemaining = 0` uses original D365 dates (not clamped)
- [x] Missing expanded fields (`msdyn_projectid`, `msdyn_taskid`) use null-safe fallbacks
- [x] Duplicate `bookableresourceid` across records produces one assignment per event

#### `CustomEventModel` field converters — [CustomEventModel.ts](src/lib/CustomEventModel.ts)

- [x] `name`: OData formatted value → `msdyn_name` → value → `'Unnamed Assignment'` fallback chain
- [x] `projectName`: expanded `msdyn_subject` → OData annotation → value → `''`
- [x] `effortRemaining`: `msdyn_taskid.msdyn_effortremaining` → value → `null`
- [x] `etag`: escaped double-quote stripping (`\"W/...\"` → `W/...`)
- [x] Each field with missing/null/undefined data at every fallback level

#### `CustomResourceModel` fields — [CustomResourceModel.ts](src/lib/CustomResourceModel.ts)

- [x] `workingHours` defaults to 40 when field is missing/null
- [x] `workingHours = 0` — verify behavior (`|| 40` treats 0 as falsy → falls back to 40; **potential bug** if 0 is a valid value)
- [x] `practiceName` defaults to `'Unassigned'`
- [x] `roleName` defaults to `'Unassigned'`
- [x] `loadDefaultImage()` caches result and is idempotent (second call returns immediately)
- [x] `loadDefaultImage()` silently handles fetch failure (bare `catch {}`)

#### Calendar generation — [schedulingUtils.ts](src/lib/schedulingUtils.ts)

- [x] Resources without `ws_workinghours` use the default `business` calendar (Mon–Fri 08:00–16:00)
- [x] Resources with non-standard `ws_workinghours` (e.g. 32h) get a custom calendar with correct `endTime`
- [x] `ws_workinghours = 40` → 8h/day → `endTime: '16:00'` (08:00 start + 8h)
- [x] `ws_workinghours = 32` → 6.4h/day → fractional end time calculated correctly
- [x] `ws_workinghours = 0` falls back to 40 via `|| 40` (verify this is intentional)

#### Histogram bar coloring — `getBarClass()` — [histogramConfig.ts](src/app/histogramConfig.ts)

- [x] `maxEffort === 0` returns empty string (no class/color)
- [x] Allocation > 110% → `b-overallocated` (red)
- [x] Allocation < 80% → `b-underallocated` (orange)
- [x] Allocation 80–110% on a leaf → `b-evenly-allocated` (green)
- [x] Allocation 80–110% on a parent, all leaves even → `b-evenly-allocated` (green)
- [x] Allocation 80–110% on a parent, mixed leaf states → `b-mixed-state` (purple)
- [x] Custom threshold values from env vars are respected
- [x] Cache is populated on leaf render and hit on subsequent calls

#### `getLeafDescendants(resource)` — [histogramConfig.ts](src/app/histogramConfig.ts)

- [x] Leaf node returns `[self]`
- [x] Parent with 2 levels of nesting returns all leaf descendants
- [x] Parent with no children returns empty array

#### Renderers — [schedulerproConfig.ts](src/app/schedulerproConfig.ts)

- [x] `nameRenderer`: leaf resource with valid `imageUrl` renders `<img>` tag
- [x] `nameRenderer`: leaf resource with no `imageUrl` renders name only (no `<img>`)
- [x] `nameRenderer`: parent node renders without avatar
- [x] `treeGroupParentRenderer`: Practice field renders `fa-users` icon
- [x] `treeGroupParentRenderer`: Role field renders `fa-briefcase` icon
- [x] `eventRenderer`: `effortRemaining == null` → `b-inactive` class applied
- [x] `eventRenderer`: `effortRemaining == 0` → `b-inactive` class applied
- [x] `eventRenderer`: `effortRemaining > 0` → normal rendering (no inactive class)

#### URL parameter round-trip — [filterUtils.ts](src/lib/filterUtils.ts)

- [x] `writeFilterParams()` → `readFilterParams()` produces identical values
- [x] Empty/missing params return correct defaults
- [x] Special characters in filter values survive encode/decode
- [x] `useRemainingEffort` string `'true'`/`'false'` coerces correctly

#### `fetchAllPages()` — [crudFunctions.ts](src/app/crudFunctions.ts)

- [x] Single-page response returns all records
- [x] Response with `@odata.nextLink` follows pagination correctly
- [x] Maximum page limit reached → logs warning, returns partial data
- [x] Non-OK HTTP response → throws with error text and page number
- [x] Empty result set returns empty array

#### Environment variables

- [x] All required `VITE_` variables are validated at startup (or fail gracefully)
- [x] Default values are applied correctly when optional vars are missing
- [x] `VITE_EFFORT_REMAINING_OFFSET_DAYS = 'current_week'` string value handled correctly
- [x] Numeric env vars (`VITE_HOURS_PER_DAY`, thresholds, etc.) parsed as numbers

---

### End-to-End Tests

#### Authentication flow

- [ ] Sign-in happy path: click sign-in → MSAL popup → data loads → scheduler renders
- [ ] Sign-in with popup blocked → graceful handling (currently unhandled)
- [ ] Token expiry mid-session → silent token fails → popup fallback → API call succeeds
- [ ] Sign-out clears session, shows sign-in link, hides content
- [ ] Return visit with valid `sessionStorage('msalAccount')` → auto-loads without sign-in click

#### Initial data loading

- [ ] Resources, assignments, and practices fetched in parallel → scheduler renders with correct Practice → Role → Resource tree
- [ ] Empty dataset (no resources/assignments) → scheduler renders empty without errors
- [ ] Partial API failure (`getResourcePractices()` fails) → app continues with "Unassigned" groups
- [ ] `loadDefaultImage()` failure → app continues without default avatar

#### Viewport-based incremental loading

- [ ] Scroll right past buffer → `fetchAndMergeRange()` fires → new events appear
- [ ] Rapid scrolling → only one fetch fires (400ms debounce)
- [ ] Concurrent fetch prevention → `_viewportFetchInFlight` lock blocks overlapping fetches
- [ ] Scroll back to previously-loaded range → no duplicate events (dedup on merge)

#### Filtering

- [ ] Practice filter selection → Role combo updates to matching roles → Resource combo updates accordingly
- [ ] Role filter selection → Resource combo shows only resources in selected roles
- [ ] Resource filter selection → only matching resources shown in scheduler
- [ ] Clear all filters → full dataset visible
- [ ] Filter cascading: select Practice A → select Role → change Practice to B → Role filter resets if role not in B
- [ ] URL persistence: apply filters → reload page → same filters restored
- [ ] Auto-expand: filtered tree auto-expands to reveal matching resources

#### Effort toggle

- [ ] Toggle remaining effort ON → events recalculate with clamped start dates and remaining effort hours
- [ ] Toggle remaining effort OFF → events revert to original D365 dates and total effort
- [ ] Toggle state persisted in URL → reload → same state
- [ ] Events with `effortRemaining = null` marked inactive regardless of toggle state

#### Zoom presets

- [ ] Day/Week/Month buttons each change the view preset correctly
- [ ] Zoom selection persisted in URL → reload → same zoom level
- [ ] Histogram time axis syncs with scheduler after zoom change

#### Refresh

- [ ] Refresh button: spinner animates → all data re-fetched → stores rebuilt → filters preserved
- [ ] Refresh button disabled during loading (prevents double-click)

#### Histogram

- [ ] Histogram bars render with heights matching allocation percentages
- [ ] Over-allocated resource → red bar
- [ ] Under-allocated resource → orange bar
- [ ] Evenly-allocated resource → green bar
- [ ] Mixed parent node → purple bar when children have different allocation states
- [ ] Expanding/collapsing tree groups updates histogram correctly

---

### Security Tests

#### XSS

- [ ] **`htmlEncode: false` in `nameRenderer`** ([schedulerproConfig.ts](src/app/schedulerproConfig.ts)) — inject `<script>alert(1)</script>` as a resource name → verify it does NOT execute (**known vulnerability** — D365 data rendered as raw HTML)
- [ ] Tooltip template with D365-sourced project/client/task names → verify HTML entities are escaped
- [ ] URL filter parameters with malicious `practice`, `role`, or `resource` values → verify no injection when rendered in combo boxes

#### Token / credential handling

- [ ] Bearer tokens are NOT logged in any `console.error` / `console.warn` calls
- [ ] Only `msalAccount` (username) is stored in `sessionStorage`, never the access token
- [ ] MSAL token scope is limited to `{orgId}.api.{crmRegion}.dynamics.com/.default` (no excessive permissions)

#### Headers & transport

- [ ] `X-Frame-Options: DENY` header served (clickjacking protection) — configured in [staticwebapp.config.json](staticwebapp.config.json)
- [ ] `X-Content-Type-Options: nosniff` header served
- [ ] `Referrer-Policy: strict-origin-when-cross-origin` header served — mitigates cross-origin URL param leakage

#### Information leakage

- [ ] All `VITE_` env vars embedded in client bundle contain no secrets (only semi-public app/tenant/org IDs)
- [ ] Filter values in URL query params (practice/role/resource names) — acceptable per data classification? Could leak in browser history, shared URLs, Referer headers
- [ ] D365 API `$select` clauses do not over-fetch sensitive PII fields

#### Session management

- [ ] `sessionStorage('msalAccount')` cannot be pre-set by an attacker to hijack another user's session (session fixation)
- [ ] Session is fully cleared on sign-out (no stale tokens or account references remain)
