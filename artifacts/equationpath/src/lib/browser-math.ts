import { setLocalRequestHandler } from "@workspace/api-client-react";
import {
  CheckEquationBody,
  SolveEquationBody,
  PlotEquationBody,
  ContourEquationBody,
  AnalyzeDatasetBody,
  FitOdeDatasetBody,
} from "@workspace/api-zod";

type Pending = {
  resolve: (data: any) => void;
  reject: (error: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
};
const pending = new Map<number, Pending>();
let worker: Worker | null = null;
let sequence = 0;
let startupTimer: ReturnType<typeof setTimeout> | undefined;
let status = "Math runs on this device";
export const mathStatus = () => status;
function update(message: string) {
  status = message;
  window.dispatchEvent(
    new CustomEvent("equationpath-math-status", { detail: message }),
  );
}
function reset(message: string) {
  worker?.terminate();
  worker = null;
  clearTimeout(startupTimer);
  for (const item of pending.values()) {
    clearTimeout(item.timer);
    item.reject(new Error(message));
  }
  pending.clear();
  update(message);
}
function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL("./math.worker.ts", import.meta.url), {
    type: "module",
  });
  startupTimer = setTimeout(
    () =>
      reset(
        "Math runtime took too long to load. Retry or rebuild the bundled assets.",
      ),
    120000,
  );
  worker.onmessage = (event) => {
    const data = event.data;
    if (data.type === "fatal") {
      reset(data.error);
      return;
    }
    if (data.type === "progress") {
      update(data.message);
      return;
    }
    if (data.type === "ready") {
      clearTimeout(startupTimer);
      update(data.message);
      return;
    }
    const item = pending.get(data.id);
    if (!item) return;
    if (data.type === "started") {
      item.timer = setTimeout(
        () =>
          reset(
            "Calculation exceeded the 23-second work limit. Simplify the expression or shorten the interval, then retry.",
          ),
        23000,
      );
      return;
    }
    clearTimeout(item.timer);
    pending.delete(data.id);
    if (data.error) item.reject(new Error(data.error));
    else item.resolve(data.result);
  };
  worker.onerror = () =>
    reset("The browser math worker stopped. Retry to restart it.");
  return worker;
}
export function browserCompute(operation: string, payload: unknown = {}) {
  return new Promise<any>((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    getWorker().postMessage({
      id,
      operation,
      payload,
      base: new URL(import.meta.env.BASE_URL, window.location.origin).href,
    });
  });
}
const routes: Record<
  string,
  { operation: string; schema?: { safeParse: (v: unknown) => any } }
> = {
  "/api/equations/check": { operation: "check", schema: CheckEquationBody },
  "/api/equations/solve": { operation: "solve", schema: SolveEquationBody },
  "/api/equations/plot": { operation: "plot", schema: PlotEquationBody },
  "/api/equations/contour": {
    operation: "contour",
    schema: ContourEquationBody,
  },
  "/api/data/analyze": { operation: "analyze", schema: AnalyzeDatasetBody },
  "/api/data/fit-ode": { operation: "fit", schema: FitOdeDatasetBody },
  "/api/examples": { operation: "examples" },
};
export async function runMathOperation(path: string, payload: unknown = {}) {
  if (path === "/api/healthz") return { status: mathStatus() };
  const route = routes[path];
  if (!route)
    throw new Error("This operation is not available in the browser engine.");
  const parsed = route.schema?.safeParse(payload);
  if (parsed && !parsed.success)
    throw new Error(
      parsed.error.issues
        .slice(0, 3)
        .map((issue: any) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; "),
    );
  return browserCompute(route.operation, parsed?.data || payload);
}
export function configureBrowserMath() {
  setLocalRequestHandler(async (input, options) => {
    const path = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
      window.location.origin,
    ).pathname;
    const payload =
      typeof options?.body === "string" ? JSON.parse(options.body) : {};
    return runMathOperation(path, payload);
  });
}
