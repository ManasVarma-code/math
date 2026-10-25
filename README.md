# EquationPath — Exact / Non-Exact ODE Studio

EquationPath runs **entirely in the browser**. Symbolic solving, numerical integration, curve fitting, CSV analysis and plotting run on the user's device. **No backend server, Python installation, API key, account, database or paid/cloud service is required.**

The existing React/Vite interface and deterministic SymPy/NumPy/SciPy algorithms are preserved. Pyodide runs the math code in a WebAssembly worker. All runtime files and required wheels are included as static app assets; calculations make no external requests. Initial math-tool loading displays progress and loads approximately 34 MB of bundled runtime and libraries.

## Windows PowerShell startup

Install Node.js 22.22.2 or later and pnpm (`npm install --global pnpm@11.25.0`). From a new clone:

```powershell
git clone https://github.com/manasvignesh/math.git
cd math
pnpm install
pnpm dev
```

Open **http://localhost:5173**. The `predev` script prepares and verifies the static math assets automatically. Initial dependency preparation needs internet access once; subsequent starts reuse local assets. **Do not start Express or FastAPI.**

For the production static app:

```powershell
pnpm build
pnpm preview
```

Deploy `artifacts/equationpath/dist/public` on an ordinary static web host, with a fallback to `index.html` for application routes. The output includes all math runtime assets. Use a web origin, because browsers restrict module workers opened through `file://`.

No environment variables are necessary. Optional frontend configuration:

```powershell
$env:PORT = "5174"
$env:BASE_PATH = "/"
pnpm dev
```

## Student workflow

1. Enter M and N separately in `M(x,y) dx + N(x,y) dy = 0`; powers accept `**` or `^`.
2. Check cross-partials and solve exact equations or supported one-variable integrating-factor equations.
3. Read computed steps, KaTeX notation, derivative verification and domain conditions.
4. Set an initial condition and choose **Visualize this equation** or **Compare with observations**. Expressions, classification, method, potential, restrictions and initial values travel together.
5. Plot numerical branches or verified implicit contours with direction fields. Plotly provides zoom, pan, coordinate inspection, grid controls and PNG export.
6. Upload CSV observations or load labelled synthetic examples. Select a dataset and its case ID.
7. Fit the entered ODE's initial value or one of three analytical families. Compare theoretical and fitted values, residuals, MSE, RMSE, MAE and R².
8. Export solution JSON, observations or result CSV. Calculation history and datasets remain on this device.

## CSV data

```csv
case_id,x_value,observed_y
trial-A,0,2
trial-A,0.5,1.2131
trial-A,1,0.7358
```

Headers may be reordered. Quoted cells, escaped quotes, BOM and CRLF are supported. Missing fields, malformed quotes, duplicate headers, non-finite values and duplicate coordinates within a case are rejected with row information. Invalid uploads preserve the selected dataset. Limits: 1 MB, 2,000 rows, twelve retained datasets; numerical fitting accepts 3–200 observations per case. Existing datasets are not silently discarded when the library is full.

Bundled decay, growth and quadratic observations are deterministic **synthetic** samples with small fixed perturbations. See [generation notes](artifacts/equationpath/datasets/README.md).

## Mathematical scope and limitations

- A restricted Python AST parser supports arithmetic, powers, rational expressions, trigonometric/hyperbolic functions, exponentials, logs, square roots, absolute values, `pi` and `E`. It never evaluates user Python code. Size, nesting, literal and exponent limits apply.
- Exactness compares simplified `M_y` and `N_x` locally under smoothness and domain assumptions. Equality alone does not establish a global potential around domain holes.
- Potentials are constructed by integrating M and determining the missing function of y. Both derivatives must verify. One-variable integrating factors must also pass transformed exactness verification.
- Original-domain restrictions survive cancellations such as `x/x`. Integrating factors must be defined and nonzero; excluded branches are reported. Logarithmic potentials cover their stated real domains; other branches can require separate potentials.
- Numerical solutions follow one regular `y(x)` branch. Invalid denominators, undefined domains and integration failures produce errors rather than artificial continuations. Numerical checks are not formal proofs that every singularity has been located.
- Implicit contours use a bounded mesh of a verified potential. Undefined cells and detected denominator crossings are masked. Separate components remain distinct, but small branches and unresolved singular sets may be missed. An initial point selects a level, not all its connected components.
- General fitting estimates **only y(x₀)** with numerical integration and local least squares. It does not fit arbitrary coefficients, vertical/disconnected/singular branches or certify global optimality. Initial guesses, bounds, convergence and sensitivity are checked. Observation coordinates must be within 100 x-units of x₀.
- Analytical families are `C exp(-x)`, `C exp(2x)` and `x²+C`. The theoretical reference uses the specified C; numerical fitting uses its initial guess as reference.
- Residual = observed − predicted. R² is undefined for zero-variance observations. A good fit does not establish physical validity.
- A 23-second worker computation limit and numerical evaluation budgets bound expensive work. Timeouts terminate the worker; retry initializes a fresh runtime.

