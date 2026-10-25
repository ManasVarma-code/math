"""Regular y(x) branches only. Never substitute fabricated derivatives at singularities."""
import time
import numpy as np
import sympy as sp
from scipy.integrate import solve_ivp
from .parser import x, y, source_constraints


class BranchError(ValueError):
    pass


class BranchSolver:
    def __init__(self, m, n, sources=(), seconds=8):
        self.m = sp.lambdify((x, y), m, 'numpy')
        self.n = sp.lambdify((x, y), n, 'numpy')
        self.constraints = [(kind, sp.lambdify((x, y), expr, 'numpy'))
                            for source in sources for kind, expr in source_constraints(source)]
        self.deadline = time.monotonic() + seconds
        self.calls = 0
        self.start_signs = None

    def values(self, t, value):
        self.calls += 1
        if self.calls > 100000 or time.monotonic() > self.deadline:
            raise BranchError('Numerical work limit reached; shorten the interval or simplify the equation.')
        try:
            with np.errstate(all='ignore'):
                numerator, denominator = float(self.m(t, value)), float(self.n(t, value))
                guards = [(kind, float(fn(t, value))) for kind, fn in self.constraints]
            if not np.isfinite(numerator) or not np.isfinite(denominator) or abs(denominator) < 1e-9:
                raise BranchError('N is zero or the equation is undefined on this branch.')
            for kind, val in guards:
                if not np.isfinite(val) or (kind == 'nonzero' and abs(val) < 1e-9) or (kind == 'positive' and val <= 0) or (kind == 'nonnegative' and val < 0) or (kind == 'unit' and abs(val) > 1) or (kind == 'cosine' and abs(np.cos(val)) < 1e-9):
                    raise BranchError('The original expression is undefined on this branch.')
            signs = [np.sign(denominator)] + [np.sign(val) for kind, val in guards if kind == 'nonzero']
            if self.start_signs is not None and signs != self.start_signs:
                raise BranchError('A denominator changed sign; integration cannot cross its singular set.')
            return numerator, denominator, signs
        except (TypeError, OverflowError, ZeroDivisionError) as exc:
            raise BranchError('The equation is outside its real domain.') from exc

    def predict(self, x0, y0, xs):
        self.start_signs = None
        _, _, self.start_signs = self.values(x0, y0)
        result = np.full(len(xs), np.nan, dtype=float)
        result[xs == x0] = y0

        def slope(t, state):
            numerator, denominator, _ = self.values(t, state[0])
            value = -numerator / denominator
            if not np.isfinite(value) or abs(value) > 1e8 or abs(state[0]) > 1e10:
                raise BranchError('Solution slope or magnitude exceeds the supported numerical range.')
            return [value]

        for side in (-1, 1):
            ids = np.flatnonzero(xs < x0 if side == -1 else xs > x0)
            if not len(ids): continue
            ordered = ids[np.argsort(np.abs(xs[ids] - x0))]
            targets = xs[ordered]
            sol = solve_ivp(slope, (x0, float(targets[-1])), [y0], t_eval=targets,
                            rtol=1e-8, atol=1e-10, max_step=abs(float(targets[-1]) - x0) / 200)
            if not sol.success or not isinstance(sol.y, np.ndarray) or sol.y.shape[1] != len(targets):
                raise BranchError('Integration failed before reaching every requested coordinate.')
            result[ordered] = sol.y[0]
        if not np.all(np.isfinite(result)): raise BranchError('Model predictions are not finite.')
        return result


def metrics(observed, predicted):
    errors = observed - predicted
    with np.errstate(all='ignore'):
        mse = float(np.mean(errors ** 2))
        sst = float(np.sum((observed - observed.mean()) ** 2))
        output = {'mse': mse, 'rmse': float(np.sqrt(mse)), 'mae': float(np.mean(np.abs(errors))),
                  'r_squared': float(1 - np.sum(errors ** 2) / sst) if sst > 0 else None}
    if not all(value is None or np.isfinite(value) for value in output.values()):
        raise BranchError('Error metrics exceed the finite numerical range.')
    return output
