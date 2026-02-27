# How to connect a Bryntum Scheduler Pro project to a Dynamics 365 Field Service project

The code for the complete example app is on the `completed-app` branch.

Please read the [PRD](./prd.md) for current state of the project

**Technology:** This project is built with **TypeScript** for enhanced type safety, better IDE support, and improved code documentation.

## Getting started

The starter repository uses [Vite](https://vitejs.dev/) with TypeScript, which is a development server and JavaScript bundler. You'll need Node.js version 20.19+ for Vite to work.
Install the Vite dev dependency by running the following command:

```sh
npm install
```

Install the Bryntum Scheduler Pro component by first following the [Using Bryntum NPM repository and packages](https://bryntum.com/products/schedulerpro/docs/guide/SchedulerPro/npm-repository) guide to access the private Bryntum repository. Then, install the component. If you have a Bryntum license, use the following command:

```sh
npm install @bryntum/schedulerpro
```

If you're using a Bryntum trial license, use the following command:

```sh
npm install @bryntum/schedulerpro@npm:@bryntum/schedulerpro-trial
```

## Running the app

Run the local dev server using the following command:

```sh
npm run dev
```

You'll see a Bryntum Scheduler Pro with a two resources and two events that are dependent on each other:

![Initial Bryntum Scheduler Pro with example inline data](images/bryntum-schedulerpro.png)

## Testing

The project has **155 unit tests** powered by [Vitest](https://vitest.dev/) with a jsdom environment. All tests are written in TypeScript and mock Bryntum Scheduler Pro and MSAL modules so they run without licences or network access.

### Commands

| Command | Description |
| --- | --- |
| `npm test` | Run tests in watch mode (re-runs on file changes) |
| `npm run test:run` | Single run (CI-friendly) |
| `npm run test:coverage` | Single run with V8 code coverage report |

### Test structure

```text
src/test/
├── setup.ts                        # Global mocks (Bryntum + MSAL)
├── auth.test.ts                    # signIn, getToken (silent + popup), signOut
├── crudFunctions.test.ts           # API calls, pagination, error handling
├── envVars.test.ts                 # Environment variable validation
├── schedulerproConfig.test.ts      # Renderers (name, treeGroupParent, event), tooltip, config shape
├── histogramConfig.test.ts         # getBarClass thresholds, getLeafDescendants, cache behaviour
└── lib/
    ├── schedulingUtils.test.ts     # countWeekdays, computeBufferedRange, clampStartToToday, calcUnits, getProjectColor
    ├── filterUtils.test.ts         # readFilterParams, writeFilterParams, round-trip
    ├── CustomEventModel.test.ts    # Field mappings + convert fallback chains
    └── CustomResourceModel.test.js # Field defaults + loadDefaultImage
```

### Key design decisions

- **TypeScript migration** — All source code migrated from JavaScript to TypeScript, providing full type safety and better IDE support.
- **Type definitions** — Comprehensive type definitions in `src/types/` for Dynamics 365 API responses, Bryntum components, environment variables, and application state.
- **Modular architecture** — Application code organized into logical modules under `src/app/` (auth, crudFunctions, dataLoader, filterManager, schedulerproConfig, histogramConfig, uiSetup, appState) with clear separation of concerns.
- **Pure function extraction** — Scheduling logic (`countWeekdays`, `calcUnits`, etc.) and URL filter utilities were extracted from `main.ts` into `src/lib/schedulingUtils.ts` and `src/lib/filterUtils.ts` so they can be tested without DOM or app-state dependencies.
- **Bryntum mock** — A lightweight stub `Model` class in `src/test/setup.ts` processes Bryntum's `static fields` and `convert` functions, enabling model tests without the commercial library.
- **Environment variables** — A `.env.test` file provides dummy `VITE_*` values so Vitest can import source modules that reference `import.meta.env`.

## Deployment

The app is deployed to **Azure Static Web Apps** via a GitHub Actions workflow. Beyond the GitHub Action itself, the following configuration is required.

### 1. GitHub Actions workflow location

The workflow file must live at **`.github/workflows/deploy.yaml`** (note the leading dot). GitHub will not detect it under `github/`.

### 2. Microsoft Entra ID (Azure AD) app registration

Register an application in the [Azure portal → Entra ID → App registrations](https://portal.azure.com/#view/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/~/RegisteredApps):

1. **Platform** — Add a **Single-page application (SPA)** redirect URI matching your Static Web App URL (e.g. `https://wonderful-forest-009bf5000.azurestaticapps.net`). For local development add `http://localhost:5173`.
2. **API permissions** — Grant the Dynamics 365 scope: `https://{orgId}.api.{crmRegion}.dynamics.com/.default`.
3. **Authentication** — The app uses MSAL popup-based sign-in; no implicit grant or client secrets are needed.

### 3. Environment variables

All configuration is injected at **build time** via Vite `VITE_*` environment variables. Set these as GitHub Actions secrets (or environment variables on the `staging` environment).

#### Required

| Variable | Description |
| --- | --- |
| `VITE_MICROSOFT_ENTRA_APP_ID` | Entra app registration client (application) ID |
| `VITE_MICROSOFT_ENTRA_TENANT_ID` | Entra tenant (directory) ID |
| `VITE_MICROSOFT_DYNAMICS_ORG_ID` | Dynamics 365 organisation subdomain |

#### Optional (have sensible defaults)

| Variable | Default | Description |
| --- | --- | --- |
| `VITE_REDIRECT_URI` | `window.location.origin` | OAuth redirect URI |
| `VITE_CRM_REGION` | `crm6` | Dataverse CRM region (e.g. `crm6` = Australia) |
| `VITE_DATAVERSE_API_VERSION` | `v9.2` | Dataverse Web API version |
| `VITE_ODATA_MAX_PAGES` | `20` | Max OData pages to fetch before stopping |
| `VITE_USE_EFFORT_REMAINING` | `false` | Enable effort-remaining mode |
| `VITE_EFFORT_REMAINING_OFFSET_DAYS` | `7` | Days to offset start date, or `current_week` |
| `VITE_VIEWPORT_BUFFER_DAYS` | `28` | Days to buffer beyond visible viewport for queries |
| `VITE_HOURS_PER_DAY` | `8` | Hours per working day for allocation calc |
| `VITE_DEFAULT_VIEW_MODE` | `day` | Default view preset (`day`, `week`, or `month`) |
| `VITE_UNDERALLOCATED_THRESHOLD` | `80` | Under-allocated percentage threshold |
| `VITE_OVERALLOCATED_THRESHOLD` | `110` | Over-allocated percentage threshold |

Pass them in the workflow build step:

```yaml
- name: Build
  run: npm run build
  env:
    VITE_MICROSOFT_ENTRA_APP_ID: ${{ secrets.VITE_MICROSOFT_ENTRA_APP_ID }}
    VITE_MICROSOFT_ENTRA_TENANT_ID: ${{ secrets.VITE_MICROSOFT_ENTRA_TENANT_ID }}
    VITE_MICROSOFT_DYNAMICS_ORG_ID: ${{ secrets.VITE_MICROSOFT_DYNAMICS_ORG_ID }}
    # add any optional overrides here
```

### 4. GitHub repository secrets

Configure these under **Settings → Secrets and variables → Actions** (or on the `staging` environment):

| Secret | Purpose |
| --- | --- |
| `AZURE_STATIC_WEB_APPS_API_TOKEN_WONDERFUL_FOREST_009BF5000` | Azure SWA deployment token |
| `BRYNTUM_NPM_TOKEN` | Auth token for Bryntum private npm registry |
| `VITE_MICROSOFT_ENTRA_APP_ID` | Build-time env var |
| `VITE_MICROSOFT_ENTRA_TENANT_ID` | Build-time env var |
| `VITE_MICROSOFT_DYNAMICS_ORG_ID` | Build-time env var |

### 5. Static Web App configuration

The [staticwebapp.config.json](./staticwebapp.config.json) is already set up with:

- **SPA fallback** — rewrites all routes to `/index.html`
- **Security headers** — `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`
- **WASM MIME type** — required by the Bryntum engine

No additional changes are needed unless you add an API backend or custom routes.