## Code structure

| Location | Responsibility |
| --- | --- |
| `artifacts/equationpath/src/` | React dashboard, KaTeX, Plotly and local state |
| `src/lib/browser-math.ts` | Generated request validation and worker transport |
| `src/lib/math.worker.ts` | Local WebAssembly runtime and computation queue |
| `backend/app/parser.py` | Safe parsing and original-domain constraints |
| `backend/app/symbolic.py` | Exactness, integrating factors and verified potentials |
| `backend/app/numerical.py` | Regular numerical branches and error metrics |
| `backend/app/analysis.py` | Analytical comparisons and numerical fitting |
| `backend/app/engine.py` | Pure computations, contours and bundled examples |
| `scripts/prepare-browser-math.mjs` | Bundle runtime/wheels and verify SHA-256 hashes |
| `lib/api-spec/`, `lib/api-zod/`, `lib/api-client-react/` | Canonical contracts and generated validators/hooks |

The `backend/` directory is a source-code location: its pure math modules are bundled into the browser. Original Express/FastAPI adapters remain for optional development compatibility; the app does not use or start them.

## Verification

```powershell
pnpm test
pnpm run typecheck
pnpm build
pnpm --filter @workspace/equationpath exec playwright install chromium
pnpm test:e2e
```

Browser tests use real computations, including external/API-request blocking, invalid inputs, module transfers, CSV cases, fitting, downloads and responsive views at 375, 768, 1366 and 1920 pixels.

Optional native Python regression suite (not needed to run/build the app):

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r artifacts/equationpath/backend/requirements-dev.txt
$env:PYTHONPATH = "artifacts/equationpath/backend"
$env:PYTHONUTF8 = "1"
.\.venv\Scripts\python.exe -m unittest discover -s artifacts/equationpath/backend/tests -v
.\.venv\Scripts\python.exe -m pytest artifacts/equationpath/backend/tests -q
```

After changing contracts, run `pnpm --filter @workspace/api-spec run codegen`.

See [development summary](DEVELOPMENT_SUMMARY.md) for the changes and test results. Runtime packaging follows [Pyodide self-hosting documentation](https://pyodide.org/en/stable/usage/downloading-and-deploying.html).

## Syllabus mapping

| Student feature | Syllabus unit | What is computed |
| --- | --- | --- |
| Side-by-side cross-partials and exactness verdict | Unit IV — exactness test | Mᵧ, Nₓ and simplified Mᵧ − Nₓ |
| Integrating-factor result and condition | Unit IV — non-exact equations | μ(x) or μ(y), tested ratios and transformed verification |
| Worked gallery and practice mode | Unit IV — exact/non-exact classification | Real engine classification and worked steps; score stays in local state |
| Particular solution at (x₀,y₀) | Unit IV — initial conditions | Exact symbolic C = F(x₀,y₀) on the valid domain |
| Numerical curves and implicit contours | Unit IV — solution curves | Regular initial-value branches and verified potential level sets |
| CSV datasets, reference C and fitted parameters | Unit V — curve fitting | Analytical C or numerical y₀ least-squares estimate |
| Theoretical/fitted graphs, residuals and metrics | Unit V — residual comparison | Observed − predicted, squared residual, MSE, RMSE, MAE and R² |

The exact CSV schema is **`case_id,x_value,observed_y`**. Download CSV template creates this header and two example rows. Uploaded data has no known reference C: the app displays the chosen reference explicitly and offers **Use fitted C as reference** after an analytical fit.

The optional Express/FastAPI adapters are retained for development compatibility only and are unused by the shipped browser-only application.

## Vercel deployment

Deploy the `main` branch as a single Vite project. The recommended Root Directory is the repository root (`./`); the root `vercel.json` builds only EquationPath and serves `artifacts/equationpath/dist/public`. Do not import the Express or FastAPI services.

If the project was imported with Root Directory `artifacts/equationpath`, enable **Include source files outside of the Root Directory in the Build Step** for the workspace libraries and packaging script. That directory's `vercel.json` serves `dist/public`. Install workspace dependencies with pnpm, including development dependencies required by Vite. Clear conflicting dashboard Build Command/Output Directory overrides and redeploy after changing settings.

Both configurations include the SPA fallback so refreshing `/solver`, `/practice` or `/fitting` loads the app. The build packages the Python runtime and math libraries as static assets; no backend service or Python server is deployed.
