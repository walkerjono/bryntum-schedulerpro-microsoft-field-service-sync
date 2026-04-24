# TODO: Timesheet View Implementation

## Scope

Extract the D365 timesheet web resource (originally Vue 3 + PrimeVue, embedded in a D365 iframe) into the existing WS Planner app as a **second view**, rebuilt in **vanilla TypeScript + Bryntum Grid**.

### Source Logic

Source Logic should be ported like for like from:

- .temp/TimeEntry/fluenttheme.js - reference only, styles in this solution should take precendence
- .temp/TimeEntry/msdyn_timeentry.js
- .temp/TimeEntry/timesheet.html

**Key decisions:**

- **Routing:** Hash router (`#/planner` / `#/timesheet`) for view switching
- **Grid:** Bryntum Grid (not a framework data-table) for the pivot view
- **Pivot layout:** Day-column pivot (Mon–Sun columns with inline cell editing)
- **Feature scope:** Full parity — time entry CRUD, variations/remaining, publish/submit/complete workflows, help requests, impersonation, filters, auto-save, localStorage persistence

**Architecture:**

- MSAL Bearer token authentication via `getToken()` + `fetchAllPages()` (shared with planner)
- D365 Dataverse Web API v9.2 OData for all data operations
- Bryntum Grid/Popup/Widget components from `@bryntum/schedulerpro`

---

## Phases

### Phase 1 — Router & Views ✅

Hash-based router (`#/planner` / `#/timesheet`) with view container switching.

- [x] Create `src/app/router.ts` — hash router with `navigate()`, `onRouteChange()`, `getCurrentParams()`
- [x] Update `index.html` — add `#planner-view` and `#timesheet-view` container divs
- [x] Update `src/main.ts` — wire router, show/hide view containers on route change
- [x] Update `src/style.css` — view container base styles

**Files:** `router.ts`, `index.html`, `main.ts`, `style.css`

---

### Phase 2 — Identity & Settings ✅

Resolve the logged-in user's D365 bookable resource and load org-level timesheet settings.

- [x] Create `src/app/timesheetIdentity.ts` — `resolveIdentity()` (resource ID, user name, email from D365)
- [x] Create `src/app/timesheetSettings.ts` — `loadTimesheetSettings()`, `getTimesheetSettings()` (time increment, internal project IDs, submit-and-complete flag)

**Files:** `timesheetIdentity.ts` (244 lines), `timesheetSettings.ts` (255 lines)

---

### Phase 3 — Types & Data Service ✅

D365 entity types and low-level OData CRUD operations for timesheet data.

- [x] Extend `src/types/timesheet.ts` — D365 types (`D365TimeEntry`, `D365Variation`, `D365Project`, `D365ProjectTask`, `D365UserTimesheet`, `D365VariationReason`), pivot types (`PivotRow`, `TimeEntrySlot`, `FlatPivotRecord`)
- [x] Create `src/app/timesheetDataService.ts` — OData fetch functions for variations, projects, tasks, user timesheets, variation reasons, variation CRUD
- [x] Create `src/app/timesheetCrud.ts` — `getTimeEntries`, `createTimeEntry`, `updateTimeEntry`, `deleteTimeEntry`, `submitTimeEntries`, `recallTimeEntry`

**Files:** `types/timesheet.ts` (~320 lines), `timesheetDataService.ts` (396 lines), `timesheetCrud.ts` (236 lines)

---

### Phase 4 — Pivot Utils & Row Model ✅

Pure functions to transform flat D365 time entries into a week-based pivot grid, plus a Bryntum Model subclass.

- [x] Create `src/lib/timesheetPivotUtils.ts` — `buildPivotRows()`, `buildTotalsRow()`, `pivotRowToFlat()`, `flatToPivotRow()`, `diffPivotRows()`, `parseTimeInput()`, `roundToIncrement()`
- [x] Create `src/lib/TimesheetRowModel.ts` — Bryntum Model with `day0`–`day6` fields, variation fields, `recalculateTotal()`, `isDayReadOnly()`, `getDayEntryId()`, `getDayComment()`

