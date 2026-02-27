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
