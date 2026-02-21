# PRD: WS Planner — Bryntum Scheduler Pro × Dynamics 365 Field Service Sync

## 1. Overview

WS Planner is a web-based resource scheduling viewer that connects **Bryntum Scheduler Pro** to **Microsoft Dynamics 365 Project Operations**.
It provides a read-only, interactive Gantt-style timeline of resource assignments pulled live from Dataverse, with flexible hierarchical grouping modes.

It is based on the following [Bryntum Example](https://bryntum.com/blog/how-to-connect-bryntum-scheduler-pro-to-a-microsoft-dynamics-365-field-service-project/)

**Status:** Read-only viewer (no write-back to D365 yet).

---

## 2. Architecture

| Layer         | Technology                                  | Details                                      |
| ------------- | ------------------------------------------- | -------------------------------------------- |
| **Frontend**  | Vanilla JS (ES Modules)                     | No framework — direct DOM + Bryntum API      |
| **Scheduler** | Bryntum Scheduler Pro 7.1.x (trial)         | Tree-based resource store, custom models     |
| **Auth**      | MSAL.js 4.x (`@azure/msal-browser`)         | OAuth2 popup flow via Microsoft Entra ID     |
| **API**       | Dynamics 365 Dataverse Web API v9.2         | OData REST calls with bearer token           |
| **Build**     | Vite 7.x                                    | Dev server + bundler, console-forward plugin |
| **Styling**   | Bryntum Svalbard Light theme + Poppins font | Custom CSS for event buffers and avatars     |

---

## 3. Authentication

- **Provider:** Microsoft Entra ID (Azure AD) via MSAL.js popup-based login.
- **Token scope:** `https://{orgId}.api.crm6.dynamics.com/.default`
- **Session persistence:** Username stored in `sessionStorage` under key `msalAccount`. On reload, silent token acquisition is attempted first; interactive popup is triggered on `InteractionRequiredAuthError`.
- **Sign-out:** Clears session and triggers MSAL logout popup, then reloads the page.

### Environment Variables (required in `.env`)

| Variable                         | Purpose                                                    |
| -------------------------------- | ---------------------------------------------------------- |
| `VITE_MICROSOFT_ENTRA_APP_ID`    | Entra app registration client ID                           |
| `VITE_MICROSOFT_ENTRA_TENANT_ID` | Entra tenant ID                                            |
| `VITE_MICROSOFT_DYNAMICS_ORG_ID` | Dynamics 365 org identifier (used in API URL construction) |

---

## 4. Data Model & D365 Entities

### 4.1 Bookable Resources (`bookableresources`)

Fetched via `getResources()`. Represents people/technicians.

| D365 Field              | Scheduler Field | Notes                                              |
| ----------------------- | --------------- | -------------------------------------------------- |
| `bookableresourceid`    | `id`            | Primary key                                        |
| `name`                  | `name`          | Display name                                       |
| `ContactId.entityimage` | `imageUrl`      | Base64-encoded avatar from expanded Contact entity |

A default "unknown resource" image is fetched from the D365 web resources (`msdyn_/fps/ScheduleBoard/css/images/unknownResource.jpg`) and cached as a fallback when no contact image exists.

### 4.2 Resource Assignments (`msdyn_resourceassignments`)

Fetched via `getAssignments()`. Represents task assignments (events on the timeline).

| D365 Field                           | Scheduler Field | Notes                                            |
| ------------------------------------ | --------------- | ------------------------------------------------ |
| `msdyn_resourceassignmentid`         | `id`            | Primary key                                      |
| `msdyn_start`                        | `startDate`     | Assignment start                                 |
| `msdyn_finish`                       | `endDate`       | Assignment end                                   |
| `msdyn_effort`                       | `effort`        | Effort in hours                                  |
| `_msdyn_bookableresourceid_value`    | `resourceId`    | FK to bookable resource                          |
| `_msdyn_taskid_value` (formatted)    | `name`          | Task display name (via OData annotation)         |
| `_msdyn_projectid_value` (formatted) | `projectName`   | Project display name (via OData annotation)      |
| `@odata.etag`                        | `etag`          | Concurrency token (stored for future write-back) |

### 4.3 Resource Category Assignments (`bookableresourcecategoryassns`)

Fetched via `getResourcePractices()`. Used to group resources by "Practice".

| D365 Field                     | Mapped To       | Notes                                                         |
| ------------------------------ | --------------- | ------------------------------------------------------------- |
| `_resource_value`              | Resource ID key | Links to bookableresource                                     |
| `ResourceCategory.ws_practice` | Practice name   | Custom field — formatted value preferred via OData annotation |

Only records where `msdyn_isdefault eq true` are fetched.

---

## 5. Features (Current State)

### 5.1 Hierarchical Resource Grouping (Toggle)

Two grouping modes, switchable via a toolbar toggle button:

**Resource-first mode** (default):

```text
Practice → Resource → Project (3-level tree)
```

- Top-level: Practice groups (from `ws_practice` custom field)
- Mid-level: Individual resources (with avatar)
- Leaf-level: Project sub-rows (color-coded dot)

**Project-first mode:**

```text
Project → Resource (2-level tree)
```

- Top-level: Project groups (color-coded dot)
- Leaf-level: Individual resources (with avatar)

Synthetic leaf node IDs use the format `{parentKey}____{childKey}` to encode both grouping dimensions. Events are remapped to these synthetic IDs during tree construction.

### 5.2 Project Color Coding

A palette of 15 distinct colors is cycled across projects. Colors are applied to:

- Event bars on the timeline
- Project indicator dots in the tree column
- Both grouping modes consistently

### 5.3 Custom Tree Column Renderer

The Name column (400px, read-only) renders context-aware HTML:

- **Practice nodes:** Users icon (`fa-users`) + bold name
- **Resource parents:** Avatar image (32×32 circle) + bold name
- **Project parents:** Color dot + bold name
- **Project leaves:** Color dot + regular name
- **Resource leaves:** Avatar + regular name

### 5.4 Timeline Configuration

| Setting      | Value                       |
| ------------ | --------------------------- |
| View preset  | `weekAndDay`                |
| Time range   | Rolling 14 days from today  |
| Bar margin   | 5px                         |
| Read-only    | Yes                         |
| Dependencies | Disabled                    |
| Task edit    | Enabled (read-only context) |
| Tree feature | Enabled                     |

### 5.5 Toolbar

- **Group toggle button:** Toggleable button with sitemap icon, switches between "Group by: Resource" and "Group by: Project"
- **Sign-out button:** Right-aligned, triggers MSAL logout + page reload

### 5.6 Loading UX

1. Spinner shown on initial page load
2. If no session exists → "Sign in with Microsoft" button shown
3. If session exists → data loads automatically, spinner hidden, scheduler rendered

---

## 6. File Structure

```text
├── index.html                          # Shell with #app container, sign-in link, loader
├── package.json                        # Dependencies: MSAL, Bryntum (trial), Vite
├── vite.config.ts                      # Vite + console-forward plugin
├── eslint.config.mjs                   # Bryntum-style ESLint rules (aligned colons, 4-space indent)
├── src/
│   ├── main.js                         # App entry: auth gating, data fetch, scheduler init, regrouping
│   ├── auth.js                         # MSAL config, signIn/signOut/getToken
│   ├── crudFunctions.js                # D365 API calls (getResources, getAssignments, getResourcePractices)
│   ├── schedulerproConfig.js           # Scheduler config: columns, features, toolbar, renderer
│   ├── style.css                       # Bryntum theme imports, Poppins font, loader, event buffer styles
│   └── lib/
│       ├── buildResourceTree.js        # Tree builder: 2 modes, synthetic leaf IDs, color mapping
│       ├── CustomEventModel.js         # Extends EventModel with D365 field mappings
│       └── CustomResourceModel.js      # Extends ResourceModel with avatar + tree grouping fields
```

---

## 7. Dependencies

| Package                         | Version | Purpose                           |
| ------------------------------- | ------- | --------------------------------- |
| `@bryntum/schedulerpro` (trial) | ^7.1.3  | Scheduler Pro component           |
| `@azure/msal-browser`           | ^4.26.0 | Microsoft Entra ID authentication |
| `vite`                          | ^7.1.7  | Build tool / dev server           |
| `vite-console-forward-plugin`   | ^2.0.1  | Forward browser logs to terminal  |
| `eslint`                        | ^9.38.0 | Linting                           |
| `@rollup/wasm-node`             | ^4.57.1 | Rollup WASM support               |

---

## 8. Known Limitations / Not Yet Implemented

1. **Read-only** — No create, update, or delete operations back to D365
1. **No pagination** — All resources/assignments fetched in a single request (may not scale)
1. **No filtering** — No date range filter, resource search, or project filter
1. **No error UI** — API errors logged to console only, no user-facing error states
1. **Trial license** — Currently uses `@bryntum/schedulerpro-trial`
1. **Hardcoded CRM region** — API URLs use `.crm6.dynamics.com` (Australia region)
1. **No tests** — No unit or integration tests
1. **localhost redirect only** — MSAL redirect URI hardcoded to `http://localhost:5173`
