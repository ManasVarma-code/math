/// <reference lib="webworker" />
const sources = import.meta.glob<string>("../../backend/app/*.py", {
  query: "?raw",
  import: "default",
  eager: true,
});
const datasets = import.meta.glob<string>("../../datasets/*.csv", {
  query: "?raw",
  import: "default",
  eager: true,
});
let runtime: any;
let loading: Promise<void> | null = null;
const send = (message: unknown) => self.postMessage(message);
async function initialize(base: string) {
  send({
    type: "progress",
    message: "Loading bundled WebAssembly math runtime…",
  });
  const module = await import(/* @vite-ignore */ `${base}python/pyodide.mjs`);
  runtime = await module.loadPyodide({
    indexURL: `${base}python/`,
    stdout: () => {},
    stderr: () => {},
  });
  send({
    type: "progress",
    message: "Loading bundled SymPy, NumPy and SciPy…",
  });
  await runtime.loadPackage(["sympy", "numpy", "scipy"], {
    messageCallback: () => {},
    errorCallback: () => {},
  });
  runtime.FS.mkdirTree("/equationpath/backend/app");
  runtime.FS.mkdirTree("/equationpath/datasets");
  const allowed = [
    "__init__.py",
    "engine.py",
    "errors.py",
    "analysis.py",
    "parser.py",
    "symbolic.py",
    "numerical.py",
  ];
  for (const [name, source] of Object.entries(sources)) {
    const file = name.split("/").at(-1)!;
    if (allowed.includes(file))
      runtime.FS.writeFile(`/equationpath/backend/app/${file}`, source);
  }
  for (const [name, source] of Object.entries(datasets))
    runtime.FS.writeFile(
      `/equationpath/datasets/${name.split("/").at(-1)!}`,
      source,
    );
  runtime.runPython(`
import sys,json
from types import SimpleNamespace
sys.path.insert(0,'/equationpath/backend')
from app import engine
from app.errors import CalculationError
def equationpath_compute(operation,payload):
    try:
        data=json.loads(payload)
        defaults={'plot':{'x_min':-5,'x_max':5,'points':240},'contour':{'x0':0,'y0':1,'x_min':-5,'x_max':5,'y_min':-5,'y_max':5,'resolution':90},'fit':{'x0':0,'initial_guess':1,'lower_bound':-100000,'upper_bound':100000},'analyze':{'fit_parameter':True,'known_parameter':None}}
        data={**defaults.get(operation,{}),**data}
        if 'observations' in data: data['observations']=[SimpleNamespace(**r) for r in data['observations']]
        handlers={'check':engine.check_equation,'solve':engine.solve_equation,'plot':engine.plot_equation,'contour':engine.contour_equation,'fit':engine.fit_ode_dataset,'analyze':engine.analyze_dataset}
        result=engine.get_examples() if operation=='examples' else handlers[operation](SimpleNamespace(**data))
        return json.dumps({'result':result},allow_nan=False)
    except CalculationError as exc: return json.dumps({'error':exc.detail})
    except Exception as exc: return json.dumps({'error':'Could not evaluate this calculation on the supplied real domain. '+str(exc)[:180]})
`);
  send({ type: "ready", message: "Browser math engine ready" });
}
let queue = Promise.resolve();
self.onmessage = (event: MessageEvent) => {
  const { id, operation, payload, base } = event.data;
  queue = queue.then(async () => {
    try {
      loading ??= initialize(base);
      await loading;
      send({ type: "started", id });
      runtime.globals.set("_operation", operation);
      runtime.globals.set("_payload", JSON.stringify(payload));
      const output = runtime.runPython(
        "equationpath_compute(_operation,_payload)",
      );
      send({ type: "result", id, ...JSON.parse(output) });
    } catch (e) {
      send({
        type: "fatal",
        error:
          e instanceof Error
            ? e.message
            : "The bundled math runtime could not load. Retry or rebuild its assets.",
      });
      loading = null;
    }
  });
};
