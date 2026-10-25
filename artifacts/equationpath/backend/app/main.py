"""Optional FastAPI adapter; the shipped web app runs entirely in its browser worker."""
from typing import Any
from fastapi import FastAPI, HTTPException
from .schemas import EquationInput, PlotInput, ContourInput, NumericalFitInput, AnalyzeInput, Observation
from .engine import check_equation, solve_equation, plot_equation, contour_equation, get_examples, healthz
from .analysis import analyze_dataset, fit_ode_dataset, _predict_from_initial
from .parser import parse_expression
from .symbolic import exactness, solve
from .errors import CalculationError
app=FastAPI(title='EquationPath optional development adapter',version='2.0.0')

# CPU work runs in a disposable process so a timed-out symbolic calculation really stops.
# A bounded semaphore prevents unbounded concurrent processes on ordinary laptops.
import asyncio
import multiprocessing as mp
from starlette.concurrency import run_in_threadpool
_work_slots=asyncio.Semaphore(2)


def _worker(connection,operation,payload):
    try:
        schemas={'check':EquationInput,'solve':EquationInput,'plot':PlotInput,'contour':ContourInput,'analyze':AnalyzeInput,'fit':NumericalFitInput}
        handlers={'check':check_equation,'solve':solve_equation,'plot':plot_equation,'contour':contour_equation,'analyze':analyze_dataset,'fit':fit_ode_dataset}
        result=get_examples() if operation=='examples' else handlers[operation](schemas[operation].model_validate(payload))
        connection.send((200,result))
    except (HTTPException,CalculationError) as exc: connection.send((exc.status_code,{'detail':exc.detail}))
    except Exception: connection.send((422,{'detail':'The calculation could not be evaluated on the supplied real domain. Simplify the expression or adjust the interval.'}))
    finally: connection.close()


def _bounded_compute(operation,payload):
    context=mp.get_context('spawn')
    receive,send=context.Pipe(duplex=False)
    process=context.Process(target=_worker,args=(send,operation,payload),daemon=True)
    process.start(); send.close()
    try:
        if not receive.poll(23): raise HTTPException(422,'Calculation exceeded the 23-second work limit. Simplify the equation or shorten the interval.')
        status,result=receive.recv()
        if status!=200: raise HTTPException(status,result['detail'])
        return result
    finally:
        receive.close()
        if process.is_alive(): process.terminate()
        process.join(timeout=1)


async def compute(operation,payload=None):
    async with _work_slots:
        return await run_in_threadpool(_bounded_compute,operation,payload)


@app.post('/equations/check')
async def check_route(request:EquationInput): return await compute('check',request.model_dump())
@app.post('/equations/solve')
async def solve_route(request:EquationInput): return await compute('solve',request.model_dump())
@app.post('/equations/plot')
async def plot_route(request:PlotInput): return await compute('plot',request.model_dump())
@app.post('/equations/contour')
async def contour_route(request:ContourInput): return await compute('contour',request.model_dump())
@app.post('/data/analyze')
async def analyze_route(request:AnalyzeInput): return await compute('analyze',request.model_dump())
@app.post('/data/fit-ode')
async def fit_route(request:NumericalFitInput): return await compute('fit',request.model_dump())
@app.get('/examples')
async def examples_route(): return await compute('examples')
