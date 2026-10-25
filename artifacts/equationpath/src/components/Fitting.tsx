import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  useAnalyzeDataset,
  useFitOdeDataset,
  useGetExamples,
} from "@workspace/api-client-react";
import { ArrowDownToLine, ArrowRight, Info } from "lucide-react";
import PlotlyChart from "./PlotlyChart";
import MathView from "./MathView";
import { equationPreview } from "@/lib/math-display";
import { csvCell, parseObservationCsv, type ObservationRow } from "@/lib/csv";
import { downloadFile, readStorage, writeStorage } from "@/lib/storage";

type Model = "decay" | "growth" | "quadratic";
type Dataset = {
  id: string;
  title: string;
  cases: Record<string, ObservationRow[]>;
  source: string;
  generation?: string;
  model?: Model;
  parameter?: number;
};
const metricHelp: Record<string, string> = {
  mse: "Mean squared error: average squared residual, in squared y units.",
  rmse: "Root mean squared error: typical error size in y units.",
  mae: "Mean absolute error: average absolute residual, in y units.",
  r_squared:
    "R² compares squared error to a constant mean prediction. It can be negative; it is undefined when observations have no variance.",
};
const fmt = (v: any) =>
  typeof v === "number" ? Number(v.toPrecision(6)).toString() : "undefined";
const storageKey = "equationpath-datasets-v2";

