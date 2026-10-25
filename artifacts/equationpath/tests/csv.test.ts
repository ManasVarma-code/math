import { test } from "node:test";
import assert from "node:assert/strict";
import { csvCell, parseObservationCsv } from "../src/lib/csv";
import { equationPreview, expressionLatex } from "../src/lib/math-display";

test("CSV maps reordered headers, BOM, quoted case IDs, escaped quotes and CRLF", () => {
  const parsed = parseObservationCsv(
    '\uFEFFobserved_y,case_id,x_value\r\n2,"case, A",0\r\n3,"case ""B""",1',
  );
  assert.deepEqual(parsed.cases?.["case, A"], [{ x_value: 0, observed_y: 2 }]);
  assert.deepEqual(parsed.cases?.['case "B"'], [{ x_value: 1, observed_y: 3 }]);
});
test("CSV handles prototype-like case IDs as plain data", () => {
  const result = parseObservationCsv(
    "case_id,x_value,observed_y\n__proto__,0,1\nconstructor,1,2",
  );
  assert.equal(result.cases?.__proto__[0].observed_y, 1);
  assert.equal(result.cases?.constructor[0].observed_y, 2);
});
test("CSV rejects missing/duplicate headers, invalid rows, duplicates, quotes and oversized uploads", () => {
  for (const source of [
    "x,y\n0,1",
    "case_id,x_value,x_value,observed_y\na,1,1,2",
    "case_id,x_value,observed_y\na,,2",
    "case_id,x_value,observed_y\na,NaN,2",
    "case_id,x_value,observed_y\na,0,1\na,0,2",
    'case_id,x_value,observed_y\n"a,0,2',
    'case_id,x_value,observed_y\n"a"oops,0,2',
    "case_id,x_value,observed_y\na,0,1,extra",
    "x".repeat(1024 * 1024 + 1),
  ])
    assert.ok(parseObservationCsv(source).error, source.slice(0, 80));
});
test("CSV export quotes round-trip accurately", () => {
  const id = 'Case "A", trial';
  const result = parseObservationCsv(
    `case_id,x_value,observed_y\n${csvCell(id)},1,3`,
  );
  assert.equal(result.cases?.[id][0].observed_y, 3);
});
test("Preview preserves unary and power precedence, fractions, functions and rejects code", () => {
  assert.equal(expressionLatex("-x^2"), "-{x}^{2}");
  assert.equal(expressionLatex("x**-2"), "{x}^{-2}");
  assert.match(expressionLatex("sin(x)/(1+y)"), /frac/);
  assert.ok(equationPreview("y", "1"));
  assert.equal(equationPreview("x;alert(1)", "1"), null);
});
