"""Pure deterministic math engine, runnable inside the browser's WebAssembly worker."""
import csv
import math
from pathlib import Path
from types import SimpleNamespace
from typing import Any
import numpy as np
import sympy as sp
from .errors import CalculationError as HTTPException
from .analysis import analyze_dataset, fit_ode_dataset, _predict_from_initial
from .parser import x,y,parse_expression,domain_restrictions,source_restrictions
from .numerical import BranchSolver,BranchError,metrics
from .symbolic import exactness,solve
_DATA_DIR=Path(__file__).resolve().parents[2]/'datasets'

def equation_latex(m, n):
    return '(' + sp.latex(m) + r')\,dx + (' + sp.latex(n) + r')\,dy = 0'


def public_exactness(m, n):
    result = exactness(m, n)
    result = {key: value for key, value in result.items() if not key.startswith('_')}
    result['equation_latex'] = equation_latex(m, n)
    result['m_y_latex'] = sp.latex(sp.diff(m, y))
    result['n_x_latex'] = sp.latex(sp.diff(n, x))
    result['factor_latex'] = sp.latex(exactness(m,n)['_factor']) if result['factor'] else None
    return result

def _parsed(m_text: str, n_text: str) -> tuple[sp.Expr, sp.Expr]:
    try:
        m, n = parse_expression(m_text), parse_expression(n_text)
        if m == 0 and n == 0:
            raise ValueError('M and N cannot both be zero: this differential form imposes no ODE.')
        return m, n
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _read_dataset(filename: str) -> list[dict[str, float | str]]:
    with (_DATA_DIR / filename).open(newline="", encoding="utf-8") as file:
        reader = csv.DictReader(file)
        required = {"case_id", "x_value", "observed_y"}
        if not reader.fieldnames or not required.issubset(set(reader.fieldnames)):
            raise RuntimeError(f"Demo dataset {filename} is missing required CSV columns.")
        return [
            {"case_id": row["case_id"], "x_value": float(row["x_value"]), "observed_y": float(row["observed_y"])}
            for row in reader
        ]


def get_examples() -> dict[str, Any]:
    examples = [
        {"id": "exact-polynomial", "title": "Exact polynomial", "m": "2*x*y + 3", "n": "x**2 + 4*y", "kind": "exact", "expected_solution": "x²y + 3x + 2y² = C", "description": "A direct exactness check with a polynomial potential."},
        {"id": "exact-product", "title": "Exact product", "m": "y", "n": "x", "kind": "exact", "expected_solution": "xy = C", "description": "The simplest mixed partials example."},
        {"id": "factor-x", "title": "Integrating factor μ(x)", "m": "y", "n": "x**2", "kind": "integrating_factor_x", "expected_solution": "y exp(-1/x) = C; x != 0", "description": "The one-variable test identifies an integrating factor in x."},
        {"id": "factor-y", "title": "Integrating factor μ(y)", "m": "y**2", "n": "x*y", "kind": "integrating_factor_y", "expected_solution": "xy = C", "description": "The factor μ(y)=1/y is valid on intervals with y ≠ 0."},
        {"id": "unsupported", "title": "Unsupported simple factor", "m": "x + y", "n": "1 + x*y", "kind": "unsupported", "expected_solution": "No supported one-variable factor identified", "description": "Neither supported one-variable integrating-factor test succeeds."},
    ]
    datasets = [
        {"id": "decay-noise", "title": "Exponential decay with noise", "model": "decay", "equation": "dy/dx = −y", "true_parameter": 2.0, "synthetic": True, "observations": _read_dataset("decay-noise.csv")},
        {"id": "quadratic-sample", "title": "Polynomial solution", "model": "quadratic", "equation": "dy/dx = 2x", "true_parameter": 1.0, "synthetic": True, "observations": _read_dataset("quadratic-sample.csv")},
        {"id": "growth-sample", "title": "Exponential growth", "model": "growth", "equation": "dy/dx = 2y", "true_parameter": 0.75, "synthetic": True, "observations": _read_dataset("growth-sample.csv")},
    ]
    for example in examples:
        m, n = _parsed(example['m'], example['n'])
        example['analysis'] = public_exactness(m, n)
        example['solution'] = solve(m, n)
        example['equation_latex'] = equation_latex(m, n)
    for dataset in datasets:
        dataset['generation'] = 'Deterministic synthetic samples of the stated solution with small fixed perturbations; not experimental measurements.'
    return {'examples': examples, 'datasets': datasets}


