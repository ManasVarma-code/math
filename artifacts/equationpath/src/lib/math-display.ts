// Display parser only. Calculations and validation always run in the local math engine.
export function expressionLatex(source: string): string {
  const tokens =
    source.match(/\*\*|\d*\.?\d+(?:[eE][+-]?\d+)?|[A-Za-z]+|[+*/^(),-]/g) || [];
  if (tokens.join("") !== source.replace(/\s/g, ""))
    throw new Error("Incomplete expression");
  let at = 0;
  function atom(): string {
    const token = tokens[at++];
    if (token === "(") {
      const inner = sum();
      if (tokens[at++] !== ")") throw new Error();
      return `\\left(${inner}\\right)`;
    }
    if (!token || !/^[\da-zA-Z.]/.test(token)) throw new Error();
    if (tokens[at] === "(") {
      at++;
      const arg = sum();
      if (tokens[at++] !== ")") throw new Error();
      if (token === "sqrt") return `\\sqrt{${arg}}`;
      if (token === "abs") return `\\left|${arg}\\right|`;
      if (
        ![
          "sin",
          "cos",
          "tan",
          "asin",
          "acos",
          "atan",
          "sinh",
          "cosh",
          "tanh",
          "exp",
          "log",
        ].includes(token)
      )
        throw new Error();
      return `\\operatorname{${token}}\\left(${arg}\\right)`;
    }
    return token === "pi" ? "\\pi" : token;
  }
  function power(): string {
    const base = atom();
    if (["**", "^"].includes(tokens[at])) {
      at++;
      return `{${base}}^{${unary()}}`;
    }
    return base;
  }
  function unary(): string {
    if (tokens[at] === "+" || tokens[at] === "-") return tokens[at++] + unary();
    return power();
  }
  function product(): string {
    let value = unary();
    while (tokens[at] === "*" || tokens[at] === "/") {
      const op = tokens[at++],
        rhs = unary();
      value =
        op === "/" ? `\\frac{${value}}{${rhs}}` : `${value} \\cdot ${rhs}`;
    }
    return value;
  }
  function sum(): string {
    let value = product();
    while (tokens[at] === "+" || tokens[at] === "-")
      value += tokens[at++] + product();
    return value;
  }
  const result = sum();
  if (at !== tokens.length) throw new Error();
  return result;
}

export function equationPreview(m: string, n: string): string | null {
  try {
    return `\\left(${expressionLatex(m)}\\right)\\,dx+\\left(${expressionLatex(n)}\\right)\\,dy=0`;
  } catch {
    return null;
  }
}