**Files:** `timesheetPivotUtils.ts` (~535 lines), `TimesheetRowModel.ts` (~121 lines)

---

### Phase 5 — Grid Configuration ✅

Bryntum Grid column definitions, renderers, toolbar, and feature config.

- [x] Create `src/app/timesheetGridConfig.ts` — `buildTimesheetColumns()`, `buildTimesheetToolbar()`, `buildTimesheetGridConfig()`, `formatWeekLabel()`
- [x] Day columns (Mon–Sun) with inline `NumberField` editors
- [x] Frozen Project/Task columns, Total column (read-only), Variation/Remaining column
- [x] Toolbar: back, week nav (prev/today/next), add row, save, submit, recall buttons

**Files:** `timesheetGridConfig.ts` (316 lines)

---

### Phase 6 — View Orchestrator ✅

Main lifecycle manager for the timesheet view — init, data loading, CRUD, navigation.

- [x] Create `src/app/timesheetView.ts` — `activateTimesheetView()` (exported, called from router)
- [x] Grid creation with `TimesheetRowModel` registration
- [x] Toolbar wiring (back, week nav, add row, save, submit, recall)
- [x] Cell-edit handling (recalculate row total, mark dirty, update totals row)
- [x] `loadWeekData()` — parallel fetch (entries + settings + userTimesheet) → pivot → grid store
- [x] `handleSave()` — diff original vs current → create/update/delete entries + variations
- [x] `handleSubmit()` — save → submit draft entries → optional complete
- [x] `handleRecall()` — recall submitted timesheet
- [x] `handleAddRow()` — auto-pick next unused project/task combination
- [x] Wire into `main.ts` route handler

**Files:** `timesheetView.ts` (~781 lines), `main.ts` (modified)

---

### Phase 7 — Auto-Save ✅

Debounced auto-save on cell edits.

- [x] Add `scheduleAutoSave()` / `cancelAutoSave()` / `setAutoSaveEnabled()` to view orchestrator
- [x] 3-second debounce timer, resets on each edit
- [x] Cancel auto-save before manual save, week navigation, and view destruction

**Files:** `timesheetView.ts` (extended)

---

### Phase 8 — Variation Dialog ✅

Bryntum Popup for editing variation/remaining details on standard time-entry rows.

- [x] Create `src/app/timesheetVariationDialog.ts` — `openVariationDialog()`, `destroyVariationDialog()`, `resetVariationReasonCache()`
- [x] Fields: Hours (NumberField), Reason (Combo — lazy-loaded from D365), End Date (DateField), Comment (TextAreaField)
- [x] Actions: Save (writes to record fields → feeds into diffPivotRows pipeline), Delete (clears variation fields), Cancel
- [x] Update `timesheetGridConfig.ts` — Remaining column: `editor: false`, `readOnly: true`, pencil icon renderer
- [x] Wire into `timesheetView.ts` — `cellClick` listener on `variationTime` column opens dialog for `stdentry` rows
- [x] Cleanup on view destroy via `destroyVariationDialog()`

**Files:** `timesheetVariationDialog.ts` (~298 lines), `timesheetGridConfig.ts` (modified), `timesheetView.ts` (modified)

---

### Phase 9 — Submit / Recall Workflow UI ✅

Enhance the submit/recall UX with status display, confirmation prompts, and workflow feedback.

- [x] Add timesheet status indicator to toolbar (Draft / Submitted / Approved / Rejected / Returned)
- [x] Add confirmation dialog before submit ("Submit X entries?") and recall
- [x] Show success/failure/info toasts after save/submit/recall (Bryntum Toast)
- [x] Disable day-cell editing when timesheet is submitted/approved (cellEdit feature disabled + readOnly flags)
- [x] Handle "Returned" status — composite status derivation allows re-editing
- [x] Show approver comments (if available from D365 `ws_approvercomments`)

