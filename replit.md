# EquationPath

EquationPath checks and solves supported first-order differential equations, visualizes solution curves and fits observations. All mathematical computation runs inside the browser.

## Run and operate

- `pnpm install` — install workspace dependencies.
- `pnpm dev` — prepare bundled math assets and start the frontend on port 5173.
- `pnpm build` — typecheck and build the static app into `artifacts/equationpath/dist/public`.
- `pnpm preview` — preview the static production app.
- `pnpm test` — CSV and notation regression tests.
- `pnpm test:e2e` — real browser computations, workflows and responsive checks.
- `pnpm --filter @workspace/api-spec run codegen` — regenerate contracts after schema changes.

No backend process, Python installation, DATABASE_URL, external API or account is required to use the application.

## Architecture

- React, Vite, TypeScript and Tailwind retain the original EquationPath interface; Plotly renders interactive graphs and KaTeX renders equations.
- A WebAssembly worker runs repository-owned SymPy, NumPy and SciPy algorithms.
- Math runtime assets are bundled locally and SHA-256 verified during preparation. No CDN or external API is contacted during calculations.
- Generated client hooks dispatch to the local worker with generated Zod request validation.
- CSV data and calculation history are stored in the browser.
- Original Express/FastAPI adapters remain optional development tools. The frontend does not call them.

## Project map and scope

- `artifacts/equationpath/src/App.tsx` — solver, examples, guide and navigation.
- `artifacts/equationpath/src/components/` — visualizer, fitting, practice and notation.
- `artifacts/equationpath/src/lib/` — local worker transport, WebAssembly loader, CSV and state utilities.
- `artifacts/equationpath/backend/app/` — repository-owned SymPy/NumPy/SciPy computation modules bundled into Pyodide; optional FastAPI adapter.
- `artifacts/equationpath/datasets/` — synthetic CSV datasets and curated practice equations.
- `lib/api-spec/`, `lib/api-client-react/`, `lib/api-zod/` — contracts and generated hooks/validators.
- `artifacts/api-server/` — optional Express adapter, unused by the shipped app.

See README.md for source paths, exact startup commands, mathematical assumptions, data limits and optional native regression testing. See DEVELOPMENT_SUMMARY.md for implementation and validation details.

## User preference

The application must run entirely in the browser, without a separate backend or Python installation.
