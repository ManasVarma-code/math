"""Restricted mathematical AST parser. No eval, sympify strings, or Python objects."""
import ast
import math
import sympy as sp

x, y = sp.symbols('x y', real=True)
FUNCTIONS = {name: getattr(sp, name) for name in (
    'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'exp', 'log', 'sqrt')}
FUNCTIONS['abs'] = sp.Abs


def _from_ast(node, depth=0):
    if depth > 24:
        raise ValueError('Expression nesting is limited to 24 levels.')
    visit = lambda child: _from_ast(child, depth + 1)
    if isinstance(node, ast.Expression):
        return visit(node.body)
    if isinstance(node, ast.Constant) and type(node.value) in (int, float):
        if not math.isfinite(node.value) or abs(node.value) > 1e6:
            raise ValueError('Numeric literals must be finite and no larger than 1,000,000.')
        return sp.Integer(node.value) if type(node.value) is int else sp.Rational(str(node.value))
    if isinstance(node, ast.Name) and node.id in {'x', 'y', 'pi', 'E'}:
        return {'x': x, 'y': y, 'pi': sp.pi, 'E': sp.E}[node.id]
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
        return visit(node.operand) * (-1 if isinstance(node.op, ast.USub) else 1)
    if isinstance(node, ast.BinOp):
        left, right = visit(node.left), visit(node.right)
        if isinstance(node.op, ast.Pow):
            if right.is_number and (right.is_real is not True or abs(right) > 32):
                raise ValueError('Numeric exponents are limited to magnitude 32.')
            return left ** right
        if isinstance(node.op, ast.Add): return left + right
        if isinstance(node.op, ast.Sub): return left - right
        if isinstance(node.op, ast.Mult): return left * right
        if isinstance(node.op, ast.Div):
            if right == 0: raise ValueError('Division by zero is undefined.')
            return left / right
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
        if node.func.id in FUNCTIONS and len(node.args) == 1 and not node.keywords:
            argument = visit(node.args[0])
            if node.func.id == 'exp' and argument.is_number and abs(argument) > 100:
                raise ValueError('Constant exponential arguments are limited to magnitude 100.')
            value = FUNCTIONS[node.func.id](argument)
            if value.has(sp.zoo,sp.oo,-sp.oo,sp.nan,sp.I) or value.is_real is False:
                raise ValueError('This function argument is outside its supported real domain.')
            return value
    raise ValueError('Use x, y, pi, E, arithmetic, powers and supported single-argument functions only.')


def parse_expression(source):
    if not isinstance(source, str) or not source.strip() or len(source) > 400:
        raise ValueError('Enter an expression of 1–400 characters for both M and N.')
    try:
        tree = ast.parse(source.strip().replace('^', '**'), mode='eval')
        if sum(1 for _ in ast.walk(tree)) > 180:
            raise ValueError('This expression is too complex to process safely.')
        result = _from_ast(tree)
        if result.has(sp.zoo, sp.oo, -sp.oo, sp.nan, sp.I) or sp.count_ops(result) > 120:
            raise ValueError('Expression is undefined, non-real, or too complex.')
        return result
    except (SyntaxError, TypeError, ZeroDivisionError, RecursionError, OverflowError) as exc:
        raise ValueError('Could not parse the expression. Check operators and parentheses.') from exc


def domain_restrictions(*expressions):
    """Conservative real-domain conditions; cancellations are handled by source constraints."""
    restrictions = set()
    for expression in expressions:
        for item in sp.preorder_traversal(expression):
            if item.func == sp.log: restrictions.add(f'{sp.sstr(item.args[0])} > 0')
            if item.func == sp.tan: restrictions.add(f'cos({sp.sstr(item.args[0])}) != 0')
            if item.func in (sp.asin, sp.acos): restrictions.add(f'-1 <= {sp.sstr(item.args[0])} <= 1')
            if item.is_Pow:
                base, power = item.args
                if power.is_negative: restrictions.add(f'{sp.sstr(base)} != 0')
                if power.is_Rational and power.q % 2 == 0: restrictions.add(f'{sp.sstr(base)} >= 0')
    return sorted(restrictions)


def source_constraints(source):
    """Retain domains lost to algebraic cancellations such as x/x or 0*log(x)."""
    tree = ast.parse(source.strip().replace('^', '**'), mode='eval')
    constraints = []
    for node in ast.walk(tree):
        if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Div):
            constraints.append(('nonzero', _from_ast(node.right)))
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and len(node.args) == 1:
            kind = {'log': 'positive', 'sqrt': 'nonnegative', 'asin': 'unit', 'acos': 'unit', 'tan': 'cosine'}.get(node.func.id)
            if kind: constraints.append((kind, _from_ast(node.args[0])))
        if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Pow):
            power = _from_ast(node.right)
            if power.is_negative: constraints.append(('nonzero', _from_ast(node.left)))
            if power.is_Rational and power.q % 2 == 0: constraints.append(('nonnegative', _from_ast(node.left)))
    # Preserve sign changes of repeated factors too: x**2 is nonzero iff x is.
    expanded = []
    for kind, expr in constraints:
        if kind == 'nonzero':
            for factor in sp.Mul.make_args(sp.factor(expr)):
                expanded.append((kind, factor.base if factor.is_Pow else factor))
        else:
            expanded.append((kind, expr))
    return expanded


def source_restrictions(*sources):
    output = set()
    for source in sources:
        for kind, expression in source_constraints(source):
            value = sp.sstr(expression)
            output.add({'nonzero': f'{value} != 0', 'positive': f'{value} > 0',
                        'nonnegative': f'{value} >= 0', 'unit': f'-1 <= {value} <= 1',
                        'cosine': f'cos({value}) != 0'}[kind])
    return sorted(output)