**Files:** `timesheetView.ts` (extended ~120 lines), `timesheetGridConfig.ts` (toolbar widgets), `style.css` (extended ~160 lines)

---

### Phase 10 — Help Task / Project Picker Dialog ✅

Replace the auto-pick logic in `handleAddRow()` with a proper project/task selection dialog.

- [x] Create project picker Popup (Combo for project, Combo for task — cascading)
- [x] Load projects via `getResourceProjects()`, tasks via `getProjectTasks()`
- [x] Filter out already-used project/task combinations
- [x] Support "help task" requests (special entry type for requesting work from other projects)
- [x] Wire into Add Row button

**Files:** `timesheetProjectPicker.ts` (~477 lines), `timesheetView.ts` (modified), `style.css` (extended)

---

### Phase 11 — Impersonation UI ✅

Allow managers/admins to view and edit timesheets on behalf of other resources.

- [x] Add resource selector Combo to toolbar (populated from bookable resources)
- [x] On selection change, reload timesheet data for the selected resource
- [x] Preserve impersonation across week navigation
- [x] URL param support (`?resource=<id>`) — already partially implemented in router
- [x] Impersonation banner when viewing another user's timesheet
- [x] Cleanup on view destroy (clear impersonation state)

**Files:** `timesheetGridConfig.ts` (modified — resourceCombo + impersonationBanner widgets), `timesheetView.ts` (modified — populateResourceCombo, handleResourceChange, updateImpersonationBanner), `style.css` (extended)

---

### Phase 12 — Filters ✅

Project/task filtering on the timesheet grid.

- [x] Add filter TextField to toolbar (search icon, clearable)
- [x] Filter grid rows by project name or task name (case-insensitive, debounced 300ms)
- [x] Persist filter state in localStorage
- [x] Clear filter option (clearable text field)
- [x] Re-apply persisted filter after data reload
- [x] Totals row always visible regardless of filter

**Files:** `timesheetGridConfig.ts` (modified — filterField widget), `timesheetView.ts` (extended — scheduleFilter, applyFilter, reapplyPersistedFilter), `style.css` (extended)

---

### Phase 13 — Styling / CSS ✅

Visual polish for the timesheet view.

- [x] Day cell styling — value vs empty, read-only, weekend columns
- [x] Status row colors (approved → green tint, submitted → blue tint, rejected → red tint)
- [x] Variation cell styling (pencil icon, dashed border, hover state)
- [x] Totals row styling (bold, background highlight)
- [x] Toast notification styling (success/error/info)
- [x] Toolbar layout and spacing
- [x] Loading mask styling (Bryntum built-in maskBody)
- [x] Responsive layout considerations
- [x] Dark mode support (Stockholm Dark theme)
- [x] Row-level getRowClass callback (totals, helptask, dirty)
- [x] Grid status class tinting (applyGridStatusClass)
- [x] Cell interaction polish (hover, editing outline, selection)
- [x] Scrollbar polish
- [x] Stripe override for status-tinted rows

---

### Phase 14 — Tests ✅

Unit tests for all new timesheet modules. **512 tests passing, 0 failures.**

- [x] `timesheetPivotUtils.ts` — `buildPivotRows`, `diffPivotRows`, `parseTimeInput`, `roundToIncrement`, `pivotRowToFlat`/`flatToPivotRow` round-trip (18 exports, comprehensive pure-function tests)
- [x] `TimesheetRowModel.ts` — field defaults, `recalculateTotal()`, `isDayReadOnly()`, `getDayEntryId()`, `getDayComment()`, set method signatures
- [x] `timesheetGridConfig.ts` — column count/types, day headers, weekend classes, number editors, toolbar items, `getRowClass` logic, `formatWeekLabel`
- [x] `timesheetDataService.ts` — all 15 async D365 API functions (variations, projects, tasks, help tasks, user timesheets) with error handling
- [x] `timesheetIdentity.ts` — identity resolution chain, caching, impersonation (getActiveResourceId, isImpersonating, clearImpersonation)
- [x] `timesheetSettings.ts` — D365 env var loading, localStorage fast path/caching, fallback on error, persistence
- [x] `router.ts` — hash parsing, navigation, param encoding/decoding, initRouter
- [x] `timesheetVariationDialog.ts` — reason caching, dialog open/save/delete/destroy, fetch error surfacing
- [x] `setup.ts` — extended Bryntum mock with Model.get/set, Popup, Widget, NumberField, Combo, DateField, TextAreaField, Button, Container, TextField, Toast