def healthz():
    return {'status': 'ok'}


def check_equation(request):
    m, n = _parsed(request.m, request.n)
    result = public_exactness(m, n)
    result['domain_restrictions'] = sorted(set(domain_restrictions(m,n) + source_restrictions(request.m,request.n)))
    return result


def solve_equation(request):
    m, n = _parsed(request.m, request.n)
    result = solve(m, n)
    result['domain_restrictions'] = sorted(set(result['domain_restrictions'] + source_restrictions(request.m,request.n)))
    result['equation_latex'] = equation_latex(m,n)
    result['classification'] = 'exact' if exactness(m,n)['is_exact'] else 'non-exact'
    return result


def plot_equation(request):
    if not all(math.isfinite(v) for v in [request.x_min,request.x_max,request.x0,request.y0]) or not request.x_min <= request.x0 <= request.x_max or request.x_min >= request.x_max or request.x_max-request.x_min > 100:
        raise HTTPException(400, 'Choose finite increasing bounds containing x0, with a span of at most 100.')
    m,n = _parsed(request.m,request.n)
    xs = np.unique(np.append(np.linspace(request.x_min,request.x_max,request.points),request.x0))
    try:
        ys = BranchSolver(m,n,(request.m,request.n)).predict(request.x0,request.y0,xs)
    except (ValueError, OverflowError) as exc:
        raise HTTPException(422, f'Cannot plot a regular branch on this interval: {exc}') from exc
    solver_field=BranchSolver(m,n,(request.m,request.n))
    field_x,field_y=[],[]
    y_span=max(float(np.ptp(ys)),1.0)
    for a in np.linspace(request.x_min,request.x_max,17):
        for b in np.linspace(float(np.min(ys))-y_span*.2,float(np.max(ys))+y_span*.2,15):
            try:
                mv,nv,_=solver_field.values(a,b)
                slope=-mv/nv
                if not np.isfinite(slope): continue
                dx=(request.x_max-request.x_min)/65/np.sqrt(1+slope*slope)
                field_x.extend([float(a-dx),float(a+dx),None]);field_y.extend([float(b-dx*slope),float(b+dx*slope),None])
            except (ValueError,OverflowError): continue
    return {'x': xs.tolist(), 'y': ys.tolist(), 'x0': request.x0,'y0': request.y0,'field_x':field_x,'field_y':field_y,
            'warnings': ['Numerical approximation of one regular y(x) branch. Reduce the interval near a singularity.'],
            'method': 'Numerical solution via SciPy solve_ivp'}


