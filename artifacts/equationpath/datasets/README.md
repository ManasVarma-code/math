# EquationPath sample data

All bundled observations are deterministic synthetic sample data, not experimental research measurements.

| File | ODE | General solution | True C | Generation |
| --- | --- | --- | --- | --- |
| `decay-noise.csv` | `dy/dx = -y` | `y = C exp(-x)` | `2` | Samples at x = 0, 0.4, …, 2.0 with small fixed perturbations. |
| `quadratic-sample.csv` | `dy/dx = 2x` | `y = x² + C` | `1` | Samples at x = -2, -1, 0, 1, 2 with small fixed perturbations. |
| `growth-sample.csv` | `dy/dx = 2y` | `y = C exp(2x)` | `0.75` | Samples at x = -1, -0.5, 0, 0.5, 1 with small fixed perturbations. |

The least-squares estimate should be close to the listed C. The data are intentionally synthetic for teaching curve fitting and residual analysis; they do not validate any physical model.
