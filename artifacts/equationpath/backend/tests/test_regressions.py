import math
import unittest
import numpy as np
from app.errors import CalculationError as HTTPException
from pydantic import ValidationError
from app.main import (EquationInput, PlotInput, ContourInput, NumericalFitInput, AnalyzeInput,
                      Observation, check_equation, solve_equation, contour_equation, plot_equation,
                      fit_ode_dataset, analyze_dataset, parse_expression, exactness, get_examples)


class RegressionTests(unittest.TestCase):
    def observations(self,fn,xs):
        return [Observation(x_value=t,observed_y=fn(t)) for t in xs]

    def test_caret_normalization_and_exact_rationals(self):
        self.assertEqual(parse_expression('x^2'),parse_expression('x**2'))
        self.assertEqual(parse_expression('0.1+0.2'),parse_expression('3/10'))

    def test_unsafe_and_pathological_inputs(self):
        for source in ['True','x.__class__','[x]','sum(x)','log(x,2)','x if y else 1','1/0','log(0)','sqrt(-1)','0*log(-1)','0*asin(2)','1e999','10**999999','exp(999999)','x%2',"__import__('os')"]:
            with self.subTest(source=source),self.assertRaises(ValueError): parse_expression(source)

    def test_constant_ratio_integrating_factor(self):
        result=exactness(parse_expression('(1+x)*y**2/2+y'),parse_expression('1+x*y'))
        self.assertEqual(result['method'],'integrating_factor_x')
        self.assertEqual(result['factor'],'exp(x)')

    def test_original_domain_survives_cancellation(self):
        result=solve_equation(EquationInput(m='x/x',n='1'))
        self.assertIn('x != 0',result['domain_restrictions'])
        with self.assertRaises(HTTPException):
            plot_equation(PlotInput(m='x/x',n='1',x0=-1,y0=0,x_min=-1,x_max=1))

    def test_factor_domain_is_specific(self):
        result=solve_equation(EquationInput(m='y**2',n='x*y'))
        self.assertIn('y != 0',result['domain_restrictions'])
        self.assertTrue(all(result['verification'].values()))

    def test_singular_ivps_are_rejected(self):
        for m,n,x0,y0,lo,hi in [('1','x',-1,0,-1,1),('1','y',0,1,0,2),('1','0',0,1,0,1),('log(x)','1',0,1,0,1)]:
            with self.subTest(m=m,n=n),self.assertRaises(HTTPException):
                plot_equation(PlotInput(m=m,n=n,x0=x0,y0=y0,x_min=lo,x_max=hi))

    def test_ivp_includes_initial_value_at_both_interval_boundaries(self):
        for start in [0,1]:
            r=plot_equation(PlotInput(m='y',n='1',x0=start,y0=math.exp(-start),x_min=0,x_max=1))
            self.assertAlmostEqual(r['y'][0],1,delta=1e-6)
            self.assertAlmostEqual(r['y'][-1],math.exp(-1),delta=1e-6)

    def test_fit_both_sides_of_reference_unsorted_and_close_coordinates(self):
        xs=[1,-1,1e-13,0,.5,-.5]
        r=fit_ode_dataset(NumericalFitInput(m='y',n='1',x0=0,initial_guess=1,observations=self.observations(lambda t:2.5*math.exp(-t),xs)))
        self.assertAlmostEqual(r['parameter_value'],2.5,delta=1e-5)
        self.assertLess(r['metrics']['rmse'],1e-6)

    def test_fit_non_example_ode(self):
        r=fit_ode_dataset(NumericalFitInput(m='-x-y',n='1',x0=0,initial_guess=1,observations=self.observations(lambda t:3*math.exp(t)-t-1,[-1,-.5,0,.5,1])))
        self.assertAlmostEqual(r['parameter_value'],2,delta=1e-5)

    def test_fit_rejects_invalid_guess_singular_path_and_bounds(self):
        rows=self.observations(lambda t:1,[0,.5,1])
        for kwargs in [dict(m='1',n='y',initial_guess=0),dict(m='y',n='1',lower_bound=2,upper_bound=1),dict(m='y',n='1',initial_guess=2,lower_bound=0,upper_bound=1)]:
            with self.subTest(kwargs=kwargs),self.assertRaises(HTTPException): fit_ode_dataset(NumericalFitInput(observations=rows,**kwargs))

    def test_nonidentifiable_fit_is_not_success(self):
        with self.assertRaises(HTTPException):
            fit_ode_dataset(NumericalFitInput(m='100*y',n='1',observations=self.observations(lambda t:0,[10,11,12])))

    def test_finite_schema_validation(self):
        with self.assertRaises(ValidationError): Observation(x_value=float('nan'),observed_y=1)
        with self.assertRaises(ValidationError): PlotInput(m='y',n='1',x0=0,y0=float('inf'))

    def test_residual_and_metrics_are_actual_computations(self):
        r=analyze_dataset(AnalyzeInput(model='quadratic',observations=self.observations(lambda t:t*t+2+[.1,-.1,0][int(t)],[0,1,2])))
        residuals=[row['observed_y']-row['predicted_y'] for row in r['rows']]
        self.assertAlmostEqual(r['metrics']['mse'],sum(e*e for e in residuals)/3)
        for row in r['rows']: self.assertAlmostEqual(row['squared_residual'],row['residual']**2)

    def test_reference_only_analysis_retains_rows(self):
        r=analyze_dataset(AnalyzeInput(model='decay',fit_parameter=False,known_parameter=2,observations=self.observations(lambda t:2*math.exp(-t),[0,1])))
        self.assertEqual(len(r['rows']),2)
        self.assertIsNone(r['metrics']['rmse'])
        self.assertAlmostEqual(r['rows'][1]['theoretical_y'],2*math.exp(-1))

    def test_model_overflow_or_underflow_is_explained(self):
        for model in ['growth','decay']:
            with self.assertRaises(HTTPException): analyze_dataset(AnalyzeInput(model=model,observations=self.observations(lambda t:1,[1000,1001])))

    def test_implicit_contour_evaluates_actual_potential(self):
        r=contour_equation(ContourInput(m='2*x',n='2*y',x0=1,y0=0,x_min=-2,x_max=2,y_min=-2,y_max=2,resolution=40))
        self.assertAlmostEqual(r['level'],1)
        self.assertEqual(len(r['z']),40)
        self.assertAlmostEqual(r['z'][0][0],8)
        self.assertTrue(len(r['field_x'])>0)

    def test_implicit_masks_singular_sets_and_rejects_invalid_initial_point(self):
        r=contour_equation(ContourInput(m='y',n='x**2',x0=1,y0=1,x_min=-2,x_max=2,resolution=40))
        self.assertTrue(any(v is None for row in r['z'] for v in row))
        with self.assertRaises(HTTPException):contour_equation(ContourInput(m='y**2',n='x*y',x0=1,y0=0))

    def test_all_five_examples_are_recomputed_and_verified(self):
        examples=get_examples()['examples']
        self.assertEqual(len(examples),5)
        for example in examples:
            if example['kind']=='unsupported': self.assertEqual(example['solution']['status'],'unsupported')
            else: self.assertTrue(all(example['solution']['verification'].values()))

    def test_degenerate_form_rejected(self):
        with self.assertRaises(HTTPException):check_equation(EquationInput(m='0',n='0'))