def contour_equation(request):
    if request.x_min >= request.x_max or request.y_min >= request.y_max or max(request.x_max-request.x_min,request.y_max-request.y_min)>100:
        raise HTTPException(400,'Choose increasing x and y bounds with spans at most 100.')
    m,n = _parsed(request.m,request.n)
    solution = solve_equation(SimpleNamespace(m=request.m,n=request.n))
    if solution['status'] != 'solved':
        raise HTTPException(422,'Implicit contours require a verified potential function from a supported symbolic method.')
    # This potential is constructed and verified by this service, never supplied by the client.
    potential = parse_expression(solution['potential'])
    factor = exactness(m,n)['_factor']
    xs = np.linspace(request.x_min,request.x_max,request.resolution)
    ys = np.linspace(request.y_min,request.y_max,request.resolution)
    xx, yy = np.meshgrid(xs,ys)
    from .parser import source_constraints
    def valid(a,b):
        mask = np.ones(np.broadcast(a,b).shape,dtype=bool)
        for source in (request.m,request.n):
            for kind,expr in source_constraints(source):
                v = np.asarray(sp.lambdify((x,y),expr,'numpy')(a,b),dtype=float)
                mask &= np.isfinite(v)
                if kind == 'nonzero': mask &= np.abs(v)>1e-8
                if kind == 'positive': mask &= v>0
                if kind == 'nonnegative': mask &= v>=0
                if kind == 'unit': mask &= np.abs(v)<=1
                if kind == 'cosine': mask &= np.abs(np.cos(v))>1e-8
        return mask
    m_field = sp.lambdify((x,y),m,'numpy')
    n_field = sp.lambdify((x,y),n,'numpy')
    with np.errstate(all='ignore'):
        fn = sp.lambdify((x,y),potential,'numpy')
        z = np.broadcast_to(np.asarray(fn(xx,yy),dtype=float),xx.shape).copy()
        level = float(fn(np.float64(request.x0),np.float64(request.y0)))
        mask = np.isfinite(z) & valid(xx,yy)
        if factor is not None:
            fv = np.broadcast_to(np.asarray(sp.lambdify((x,y),factor,'numpy')(xx,yy),dtype=float),xx.shape)
            mask &= np.isfinite(fv) & (np.abs(fv)>1e-10)
            start_factor = float(sp.lambdify((x,y),factor,'numpy')(np.float64(request.x0),np.float64(request.y0)))
            if not math.isfinite(start_factor) or abs(start_factor)<1e-10:
                raise HTTPException(422,'The initial point is on the integrating factor singular set.')
        if not math.isfinite(level) or not bool(valid(request.x0,request.y0)):
            raise HTTPException(422,'The initial point is outside the potential or original equation domain.')
        # Mask both cells bordering sign-changing denominators to prevent false joins.
        guards = [expr for source in (request.m,request.n) for kind,expr in source_constraints(source) if kind=='nonzero']
        guards += [item.base for item in sp.preorder_traversal(potential) if item.is_Pow and item.exp.is_negative]
        if factor is not None: guards += [item.base for item in sp.preorder_traversal(factor) if item.is_Pow and item.exp.is_negative]
        for guard in guards:
            v=np.broadcast_to(np.asarray(sp.lambdify((x,y),guard,'numpy')(xx,yy),dtype=float),xx.shape)
            vertical=np.sign(v[1:,:])!=np.sign(v[:-1,:]); horizontal=np.sign(v[:,1:])!=np.sign(v[:,:-1])
            mask[1:,:]&=~vertical; mask[:-1,:]&=~vertical
            mask[:,1:]&=~horizontal; mask[:,:-1]&=~horizontal
        zrows = [[float(value) if ok else None for value,ok in zip(row,mrow)] for row,mrow in zip(z,mask)]
        # Normalized direction segments. Undefined locations remain absent.
        field_x=[]; field_y=[]
        for a in np.linspace(request.x_min,request.x_max,17):
            for b in np.linspace(request.y_min,request.y_max,15):
                if not bool(valid(a,b)): continue
                mv=float(m_field(a,b)); nv=float(n_field(a,b))
                if not np.isfinite(mv) or not np.isfinite(nv) or abs(nv)<1e-8: continue
                slope=-mv/nv
                if not np.isfinite(slope): continue
                dx=(request.x_max-request.x_min)/65/np.sqrt(1+slope*slope)
                dy=dx*slope
                field_x.extend([a-dx,a+dx,None]); field_y.extend([b-dy,b+dy,None])
    return {'x':xs.tolist(),'y':ys.tolist(),'z':zrows,'level':level,'field_x':field_x,'field_y':field_y,
            'potential_latex':solution['potential_latex'],'domain_restrictions':solution['domain_restrictions'],
            'warnings':['Finite-mesh contour of F(x,y)=C; small branches or singular sets may be unresolved. Blank regions are outside the evaluated domain. A contour may contain multiple branches; the initial point selects the level, not every connected component.']}
