"""Analytical family comparisons and local numerical initial-value fitting."""
import math
import numpy as np
from scipy.optimize import least_squares
from .errors import CalculationError as HTTPException
from .parser import parse_expression
from .numerical import BranchSolver, BranchError, metrics

def _observations(request):
    xs=np.asarray([r.x_value for r in request.observations],dtype=float)
    actual=np.asarray([r.observed_y for r in request.observations],dtype=float)
    if not np.all(np.isfinite(xs)) or not np.all(np.isfinite(actual)):
        raise HTTPException(400,'All observations must be finite numbers.')
    if len(set(xs.tolist()))!=len(xs): raise HTTPException(400,'Duplicate x coordinates are not supported; remove or combine repeated observations.')
    if np.max(np.abs(xs))>1e4 or np.max(np.abs(actual))>1e10: raise HTTPException(400,'Observation magnitudes exceed the supported range.')
    return xs,actual


def analysis_rows(xs,actual,predictions,theoretical=None):
    return [{'x_value':float(a),'observed_y':float(b),'predicted_y':float(c) if c is not None else None,
             'residual':float(b-c) if c is not None else None,'squared_residual':float((b-c)**2) if c is not None else None,
             'theoretical_y':float(theoretical[i]) if theoretical is not None else None}
            for i,(a,b,c) in enumerate(zip(xs,actual,predictions if predictions is not None else [None]*len(xs)))]


def analyze_dataset(request):
    xs,actual=_observations(request)
    with np.errstate(all='ignore'):
        basis = np.exp(-xs) if request.model=='decay' else np.exp(2*xs) if request.model=='growth' else np.ones_like(xs)
        offset=xs**2 if request.model=='quadratic' else np.zeros_like(xs)
        norm=np.linalg.norm(basis)
        if not np.all(np.isfinite(basis)) or not math.isfinite(norm) or norm<1e-100:
            raise HTTPException(422,'This model is numerically unidentifiable or undefined at the supplied coordinates.')
        parameter=float(np.dot(basis/norm,actual-offset)/norm) if request.fit_parameter else None
        predictions=basis*parameter+offset if parameter is not None else None
        known=request.known_parameter if request.known_parameter is not None else 1.0
        theoretical=basis*known+offset
        if not np.all(np.isfinite(theoretical)) or (predictions is not None and not np.all(np.isfinite(predictions))):
            raise HTTPException(422,'Model predictions are not finite.')
    try:
        errors=metrics(actual,predictions) if predictions is not None else {key:None for key in ('mse','rmse','mae','r_squared')}
    except BranchError as exc: raise HTTPException(422,str(exc)) from exc
    return {'model':request.model,'parameter_name':'C' if parameter is not None else None,'parameter_value':parameter,
            'rows':analysis_rows(xs,actual,predictions,theoretical),'metrics':errors,
            'note':f'Theoretical reference uses C={known}. Fitted C minimizes squared residuals for this family. A good fit does not establish physical validity.'}


def _predict_from_initial(m,n,x0,y0,xs):
    return BranchSolver(m,n).predict(x0,y0,xs)


def fit_ode_dataset(request):
    try: m,n=parse_expression(request.m),parse_expression(request.n)
    except ValueError as exc: raise HTTPException(400,str(exc)) from exc
    xs,actual=_observations(request)
    if np.max(np.abs(xs-request.x0))>100: raise HTTPException(400,'Observations must be within 100 x-units of x0.')
    if not -1e5<=request.lower_bound<request.upper_bound<=1e5 or not request.lower_bound<request.initial_guess<request.upper_bound:
        raise HTTPException(400,'Use increasing y0 bounds within [-100000,100000] with the initial guess strictly inside.')
    solver=BranchSolver(m,n,(request.m,request.n),seconds=15)
    try:
        theoretical=solver.predict(request.x0,request.initial_guess,xs)
        failed=[False]
        def residual(parameter):
            try: return solver.predict(request.x0,float(parameter[0]),xs)-actual
            except BranchError:
                failed[0]=True
                # A failed evaluation is a rejected trial only; final success still requires
                # a valid branch, optimizer convergence and identifiable sensitivity.
                return np.full(len(xs),1e12)
        optimized=least_squares(residual,[request.initial_guess],bounds=(request.lower_bound,request.upper_bound),max_nfev=90,gtol=1e-9,xtol=1e-9,ftol=1e-9)
        parameter=float(optimized.x[0])
        predictions=solver.predict(request.x0,parameter,xs)
        if not optimized.success or not np.all(np.isfinite(optimized.jac)) or np.linalg.norm(optimized.jac)<1e-7:
            raise BranchError('The initial value is not identifiable or optimization did not converge. Move x0 closer to the observations or choose another initial guess.')
        errors=metrics(actual,predictions)
    except (ValueError,OverflowError) as exc: raise HTTPException(422,f'Could not fit a valid numerical branch: {exc}') from exc
    notes=[]
    if optimized.active_mask[0]: notes.append('The fitted parameter is on a supplied bound.')
    if failed[0]: notes.append('Some trial branches were invalid and rejected.')
    return {'model':'numerical_ode','parameter_name':'y0','parameter_value':parameter,
            'rows':analysis_rows(xs,actual,predictions,theoretical),'metrics':errors,
            'note':f'Numerical local least-squares estimate of y({request.x0}). Theoretical reference uses the initial guess. This does not certify a global optimum or physical validity. '+ ' '.join(notes)}
