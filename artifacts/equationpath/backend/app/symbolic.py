"""Verified symbolic exactness, integrating factors and potential construction."""
from typing import Any
import sympy as sp
from .parser import x,y,domain_restrictions

def _string(expr: sp.Expr) -> str:
    return sp.sstr(sp.simplify(expr))


def _dependence(expr: sp.Expr, variable: sp.Symbol) -> bool:
    return sp.simplify(expr).free_symbols.issubset({variable})


def exactness(m: sp.Expr, n: sp.Expr) -> dict[str, Any]:
    m_y = sp.simplify(sp.diff(m, y))
    n_x = sp.simplify(sp.diff(n, x))
    difference = sp.simplify(m_y - n_x)
    method, factor, explanation = "none", None, "The equation is not exact; no supported one-variable integrating factor was identified."
    ratio_x = sp.simplify(difference/n) if n != 0 else None
    ratio_y = sp.simplify(-difference/m) if m != 0 else None
    is_exact = difference == 0
    if is_exact:
        method = "exact"
        explanation = "The mixed partial derivatives simplify to the same expression."
    elif sp.simplify(m) != 0:
        ratio_y = sp.simplify(-difference / m)
        if _dependence(ratio_y, y) :
            method, factor = "integrating_factor_y", sp.simplify(sp.exp(sp.integrate(ratio_y, y)))
            explanation = "The integrating-factor test depends only on y; the transformed equation will be checked before solving."
    if not is_exact and method == "none" and sp.simplify(n) != 0:
        ratio_x = sp.simplify(difference / n)
        if _dependence(ratio_x, x) :
            method, factor = "integrating_factor_x", sp.simplify(sp.exp(sp.integrate(ratio_x, x)))
            explanation = "The integrating-factor test depends only on x; the transformed equation will be checked before solving."
    if not is_exact and method == 'none':
        explanation = (f"The equation is not exact. The tested integrating-factor conditions failed: "
                       f"(M_y - N_x)/N = {_string(ratio_x) if ratio_x is not None else 'undefined (N = 0)'} must depend only on x; "
                       f"(N_x - M_y)/M = {_string(ratio_y) if ratio_y is not None else 'undefined (M = 0)'} must depend only on y. "
                       "Other integrating factors, for example μ(xy) or μ(x+y), and other solution methods are outside this tool's scope. This does not mean the equation has no solution.")
    return {
        "ratio_x": _string(ratio_x) if ratio_x is not None else None,
        "ratio_y": _string(ratio_y) if ratio_y is not None else None,
        "ratio_x_latex": sp.latex(ratio_x) if ratio_x is not None else None,
        "ratio_y_latex": sp.latex(ratio_y) if ratio_y is not None else None,
        "m": _string(m), "n": _string(n), "m_y": _string(m_y), "n_x": _string(n_x),
        "difference": _string(difference), "is_exact": is_exact, "method": method,
        "factor": _string(factor) if factor is not None else None, "explanation": explanation,
        "_m": m, "_n": n, "_factor": factor,
    }


def _solve_exact(m: sp.Expr, n: sp.Expr) -> tuple[sp.Expr | None, list[str], dict[str, bool]]:
    try:
        integrated_m = sp.integrate(m, x)
        g_prime = sp.simplify(n - sp.diff(integrated_m, y))
        if x in g_prime.free_symbols:
            return None, [], {"F_x_equals_M": False, "F_y_equals_N": False}
        g = sp.integrate(g_prime, y)
        if g.has(sp.Integral) or integrated_m.has(sp.Integral):
            return None, [], {"F_x_equals_M": False, "F_y_equals_N": False}
        potential = sp.simplify(integrated_m + g)
        verified_x = sp.simplify(sp.diff(potential, x) - m) == 0
        verified_y = sp.simplify(sp.diff(potential, y) - n) == 0
        steps = [
            f"Integrate M with respect to x: {sp.sstr(integrated_m)} + g(y)",
            f"Differentiate with respect to y: {sp.sstr(sp.diff(integrated_m, y))} + g'(y)",
            f"Match with N to obtain g'(y) = {sp.sstr(g_prime)}",
            f"Integrate g'(y): g(y) = {sp.sstr(g)}",
            f"Construct F(x,y) = {sp.sstr(potential)}",
            f"Verify F_x − M = {sp.sstr(sp.simplify(sp.diff(potential, x) - m))} and F_y − N = {sp.sstr(sp.simplify(sp.diff(potential, y) - n))}",
        ]
        return potential, steps, {"F_x_equals_M": verified_x, "F_y_equals_N": verified_y}
    except (NotImplementedError, ValueError, TypeError, RecursionError):
        return None, [], {"F_x_equals_M": False, "F_y_equals_N": False}


