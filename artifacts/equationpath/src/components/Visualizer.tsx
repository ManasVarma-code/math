import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  usePlotEquation,
  useContourEquation,
} from "@workspace/api-client-react";
import { ArrowRight, Info } from "lucide-react";
import type { Data } from "plotly.js";
import PlotlyChart from "./PlotlyChart";
import MathView from "./MathView";
import { equationPreview } from "@/lib/math-display";
import { readStorage, writeStorage } from "@/lib/storage";

const defaults = {
  m: "y",
  n: "1",
  x0: "0",
  y0: "1",
  xmin: "-2",
  xmax: "2",
  ymin: "-3",
  ymax: "3",
};
export default function Visualizer() {
  const [location] = useLocation();
  const [form, setForm] = useState(() =>
    readStorage("equationpath-visualizer", defaults),
  );
  const [mode, setMode] = useState<"numerical" | "implicit">("numerical");
  const [result, setResult] = useState<any>(null);
  const [curves, setCurves] = useState<any[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [grid, setGrid] = useState(true);
  const [field, setField] = useState(true);
  const [family, setFamily] = useState(true);
  const signature = JSON.stringify([form, mode]);
  const latest = useRef(signature);
  latest.current = signature;
  const plot = usePlotEquation();
  const contour = useContourEquation();
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("from") !== "solver")
      return;
    const transfer = readStorage<any>(
      "equationpath-equation-transfer-v1",
      null,
    );
    if (transfer)
      setForm((f) => ({
        ...f,
        m: transfer.m,
        n: transfer.n,
        x0: transfer.x0 || "0",
        y0: transfer.y0 || "1",
      }));
  }, [location]);
  useEffect(() => {
    setResult(null);
    setCurves([]);
    setError("");
    writeStorage("equationpath-visualizer", form);
  }, [signature]);
  function change(key: keyof typeof defaults, value: string) {
    setResult(null);
    setCurves([]);
    setForm((f) => ({ ...f, [key]: value }));
  }
  const valid =
    Object.values(form).every((v) => v.trim()) &&
    ["x0", "y0", "xmin", "xmax", "ymin", "ymax"].every((k) =>
      Number.isFinite(Number(form[k as keyof typeof defaults])),
    );
  async function submit() {
    setPending(true);
    setError("");
    setResult(null);
    const active = signature;
    const input = {
      m: form.m,
      n: form.n,
      x0: Number(form.x0),
      y0: Number(form.y0),
      x_min: Number(form.xmin),
      x_max: Number(form.xmax),
    };
    try {
      let primary: any;
      if (mode === "implicit") {
        primary = await contour.mutateAsync({
          data: {
            ...input,
            y_min: Number(form.ymin),
            y_max: Number(form.ymax),
            resolution: 100,
          },
        });
      } else {
        primary = await plot.mutateAsync({ data: { ...input, points: 240 } });
        const neighbors = family
          ? await Promise.allSettled(
              [-1, 1].map((d) =>
                plot.mutateAsync({
                  data: {
                    ...input,
                    y0: input.y0 + d * Math.max(0.5, Math.abs(input.y0) * 0.35),
                    points: 240,
                  },
                }),
              ),
            )
          : [];
        if (latest.current !== active) return;
        setCurves([
          primary,
          ...neighbors.flatMap((r) =>
            r.status === "fulfilled" ? [r.value] : [],
          ),
        ]);
        const failures = neighbors.filter(
          (r) => r.status === "rejected",
        ).length;
        if (failures)
          primary.warnings.push(
            `${failures} nearby initial condition(s) failed on this interval and were omitted.`,
          );
      }
      if (latest.current !== active) return;
      setResult(primary);
      window.dispatchEvent(
        new CustomEvent("equationpath-calculation", {
          detail: {
            module: "Curve visualizer",
            title:
              mode === "implicit"
                ? "Verified potential contour"
                : "Numerical IVP",
            detail: `${form.m} dx + ${form.n} dy; (${form.x0}, ${form.y0})`,
            href: "/visualizer",
          },
        }),
      );
    } catch (e) {
      if (latest.current === active)
        setError(
          e instanceof Error ? e.message : "Could not evaluate this branch.",
        );
    } finally {
      setPending(false);
    }
  }
  const traces: Data[] =
    mode === "implicit" && result
      ? [
          ...(field
            ? [
                {
                  type: "scatter",
                  mode: "lines",
                  x: result.field_x,
                  y: result.field_y,
                  name: "Direction field",
                  connectgaps: false,
                  line: { color: "rgba(150,170,205,.4)", width: 1 },
                  hoverinfo: "skip",
                } as Data,
              ]
            : []),
          {
            type: "contour",
            x: result.x,
            y: result.y,
            z: result.z,
            contours: {
              start: result.level,
              end: result.level,
              size: 1,
              coloring: "lines",
              showlabels: true,
            },
            autocontour: false,
            connectgaps: false,
            showscale: false,
            line: { color: "#41d5e5", width: 3 },
            name: `F = ${result.level.toPrecision(5)}`,
            hovertemplate:
              "x=%{x:.4g}<br>y=%{y:.4g}<extra>Implicit level</extra>",
          },
        ]
      : curves.map((c, i) => ({
          type: "scatter",
          mode: "lines",
          x: c.x,
          y: c.y,
          name: `y(${c.x0}) = ${Number(c.y0.toPrecision(4))}`,
          connectgaps: false,
          line: {
            color: ["#41d5e5", "#aa91f4", "#7294ef"][i],
            width: i === 0 ? 3 : 1.5,
          },
        }));
  if (result && mode === "numerical" && field && result.field_x)
    traces.unshift({
      type: "scatter",
      mode: "lines",
      x: result.field_x,
      y: result.field_y,
      name: "Direction field",
      connectgaps: false,
      line: { color: "rgba(150,170,205,.4)", width: 1 },
      hoverinfo: "skip",
    });
  if (result)
    traces.push({
      type: "scatter",
      mode: "markers",
      x: [Number(form.x0)],
      y: [Number(form.y0)],
      marker: { color: "#f2c76e", size: 10 },
      name: "Initial condition",
    });
  const preview = equationPreview(form.m, form.n);
  const input = (
    key: keyof typeof defaults,
    label: string,
    type = "number",
  ) => (
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
  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <div className="eyebrow">02 / VISUALIZE</div>
          <h1>Curve visualizer</h1>
          <p>
            Explore numerical initial-value branches or level curves of a
            verified potential.
          </p>
        </div>
      </div>
      <div className="visual-layout">
        <section className="panel plot-controls">
          <h3>Equation & initial condition</h3>
          <div className="filter-row">
            {(["numerical", "implicit"] as const).map((v) => (
              <button
                key={v}
                className={`filter-chip ${mode === v ? "selected" : ""}`}
                onClick={() => {
                  setResult(null);
                  setCurves([]);
                  setMode(v);
                }}
              >
                {v === "numerical" ? "Numerical IVP" : "Implicit contour"}
              </button>
            ))}
          </div>
          <div className="two-fields">
            {input("m", "M(x, y)", "text")}
            {input("n", "N(x, y)", "text")}
          </div>
          {preview && <MathView latex={preview} block />}
          <div className="two-fields">
            {input("x0", "x₀")}
            {input("y0", "y₀")}
            {input("xmin", "x minimum")}
            {input("xmax", "x maximum")}
            {mode === "implicit" && (
              <>
                {input("ymin", "y minimum")}
                {input("ymax", "y maximum")}
              </>
            )}
          </div>
          {mode === "numerical" && (
            <label className="check-setting">
              <input
                type="checkbox"
                checked={family}
                onChange={(e) => {
                  setFamily(e.target.checked);
                  setResult(null);
                }}
              />
              <span>Include two nearby initial conditions</span>
            </label>
          )}
          <button
            className="btn btn-primary full-button"
            disabled={pending || !valid}
            onClick={submit}
          >
            {pending ? (
              "Computing…"
            ) : (
              <>
                Compute solution curve <ArrowRight size={15} />
              </>
            )}
          </button>
          {error && (
            <div className="error-box" role="alert">
              <Info size={18} />
              <p>{error}</p>
              <button className="text-button" onClick={submit}>
                Retry
              </button>
            </div>
          )}
          <p className="small-muted">
            The initial condition is required. Numerical mode follows one
            regular y(x) branch. Implicit mode shows all resolved components of
            its level set.
          </p>
        </section>
        <section className="panel chart-panel">
          <div className="card-head">
            <h3>
              {mode === "implicit"
                ? "Potential level set"
                : "Solution trajectories"}
            </h3>
            <span className="method-chip">
              {mode === "implicit"
                ? "Verified symbolic potential"
                : "SciPy solve_ivp"}
            </span>
          </div>
          <div className="chart-actions">
            <button className="filter-chip" onClick={() => setGrid(!grid)}>
              {grid ? "Hide grid" : "Show grid"}
            </button>
            <button className="filter-chip" onClick={() => setField(!field)}>
              {field ? "Hide direction field" : "Show direction field"}
            </button>
          </div>
          {pending ? (
            <div className="plot-empty" role="status">
              Computing from your equation…
            </div>
          ) : result ? (
            <>
              <PlotlyChart
                data={traces}
                xTitle="x"
                yTitle="y"
                showGrid={grid}
                height={420}
              />
              {result.potential_latex && (
                <MathView
                  latex={`${result.potential_latex} = ${result.level.toPrecision(5)}`}
                  block
                />
              )}
              <p className="small-muted">
                Use the graph toolbar to zoom, pan, inspect coordinates, reset
                axes, or download PNG.
              </p>
              {result.warnings?.map((w: string, i: number) => (
                <p className="notice-line" key={i}>
                  <Info size={15} />
                  {w}
                </p>
              ))}
              {result.domain_restrictions?.map((w: string, i: number) => (
                <p className="notice-line" key={i}>
                  {w}
                </p>
              ))}
            </>
          ) : (
            <div className="plot-empty">
              <b>Your computed curves appear here</b>
              <p>
                Choose the equation, an initial condition and a finite interval.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
