export type ObservationRow = { x_value: number; observed_y: number };
function parseCsvGrid(text: string): string[][] {
  text = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let closed = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
        closed = true;
      } else cell += char;
    } else if (char === '"' && cell.length === 0 && !closed) quoted = true;
    else if (char === '"')
      throw new Error(
        "Quotes inside a CSV value must be escaped by doubling them.",
      );
    else if (char === ",") {
      row.push(cell);
      cell = "";
      closed = false;
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
      closed = false;
    } else if (closed && char.trim())
      throw new Error("Unexpected text after a closing CSV quote.");
    else if (!closed) cell += char;
  }
  if (quoted) throw new Error("A quoted CSV value was not closed.");
  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}
export function parseObservationCsv(text: string): {
  cases?: Record<string, ObservationRow[]>;
  error?: string;
} {
  if (new TextEncoder().encode(text).length > 1024 * 1024)
    return { error: "CSV exceeds the 1 MB limit." };
  let rows: string[][];
  try {
    rows = parseCsvGrid(text);
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Could not parse this CSV.",
    };
  }
  if (!rows.length) return { error: "The CSV is empty." };
  const headers = rows[0].map((header) =>
    header
      .replace(/^\uFEFF/, "")
      .trim()
      .toLowerCase(),
  );
  if (new Set(headers).size !== headers.length)
    return { error: "Duplicate CSV column names are not allowed." };
  const required = ["case_id", "x_value", "observed_y"];
  const missing = required.filter((name) => !headers.includes(name));
  if (missing.length)
    return {
      error: `Missing required column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.`,
    };
  const caseIndex = headers.indexOf("case_id");
  const xIndex = headers.indexOf("x_value");
  const yIndex = headers.indexOf("observed_y");
  const groups: Record<string, ObservationRow[]> = Object.create(null);
  for (let i = 1; i < rows.length; i += 1) {
    const line = rows[i];
    if (line.length !== headers.length)
      return {
        error: `Row ${i + 1} has ${line.length} columns; expected ${headers.length}.`,
      };
    const caseId = (line[caseIndex] ?? "").trim();
    const xText = (line[xIndex] ?? "").trim();
    const yText = (line[yIndex] ?? "").trim();
    if (!caseId || !xText || !yText)
      return {
        error: `Row ${i + 1} has a missing case ID, x-value, or observation.`,
      };
    const xValue = Number(xText);
    const observedY = Number(yText);
    if (!Number.isFinite(xValue) || !Number.isFinite(observedY))
      return {
        error: `Row ${i + 1} contains a non-numeric x-value or observation.`,
      };
    const observations = groups[caseId] ?? (groups[caseId] = []);
    if (observations.some((item) => item.x_value === xValue))
      return { error: `Case "${caseId}" has a duplicate x-value (${xText}).` };
    observations.push({ x_value: xValue, observed_y: observedY });
    if (i > 2000)
      return { error: "A CSV may contain at most 2,000 observations." };
  }
  if (!Object.keys(groups).length)
    return { error: "The CSV has a header but no observation rows." };
  return { cases: groups };
}

export const csvCell = (value: string) => `"${value.replaceAll('"', '""')}"`;