def solve(m: sp.Expr, n: sp.Expr) -> dict[str, Any]:
    analysis = exactness(m, n)
    method = analysis["method"]
    warnings: list[str] = []
    restrictions: list[str] = domain_restrictions(m, n)
    factor_output = {
        'integrating_factor': analysis['factor'] if method.startswith('integrating_factor') else None,
        'integrating_factor_latex': sp.latex(analysis['_factor']) if method.startswith('integrating_factor') else None,
        'integrating_factor_condition': '(M_y − N_x)/N depends only on x' if method.endswith('_x') else '(N_x − M_y)/M depends only on y' if method.endswith('_y') else None,
        'ratio_x': analysis['ratio_x'], 'ratio_y': analysis['ratio_y'],
        'ratio_x_latex': analysis['ratio_x_latex'], 'ratio_y_latex': analysis['ratio_y_latex'],
    }
    transformed_m, transformed_n = m, n
    if method.startswith("integrating_factor"):
        factor = analysis["_factor"]
        if factor is None or factor.has(sp.Integral) or factor.is_zero is True:
            method = "unsupported"
        else:
            transformed_m, transformed_n = sp.simplify(factor * m), sp.simplify(factor * n)
            if sp.simplify(sp.diff(transformed_m, y) - sp.diff(transformed_n, x)) != 0:
                method = "unsupported"
                warnings.append("The proposed integrating factor did not pass symbolic exactness verification.")
            else:
                variable = "x" if method.endswith("_x") else "y"
                restrictions.extend(domain_restrictions(factor))
                restrictions.append(f"{sp.sstr(factor)} != 0; work on a connected real domain where the factor is defined.")
                warnings.append("Multiplication by an integrating factor may exclude branches on its singular set; retain the original equation's domain.")
    if method == "none" or method == "unsupported":
        return {
            **{**factor_output, "integrating_factor": None, "integrating_factor_latex": None},
            "status": "unsupported", "method": method, "potential": None, "implicit_solution": None,
            "steps": [analysis["explanation"]], "verification": {"F_x_equals_M": False, "F_y_equals_N": False},
            "domain_restrictions": restrictions, "warnings": warnings,
        }
    potential, steps, verification = _solve_exact(transformed_m, transformed_n)
    if potential is None or not all(verification.values()):
        return {
            **factor_output,
            "status": "integration_unavailable", "method": method, "potential": None, "implicit_solution": None,
            "steps": ["Symbolic integration did not produce a verifiable potential function."],
            "verification": verification, "domain_restrictions": restrictions,
            "warnings": warnings + ["The expression was accepted, but a complete symbolic solution could not be verified."],
        }
    restrictions.extend(domain_restrictions(potential))
    warnings.append('Interpret the potential locally on smooth connected domains. Equal cross-partials alone do not ensure a single global potential around domain holes.')
    if potential.has(sp.log):
        warnings.append("This real logarithmic potential is displayed on domains satisfying its log restrictions; other real branches may need a separate potential.")
    if method != "exact":
        steps.insert(0, f"Apply integrating factor μ = {analysis['factor']} to both terms.")
        steps.insert(1, "Verify the transformed equation is exact before integrating.")
    integrated_m = sp.integrate(transformed_m, x)
    partial_y = sp.diff(integrated_m, y)
    g_prime = sp.simplify(transformed_n - partial_y)
    g = sp.integrate(g_prime, y)
    descriptions = ['Integrate M with respect to x, allowing a function of y.',
                    'Differentiate this expression with respect to y.',
                    'Match with N to determine the missing derivative.',
                    'Integrate the missing derivative.',
                    'Construct the potential function.',
                    'Write the implicit solution.',
                    'Verify both partial derivatives against the equation.']
    latex_steps = [r'F = \int M\,dx = ' + sp.latex(integrated_m) + r'+g(y)',
                   r'F_y = ' + sp.latex(partial_y) + r"+g'(y)",
                   r"g'(y) = " + sp.latex(transformed_n) + r'-\left(' + sp.latex(partial_y) + r'\right) = ' + sp.latex(g_prime),
                   r"g(y) = \int g'(y)\,dy = " + sp.latex(g),
                   r'F(x,y) = ' + sp.latex(potential), sp.latex(potential) + ' = C',
                   r'F_x = ' + sp.latex(sp.diff(potential,x)) + r',\quad F_y = ' + sp.latex(sp.diff(potential,y))]
    if method != 'exact':
        descriptions = ['Multiply both terms by the supported integrating factor.', 'Verify the transformed cross-partials agree.'] + descriptions
        latex_steps = [r'\mu = ' + sp.latex(analysis['_factor']),
                       r'\frac{\partial(\mu M)}{\partial y} = \frac{\partial(\mu N)}{\partial x} = ' + sp.latex(sp.simplify(sp.diff(transformed_m,y)))] + latex_steps
    return {
        **factor_output,
        "status": "solved", "method": method, "potential": _string(potential),
        "implicit_solution": f"{_string(potential)} = C", "steps": steps,
        "verification": verification, "domain_restrictions": sorted(set(restrictions)), "warnings": warnings,
        "potential_latex": sp.latex(potential), "solution_latex": sp.latex(potential) + " = C",
        "steps_latex": latex_steps, "step_descriptions": descriptions,
    }