export default function Fitting() {
  const [location] = useLocation();
  const [library, setLibrary] = useState<Dataset[]>(() =>
    readStorage(storageKey, []),
  );
  const [selected, setSelected] = useState(() =>
    readStorage("equationpath-selected-dataset", ""),
  );
  const [caseId, setCaseId] = useState(() =>
    readStorage("equationpath-selected-case", ""),
  );
  const [numeric, setNumeric] = useState(false);
  const [model, setModel] = useState<Model>("decay");
  const [fitParameter, setFitParameter] = useState(true);
  const [form, setForm] = useState({
    m: "y",
    n: "1",
    x0: "0",
    guess: "1",
    lower: "-100000",
    upper: "100000",
    known: "1",
  });
  const [provenance, setProvenance] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [csvError, setCsvError] = useState("");
  const [pending, setPending] = useState(false);
  const dataset = library.find((d) => d.id === selected);
  const observations = dataset?.cases[caseId] || [];
  const signature = JSON.stringify([
    form,
    model,
    numeric,
    fitParameter,
    selected,
    caseId,
    observations,
  ]);
  const latest = useRef(signature);
  latest.current = signature;
  const analyze = useAnalyzeDataset();
  const fit = useFitOdeDataset();
  const examples = useGetExamples();
  useEffect(() => {
    if (!writeStorage(storageKey, library))
      setCsvError(
        "Browser storage is full or unavailable. Export your observations before closing this page.",
      );
  }, [library]);
  useEffect(() => {
    writeStorage("equationpath-selected-dataset", selected);
    writeStorage("equationpath-selected-case", caseId);
  }, [selected, caseId]);
  useEffect(() => {
    setResult(null);
    setError("");
  }, [signature]);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("from") !== "solver")
      return;
    const transfer = readStorage<any>(
      "equationpath-equation-transfer-v1",
      null,
    );
    if (transfer) {
      setNumeric(true);
      setProvenance(transfer);
      setForm((f) => ({
        ...f,
        m: transfer.m,
        n: transfer.n,
        x0: transfer.x0 || "0",
        guess: transfer.y0 || "1",
      }));
    }
  }, [location]);
  function activate(d: Dataset) {
    setSelected(d.id);
    setCaseId(Object.keys(d.cases)[0]);
    if (d.model) setModel(d.model);
    setForm((f) => ({
      ...f,
      known: d.parameter === undefined ? f.known : String(d.parameter),
    }));
    setCsvError("");
  }
  function addDataset(d: Dataset) {
    if (library.length >= 12) {
      setCsvError(
        "You have 12 saved datasets. Export and remove a dataset before adding another.",
      );
      return;
    }
    setLibrary((items) => [...items, d]);
    activate(d);
  }
  function loadSample(index: number) {
    const sample: any = examples.data?.datasets[index];
    if (!sample) return;
    const id = `sample-${sample.id}`;
    const existing = library.find((d) => d.id === id);
    if (existing) {
      activate(existing);
      return;
    }
    const cases: Record<string, ObservationRow[]> = Object.create(null);
    for (const row of sample.observations) {
      (cases[row.case_id] ||= []).push({
        x_value: row.x_value,
        observed_y: row.observed_y,
      });
    }
    addDataset({
      id,
      title: `${sample.title} (synthetic)`,
      cases,
      source: "",
      model: sample.model,
      parameter: sample.true_parameter,
      generation: sample.generation,
    });
  }
  async function upload(file: File) {
    if (file.size > 1024 * 1024) {
      setCsvError("CSV exceeds the 1 MB limit.");
      return;
    }
    try {
      const source = await file.text();
      const parsed = parseObservationCsv(source);
      if (!parsed.cases) {
        setCsvError(parsed.error || "Invalid CSV.");
        return;
      }
      addDataset({
        id: crypto.randomUUID(),
        title: file.name,
        cases: parsed.cases,
        source,
      });
    } catch {
      setCsvError("The file could not be read.");
    }
  }
  function change(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  const valid = numeric
    ? ["x0", "guess", "lower", "upper"].every(
        (k) =>
          form[k as keyof typeof form].trim() &&
          Number.isFinite(Number(form[k as keyof typeof form])),
      ) &&
      form.m.trim() &&
      form.n.trim()
    : form.known.trim() && Number.isFinite(Number(form.known));
  async function submit() {
    setPending(true);
    setResult(null);
    setError("");
    const active = signature;
    try {
      const response = numeric
        ? await fit.mutateAsync({
            data: {
              m: form.m,
              n: form.n,
              x0: Number(form.x0),
              initial_guess: Number(form.guess),
              lower_bound: Number(form.lower),
              upper_bound: Number(form.upper),
              observations,
            },
          })
        : await analyze.mutateAsync({
            data: {
              model,
              observations,
              fit_parameter: fitParameter,
              known_parameter: Number(form.known),
            },
          });
      if (latest.current !== active) return;
      setResult(response);
      window.dispatchEvent(
        new CustomEvent("equationpath-calculation", {
          detail: {
            module: "Data fitting",
            title: numeric ? "Numerical ODE fit" : `${model} family comparison`,
            detail: `${observations.length} observations · ${response.parameter_name}=${fmt(response.parameter_value)}`,
            href: "/fitting",
          },
        }),
      );
    } catch (e) {
      if (latest.current === active)
        setError(e instanceof Error ? e.message : "Fitting failed.");
    } finally {
      setPending(false);
    }
  }
  const rows: any[] = [...(result?.rows || [])].sort(
    (a, b) => a.x_value - b.x_value,
  );
  const columns = [
    "x_value",
    "observed_y",
    "predicted_y",
    "residual",
    "squared_residual",
    "theoretical_y",
  ];
  function exportResults() {
    const csv = [
      "case_id," + columns.join(","),
      ...rows.map((r) =>
        [csvCell(caseId), ...columns.map((k) => r[k] ?? "")].join(","),
      ),
    ].join("\n");
    downloadFile("equationpath-fit-results.csv", csv, "text/csv");
  }
  function exportSource() {
    const csv =
      dataset?.source ||
      [
        "case_id,x_value,observed_y",
        ...Object.entries(dataset?.cases || {}).flatMap(([id, items]) =>
          items.map((r) => [csvCell(id), r.x_value, r.observed_y].join(",")),
        ),
      ].join("\n");
    downloadFile("equationpath-observations.csv", csv, "text/csv");
  }
  const input = (key: keyof typeof form, label: string, type = "number") => (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        aria-label={label}
        type={type}
        step="any"
        value={form[key]}
        onChange={(e) => change(key, e.target.value)}
      />
    </label>
  );
  const preview = equationPreview(form.m, form.n);
  const observed = {
    type: "scatter" as const,
    mode: "markers" as const,
    name: "Observed",
    x: rows.map((r) => r.x_value),
    y: rows.map((r) => r.observed_y),
    marker: { color: "#a892f4", size: 8 },
  };
  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <div className="eyebrow">03 / COMPARE</div>
          <h1>Data & curve fitting</h1>
          <p>
            Connect a solution branch to observations, estimate its initial
            value and inspect every residual.
          </p>
        </div>
      </div>
      {provenance && (
        <div className="notice-line">
          <Info size={15} />
          <div>
            Transferred from solver:{" "}
            {provenance.solution?.classification || provenance.solution?.method}
            . {provenance.solution?.domain_restrictions?.join("; ")}
            <p className="small-muted">
              The entered ODE is integrated directly; your initial guess selects
              a regular branch.
            </p>
          </div>
        </div>
      )}
      <div className="fitting-layout">
        <div className="fit-input-column">
          <section className="panel">
            <h3>Comparison method</h3>
            <div className="filter-row">
              <button
                className={`filter-chip ${numeric ? "selected" : ""}`}
                onClick={() => setNumeric(true)}
              >
                Fit entered ODE
              </button>
              <button
                className={`filter-chip ${!numeric ? "selected" : ""}`}
                onClick={() => setNumeric(false)}
              >
                Sample model
              </button>
            </div>
            {numeric ? (
              <>
                <p className="small-muted">
                  Estimate y(x₀) on a regular branch with SciPy integration and
                  local least squares. Use at least 3 distinct coordinates.
                </p>
                <div className="two-fields">
                  {input("m", "M(x, y)", "text")}
                  {input("n", "N(x, y)", "text")}
                  {input("x0", "Reference x₀")}
                  {input("guess", "Initial y₀ guess")}
                  {input("lower", "Lower y₀ bound")}
                  {input("upper", "Upper y₀ bound")}
                </div>
                {preview && <MathView latex={preview} block />}
              </>
            ) : (
              <>
                <label className="field">
                  <span className="field-label">Model family</span>
                  <select
                    aria-label="Model family"
                    value={model}
                    onChange={(e) => setModel(e.target.value as Model)}
                  >
                    <option value="decay">Exponential decay: C exp(−x)</option>
                    <option value="growth">
                      Exponential growth: C exp(2x)
                    </option>
                    <option value="quadratic">Quadratic: x² + C</option>
                  </select>
                </label>
                {input("known", "Theoretical reference C")}
                {dataset && dataset.parameter === undefined && (
                  <p className="notice-line">
                    No reference C available for uploaded data; theoretical
                    curve uses C = {form.known}. Change it or use the fitted
                    value.
                  </p>
                )}
                <button
                  className="btn btn-secondary"
                  disabled={
                    result?.parameter_name !== "C" ||
                    !Number.isFinite(result?.parameter_value)
                  }
                  onClick={() =>
                    change("known", String(result.parameter_value))
                  }
                >
                  Use fitted C as reference
                </button>
                <label className="check-setting">
                  <input
                    type="checkbox"
                    checked={fitParameter}
                    onChange={(e) => setFitParameter(e.target.checked)}
                  />
                  <span>Fit C by least squares</span>
                </label>
              </>
            )}
          </section>
          <section className="panel">
            <h3>Dataset manager</h3>
            <button
              className="btn btn-secondary"
              onClick={() =>
                downloadFile(
                  "equationpath-template.csv",
                  "case_id,x_value,observed_y\nexample,0,2\nexample,1,0.735758882\n",
                  "text/csv",
                )
              }
            >
              Download CSV template
            </button>
            <label
              className="upload-zone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files[0])
                  void upload(e.dataTransfer.files[0]);
              }}
            >
              <input
                type="file"
                accept=".csv,text/csv"
                data-testid="input-csv-upload"
                onChange={(e) => {
                  if (e.target.files?.[0]) void upload(e.target.files[0]);
                  e.target.value = "";
                }}
              />
              <ArrowDownToLine size={20} />
              <span>
                <b>Drop a CSV here or browse files</b>
                <small>
                  case_id, x_value, observed_y · up to 1 MB / 2,000 rows
                </small>
              </span>
            </label>
            {csvError && (
              <p className="notice-line warning-line" role="alert">
                {csvError}
              </p>
            )}
            <label className="field">
              <span className="field-label">Bundled synthetic examples</span>
              <select
                aria-label="Sample dataset"
                value=""
                onChange={(e) => loadSample(Number(e.target.value))}
              >
                <option value="" disabled>
                  Choose synthetic observations…
                </option>
                {examples.data?.datasets.map((d: any, i) => (
                  <option key={i} value={i}>
                    {d.title} (synthetic)
                  </option>
                ))}
              </select>
            </label>
            {examples.isError && (
              <div className="notice-line" role="alert">
                Could not load sample data.{" "}
                <button
                  className="text-button"
                  onClick={() => void examples.refetch()}
                >
                  Retry
                </button>
              </div>
            )}
            {library.length > 0 && (
              <>
                <label className="field">
                  <span className="field-label">
                    Saved datasets ({library.length}/12)
                  </span>
                  <select
                    aria-label="Saved dataset"
                    value={selected}
                    onChange={(e) => {
                      const d = library.find((d) => d.id === e.target.value);
                      if (d) activate(d);
                    }}
                  >
                    {library.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.title}
                      </option>
                    ))}
                  </select>
                </label>
                {dataset && (
                  <label className="field">
                    <span className="field-label">Case ID</span>
                    <select
                      aria-label="Case ID"
                      value={caseId}
                      onChange={(e) => setCaseId(e.target.value)}
                    >
                      {Object.entries(dataset.cases).map(([id, items]) => (
                        <option key={id} value={id}>
                          {id} ({items.length} rows)
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </>
            )}
            {dataset?.generation && (
              <p className="small-muted">{dataset.generation}</p>
            )}
            {observations.length > 0 && (
              <>
                <div className="preview-head">
                  <b>Preview · {observations.length} rows</b>
                  <button className="text-button" onClick={exportSource}>
                    Export observations
                  </button>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>x value</th>
                        <th>Observed y</th>
                      </tr>
                    </thead>
                    <tbody>
                      {observations.slice(0, 8).map((r, i) => (
                        <tr key={i}>
                          <td>{fmt(r.x_value)}</td>
                          <td>{fmt(r.observed_y)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  className="btn btn-quiet"
                  onClick={() => {
                    setLibrary((items) =>
                      items.filter((d) => d.id !== selected),
                    );
                    setSelected("");
                    setCaseId("");
                  }}
                >
                  Remove selected dataset
                </button>
              </>
            )}
            <button
              className="btn btn-primary full-button"
              disabled={
                pending ||
                !valid ||
                observations.length < (numeric ? 3 : 2) ||
                observations.length > (numeric ? 200 : 2000)
              }
              onClick={submit}
            >
              {pending ? (
                "Fitting model…"
              ) : (
                <>
                  Analyze observations <ArrowRight size={15} />
                </>
              )}
            </button>
            {numeric && observations.length > 200 && (
              <p className="notice-line">
                Numerical fitting supports at most 200 observations per case.
              </p>
            )}
            {error && (
              <div className="error-box" role="alert">
                <p>{error}</p>
                <button className="text-button" onClick={submit}>
                  Retry
                </button>
              </div>
            )}
          </section>
        </div>
        <div className="fit-results-column">
          <section className="panel fit-result-card">
            {pending ? (
              <div className="fit-empty" role="status">
                Integrating and fitting your model…
              </div>
            ) : result ? (
              <>
                <div className="card-head">
                  <h3>Fit summary</h3>
                  <button className="btn btn-secondary" onClick={exportResults}>
                    <ArrowDownToLine size={16} />
                    Export CSV
                  </button>
                </div>
                <div className="fit-parameter">
                  <span>{result.parameter_name || "Reference only"}</span>
                  <strong>{fmt(result.parameter_value)}</strong>
                </div>
                <div className="metrics-grid">
                  {Object.entries(result.metrics).map(([key, value]) => (
                    <div
                      className="metric-box"
                      key={key}
                      title={metricHelp[key]}
                    >
                      <small>{key.replaceAll("_", " ")}</small>
                      <b>{fmt(value)}</b>
                    </div>
                  ))}
                </div>
                <p className="analysis-note">{result.note}</p>
                <h3>Observed vs theoretical reference</h3>
                <PlotlyChart
                  xTitle="x"
                  yTitle="y"
                  height={280}
                  data={[
                    observed,
                    {
                      type: "scatter",
                      mode: "lines",
                      name: "Theoretical reference",
                      x: rows.map((r) => r.x_value),
                      y: rows.map((r) => r.theoretical_y),
                      line: { color: "#7294ef" },
                    },
                  ]}
                />
                {rows.some((r) => r.predicted_y !== null) && (
                  <>
                    <h3>Observed vs fitted solution</h3>
                    <PlotlyChart
                      xTitle="x"
                      yTitle="y"
                      height={300}
                      data={[
                        observed,
                        {
                          type: "scatter",
                          mode: "lines+markers",
                          name: "Fitted solution",
                          x: rows.map((r) => r.x_value),
                          y: rows.map((r) => r.predicted_y),
                          line: { color: "#41d5e5" },
                        },
                      ]}
                    />
                    <h3>Residuals vs x</h3>
                    <PlotlyChart
                      xTitle="x"
                      yTitle="Observed − predicted"
                      height={260}
                      data={[
                        {
                          type: "scatter",
                          mode: "markers",
                          name: "Residual",
                          x: rows.map((r) => r.x_value),
                          y: rows.map((r) => r.residual),
                          marker: { color: "#f2c76e", size: 8 },
                        },
                        {
                          type: "scatter",
                          mode: "lines",
                          name: "Zero residual",
                          x: [rows[0].x_value, rows.at(-1).x_value],
                          y: [0, 0],
                          line: { color: "#7a8999", dash: "dot" },
                        },
                      ]}
                    />
                    <h3>Observed vs predicted</h3>
                    <PlotlyChart
                      xTitle="Predicted y"
                      yTitle="Observed y"
                      height={280}
                      data={[
                        {
                          type: "scatter",
                          mode: "markers",
                          name: "Observations",
                          x: rows.map((r) => r.predicted_y),
                          y: rows.map((r) => r.observed_y),
                          marker: { color: "#a892f4", size: 8 },
                        },
                        {
                          type: "scatter",
                          mode: "lines",
                          name: "Perfect agreement y=x",
                          x: [
                            Math.min(...rows.map((r) => r.predicted_y)),
                            Math.max(...rows.map((r) => r.predicted_y)),
                          ],
                          y: [
                            Math.min(...rows.map((r) => r.predicted_y)),
                            Math.max(...rows.map((r) => r.predicted_y)),
                          ],
                          line: { color: "#7a8999", dash: "dot" },
                        },
                      ]}
                    />
                  </>
                )}
                <div className="table-scroll result-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        {columns.map((k) => (
                          <th key={k}>{k.replaceAll("_", " ")}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i}>
                          {columns.map((k) => (
                            <td key={k}>{fmt(r[k])}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="analysis-note">
                  <div>
                    {Object.entries(metricHelp).map(([key, text]) => (
                      <p key={key}>{text}</p>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="fit-empty">
                <h3>Fit values and residuals</h3>
                <p>
                  Select a dataset and case, choose a model and analyze the
                  observations. Calculations run on this device.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
