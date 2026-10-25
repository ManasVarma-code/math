"""Finite, bounded request schemas shared by the routes and worker."""
from typing import Literal
from pydantic import BaseModel, Field, ConfigDict

class FiniteModel(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False, extra='forbid')

class EquationInput(FiniteModel):
    m: str = Field(min_length=1, max_length=400)
    n: str = Field(min_length=1, max_length=400)

class SolveInput(EquationInput):
    x0: float | None = None
    y0: float | None = None

class PlotInput(EquationInput):
    x0: float
    y0: float
    x_min: float = -5
    x_max: float = 5
    points: int = Field(default=240, ge=40, le=600)

class ContourInput(EquationInput):
    x0: float = 0
    y0: float = 1
    x_min: float = -5
    x_max: float = 5
    y_min: float = -5
    y_max: float = 5
    resolution: int = Field(default=90, ge=30, le=140)

class Observation(FiniteModel):
    x_value: float
    observed_y: float

class NumericalFitInput(EquationInput):
    observations: list[Observation] = Field(min_length=3, max_length=200)
    x0: float = 0
    initial_guess: float = 1
    lower_bound: float = -1e5
    upper_bound: float = 1e5

class AnalyzeInput(FiniteModel):
    model: Literal['decay', 'growth', 'quadratic']
    observations: list[Observation] = Field(min_length=2, max_length=2000)
    fit_parameter: bool = True
    known_parameter: float | None = None
