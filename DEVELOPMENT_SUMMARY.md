# EquationPath development summary

## Final architecture

The user's follow-up requirement replaces the original multi-service runtime: **the delivered web application runs entirely in the browser**. React calls the generated request interface, which validates the input and dispatches it to a WebAssembly worker. The same repository-owned SymPy/NumPy/SciPy algorithms run there. No Express/FastAPI process, local Python installation or external API is used by the application.

`pnpm dev` starts only the frontend. `pnpm build` creates a static application including the math runtime assets. Dependency preparation downloads versioned wheels once and verifies their SHA-256 hashes against the Pyodide lockfile. Subsequent computations load bundled files from the app's own origin.

## Repository history inspected

- PR #1 and PR #2 were already merged into `main`.
- PR #3 was open. Work started on `development/equationpath-complete` from its numerical-fitting implementation instead of duplicating that feature.
- During implementation PR #3 received a separate deployment change adding an external API base URL. That approach is superseded by the user's explicit browser-only requirement; this implementation does not require `VITE_API_BASE_URL`.

## Preserved

- EquationPath's existing dark scientific-dashboard identity, seven modules, sidebar, responsive structure and existing UI components.
- React/Vite/TypeScript, Tailwind, generated contracts/hooks and Plotly.
- Exactness checks, verified exact potentials and x/y integrating-factor tests.
- The three analytical fitting families, synthetic sample datasets, CSV case handling and residual metrics.
- PR #3's general initial-value-fitting workflow, improved and shared with plotting.
- Original optional HTTP adapters remain in the repository for development compatibility; the shipped frontend does not call them.

## Implemented and corrected

- Browser-only worker with locally bundled Pyodide, SymPy, NumPy and SciPy; no runtime CDN requests or remote font requirement.
- Computation progress, serialized requests, numerical work budgets, a worker timeout and restart after failure.
- Parser validation before evaluation, rational decimal parsing, caret normalization, finite-expression checks, exponent/nesting/literal limits and rejection of Python syntax.
- Original-domain tracking through cancellations such as `x/x`, real-domain conditions and explicit integrating-factor exclusions.
- Constant one-variable integrating-factor ratios, verified transformed equations and computed KaTeX derivations.
- A shared numerical branch solver that rejects invalid domains, denominator crossings, integration failures and non-finite predictions instead of inventing replacement slopes.
- Correct initial-point handling at both interval boundaries and observation coordinates extremely close to x₀.
- Local y₀ fitting with user bounds, an initial-branch check, convergence/sensitivity checks, finite metrics and useful failure messages.
- Verified-potential contour meshes, masked undefined regions and detected denominator crossings, separate level-set components and normalized direction fields.
- Solver transfer of equation expressions, classification, potential, method, restrictions and initial values to visualization and fitting.
- KaTeX preview and computed notation; solution JSON export.
- Multiple retained datasets, original CSV preservation/export, quoted CSV and escaped-quote handling, case selection, BOM/CRLF handling, duplicate/header/row/size validation and safe prototype-like case IDs.
- Four fitting plots: theoretical reference comparison, fitted comparison, residuals and observed-versus-predicted scatter; row-level result export and undergraduate metric explanations.
- State preservation across module switches, stale-result invalidation, truthful verification/history labels and calculation history.
- Recomputed worked examples, additional least-squares/metric/domain guide content and Windows startup instructions.
- OpenAPI definitions, generated clients and validators for numerical fitting, contour meshes, explicit comparison rows and metrics.
- Cross-platform package scripts and native dependency configuration; frontend defaults without environment-variable requirements.

## Main files changed

| Area | Files |
| --- | --- |
| Browser runtime | `src/lib/browser-math.ts`, `src/lib/math.worker.ts`, `src/main.tsx`, `scripts/prepare-browser-math.mjs` |
| Mathematical engine | `backend/app/engine.py`, `parser.py`, `symbolic.py`, `numerical.py`, `analysis.py`, `errors.py` |
| Interface | `src/App.tsx`, `components/Visualizer.tsx`, `Fitting.tsx`, `MathView.tsx`, `src/index.css`, `index.html` |
| Data and notation utilities | `src/lib/csv.ts`, `math-display.ts`, `storage.ts` |
| Contracts | `lib/api-spec/openapi.yaml`, `orval.config.ts`, regenerated `lib/api-client-react` and `lib/api-zod` files |
| Optional adapters | `artifacts/api-server/src/`, `backend/app/main.py`, `schemas.py` |
| Verification | `backend/tests/test_regressions.py`, existing `test_math.py`, `tests/csv.test.ts`, `tests/e2e/workflows.spec.ts`, `playwright.config.ts` |
| Setup and documentation | Root/app `package.json`, `pnpm-workspace.yaml`, lockfile, Vite configs, `.gitignore`, root/app READMEs and this summary |

App-relative paths in this table are under `artifacts/equationpath/` unless otherwise qualified.

## Verification results

- Native mathematical regression suite: **30/30 passed**, including the original eleven regressions.
- CSV and mathematical-preview tests: **5/5 passed**.
- Browser acceptance suite: **10/10 passed** in the final run (5.4 minutes). This includes backend/external-request blocking, actual symbolic/numerical computations, both module transfers, general ODE fitting, all four fit charts, solution/CSV/PNG exports, invalid inputs and mobile navigation.
- Responsive checks passed on all seven screens at **375, 768, 1366 and 1920 pixels**; computed solver, graph and fitting states were included. Mobile and desktop screenshots were visually inspected.
- `pnpm run typecheck`: **passed** across workspace libraries and applications.
- `pnpm build`: **passed**; the static output includes its local WebAssembly runtime and Python wheels. Vite reports a non-blocking large Plotly chunk warning and an existing tooltip sourcemap warning.
- `git diff --check`: whitespace issues found during staging were corrected before finalization.
- A separate production-preview smoke check was initially blocked by an automatic approval-review account usage limit; this did not affect the completed build or browser acceptance suite.

## Mathematical and operational limits

- Symbolic methods cover exact equations and supported one-variable integrating factors. Unsupported is a method limitation, not a claim that an equation has no solution.
- Domain conditions are conservative. Some real logarithmic branches need separate potentials; global topology and every possible numerical singularity are not formally certified.
- Numerical integration/fitting follows a regular y(x) branch and estimates one initial value, not arbitrary model coefficients or globally optimal parameters.
- Contours use finite meshes and can miss small or unresolved features. The initial point determines a level rather than a unique connected component of that level set.
- The browser initially loads approximately 34 MB of math tools. Static assets are downloaded during development preparation/build and included in the distributable; browser calculations require no separate service.
- Browser storage can be unavailable or full. The app retains in-memory data and reports an export warning when persistence fails.

## Startup

```powershell
pnpm install
pnpm dev
```

Open http://localhost:5173. For the production static app, use `pnpm build` then `pnpm preview`. Full instructions and optional native regression commands are in [README.md](README.md).