class StudentWorkflowTests(unittest.TestCase):
    def test_integrating_factor_is_first_class_and_exact_is_null(self):
        for m,n,expected in [('y','x',None),('y','x**2','exp(-1/x)/x**2'),('y**2','x*y','1/y')]:
            result=solve_equation(EquationInput(m=m,n=n))
            self.assertEqual(result['integrating_factor'],expected)
            if expected:self.assertTrue(result['integrating_factor_latex'])
            else:self.assertIsNone(result['integrating_factor_latex'])

    def test_unsupported_ratios_and_student_friendly_scope(self):
        import sympy as sp
        from app.parser import x,y
        result=solve_equation(EquationInput(m='y**2+x',n='x*y**2+1'))
        self.assertEqual(result['status'],'unsupported')
        self.assertIsNone(result['integrating_factor'])
        self.assertEqual(sp.simplify(parse_expression(result['ratio_x'])-(2*y-y**2)/(x*y**2+1)),0)
        self.assertEqual(sp.simplify(parse_expression(result['ratio_y'])-(y**2-2*y)/(y**2+x)),0)
        self.assertIn('not exact',result['steps'][0])
        self.assertIn('conditions failed',result['steps'][0])
        self.assertIn('μ(xy)',result['steps'][0])
        self.assertIn('μ(x+y)',result['steps'][0])
        self.assertIn('does not mean',result['steps'][0])

    def test_particular_solution_exact_symbolic_constant(self):
        from app.schemas import SolveInput
        r=solve_equation(SolveInput(m='2*x*y+3',n='x**2+4*y',x0=1,y0=2))
        self.assertEqual(r['constant'],'13')
        self.assertEqual(r['particular_solution'],'x**2*y + 3*x + 2*y**2 = 13')
        r=solve_equation(SolveInput(m='y',n='x',x0=0.1,y0=0.2))
        self.assertEqual(r['constant'],'1/50')
        r=solve_equation(SolveInput(m='y',n='x**2',x0=1,y0=2))
        self.assertEqual(r['constant'],'2*exp(-1)')

    def test_particular_solution_rejects_invalid_domains_and_partial_initial_condition(self):
        from app.schemas import SolveInput
        for args in [dict(m='y**2',n='x*y',x0=1,y0=0),dict(m='x/x',n='1',x0=0,y0=1),dict(m='y',n='x',x0=1)]:
            with self.subTest(args=args),self.assertRaises(HTTPException):solve_equation(SolveInput(**args))

    def test_every_practice_label_is_computed_and_solved_when_supported(self):
        import json
        from pathlib import Path
        rows=json.loads((Path(__file__).resolve().parents[2]/'datasets/practice.json').read_text())
        self.assertGreaterEqual(len(rows),12)
        self.assertEqual(len({r['id'] for r in rows}),len(rows))
        methods=set()
        for row in rows:
            result=solve_equation(EquationInput(m=row['m'],n=row['n']))
            computed='unsupported' if result['status']=='unsupported' else result['method']
            with self.subTest(row=row['id']):self.assertEqual(computed,row['expected_method'])
            methods.add(computed)
            if computed!='unsupported':self.assertTrue(all(result['verification'].values()))
        self.assertEqual(methods,{'exact','integrating_factor_x','integrating_factor_y','unsupported'})


if __name__=='__main__':unittest.main()