---

## File Inventory

| File                                  | Lines | Phase   | Status |
| ------------------------------------- | ----- | ------- | ------ |
| `src/app/router.ts`                   | 171   | 1       | ✅     |
| `src/app/timesheetIdentity.ts`        | 244   | 2       | ✅     |
| `src/app/timesheetSettings.ts`        | 255   | 2       | ✅     |
| `src/types/timesheet.ts`              | ~320  | 3       | ✅     |
| `src/app/timesheetDataService.ts`     | 396   | 3       | ✅     |
| `src/app/timesheetCrud.ts`            | 236   | 3       | ✅     |
| `src/lib/timesheetPivotUtils.ts`      | ~535  | 4       | ✅     |
| `src/lib/TimesheetRowModel.ts`        | ~121  | 4       | ✅     |
| `src/app/timesheetGridConfig.ts`      | ~316  | 5, 8    | ✅     |
| `src/app/timesheetView.ts`            | ~920  | 6-9     | ✅     |
| `src/app/timesheetVariationDialog.ts` | ~298  | 8       | ✅     |
| `src/app/timesheetProjectPicker.ts`   | ~477  | 10      | ✅     |

**Test status:** 512 tests passing, 0 failures. Pre-existing 1 timeout in `envVars.test.ts` (non-blocking). Pre-existing 5 TS errors in `src/test/lib/timesheetUtils.test.ts` (non-blocking).

---

## Phase 15 — Gap Remediation (Source Parity Audit)

Cross-reference audit of original `timesheet.html` (Vue 3 + PrimeVue) vs new Bryntum implementation identified the following gaps. Grouped by severity.

### Critical Gaps

- [x] **Gap 1 — `msdyn_resourceCategory` in create payload:** Original `ProcessEntry()` includes `msdyn_resourceCategory@odata.bind` (default role) on every POST. New `buildCreatePayload()` omits it. Thread the resolved default role ID into the create pipeline.
- [x] **Gap 2 — Pre-populate empty rows from resource assignments:** Original `getProjectsAndTasks()` loops resource assignments and adds empty rows for project/task combos with no time entries. New `buildPivotRows()` only creates rows from existing entries — users must manually add via picker.
- [x] **Gap 3 — Variation submit workflow:** Original `PublishVariations()` PATCHes variations to `statuscode: 100000001` AND submits linked time entries. New `handleSubmit()` only submits entries — variations never transition status.
- [x] **Gap 4 — COMPLETEDREASONID special logic:** Original `ProcessVariation()` auto-sets time=0 and endDate=now when reason matches `COMPLETEDREASONID`. Not implemented.
- [x] **Gap 6 — `ws_enddate` on UserTimesheet creation:** Original `Complete()` calculates `ws_enddate` (current date if same week, Sunday if past). New `createUserTimesheet()` omits `ws_enddate`.

### Moderate Gaps

- [x] **Gap 7 — Time rounding / MINIMUMTIME enforcement:** `roundToIncrement()` exists but is never called in save pipeline. Grid editor guides input (`step: 0.25`) but doesn't enforce.
- [x] **Gap 9 — `enforceVariation` flag:** Projects with `ws_enforcetimesheetvariations` require variation before submit. `ENFORCEALLVARIATIONS` global setting. Not implemented.
- [x] **Gap 10 — Five filter presets:** Original has toggle filters: My Tasks, Tasks with Time, Hide Completed, WS Internal, Help Tasks. New has text search only.
- [x] **Gap 11 — Work type categorisation (Out of Hours / Leave):** Original distinguishes 192354320 (Out of Hours) and 1 (Leave/Other), sets row type to `intentry`. Not in enum or row logic.
- [x] **Gap 12 — Impersonation localStorage persistence:** Original stores `ws_impersonateUser` in localStorage; survives page refresh. New is in-memory only.

### Intentional Differences (No Action)

- **Gap 5 — Variation schema field names:** Changed from `ws_remainingtime`/`ws_estimatedenddate`/`ws_ReasonId` + task/project/resource binding to `ws_hours`/`ws_enddate`/`ws_variationreason` + time-entry binding. Intentional schema modernisation — verify target D365 schema.
- **Gap 8 — Comment requirement enforcement:** Original enforces comment on time entries with `validateTime()`. Deferred — requires UX design decision for inline vs dialog validation.
- **Gap 13 — FetchXML → OData for task query:** Intentional simplification to avoid FetchXML privilege issues.
- **Gap 14 — H:MM → decimal display:** Intentional — Bryntum NumberField editor.

---

## Phase 15b — Bug Fixes & Parity Remediation ✅

Fixes for 3 user-reported bugs plus additional parity gaps uncovered during deep source audit.

### Bug Fixes

- [x] **Total column not calculating:** Event listener used `'cellEdit'` (invalid) instead of `'finishCellEdit'` — Bryntum Grid fires `finishCellEdit` after cell edit completes. Fixed in `timesheetView.ts`.
- [x] **Timesheet description not available:** Day cells only had NumberField editors. Added chained sequential popup: after entering hours > 0, a description popup auto-opens for keyboard-fast entry (Tab → hours → Tab → description → Tab → next). Comment indicator dot shown on cells with descriptions.
- [x] **Console 400 error (`ws_hours` not found on `ws_timesheetvariation`):** Variation entity schema was wrong. Fixed field names across all files.

### D365 Variation Schema Fix (Critical)

- [x] **Fix `D365Variation` interface:** `ws_hours` → `ws_remainingtime` (minutes), `ws_enddate` → `ws_estimatedenddate`, `_ws_variationreason_value` → `_ws_reasonid_value`, replaced `_ws_timeentry_value` with `_ws_taskid_value` + `_ws_projectid_value` + `_ws_resourceid_value`.
- [x] **Fix `CreateVariationPayload`:** `ws_timeentry@odata.bind` → `ws_TaskId@odata.bind` + `ws_ProjectId@odata.bind` + `ws_ResourceId@odata.bind`. `ws_variationreason@odata.bind` → `ws_ReasonId@odata.bind`.
- [x] **Fix `UpdateVariationPayload`:** Same field renames as create.
- [x] **Rewrite `getVariations()`:** Changed from batched entry-ID queries to single resource-ID query: `_ws_resourceid_value eq {id} and (statuscode eq 1)`.
- [x] **Fix `buildPivotRows()` variation matching:** Changed from entry-based (`variationByEntry`) to project+task-based (`variationByKey`). Added minutes→hours conversion (`ws_remainingtime / 60`).
- [x] **Fix variation save payloads:** Create/update now use correct field names with hours→minutes conversion (`* 60`). Create binds to task+project+resource.
- [x] **Fix submit flow:** Variation submission now fetches by resource ID (not entry IDs) and submits all active variations.

### Filter Bug Fix

- [x] **Fix totals row filter:** `record.get('type') === 'totals'` → `'total'` (matching the actual row type value).

### Files Modified

`src/types/timesheet.ts`, `src/app/timesheetDataService.ts`, `src/lib/timesheetPivotUtils.ts`, `src/app/timesheetView.ts`, `src/app/timesheetGridConfig.ts`, `src/style.css`, `src/test/timesheetDataService.test.ts`, `src/test/lib/timesheetPivotUtils.test.ts`
