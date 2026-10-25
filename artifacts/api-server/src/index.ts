import app from "./app";
import { logger } from "./lib/logger";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";

const rawPort = process.env["PORT"] ?? "3001";

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const workspaceRoot = path.resolve(process.cwd(), "../..");
const mathBackendPath = path.resolve(process.cwd(), "../equationpath/backend");
const candidates = [
  path.join(workspaceRoot, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python"),
  path.join(workspaceRoot, ".pythonlibs", "bin", "python"),
];
const pythonPath = process.env.PYTHON_PATH ?? candidates.find(existsSync) ?? "python";
const mathServicePort = Number(process.env.MATH_SERVICE_PORT ?? 8765);
let mathProcess: ChildProcess | undefined;

async function startMathService(): Promise<void> {
  if (process.env.MATH_SERVICE_URL) return;
  mathProcess = spawn(
    pythonPath,
    [
      "-m",
      "uvicorn",
      "app.main:app",
      "--host",
      "127.0.0.1",
      "--port",
      String(mathServicePort),
      "--log-level",
      "warning",
    ],
    {
      cwd: mathBackendPath,
      stdio: ["ignore", "inherit", "inherit"],
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    },
  );

  mathProcess.on("error", (error) => {
    logger.error({ error }, "Could not start the EquationPath math service");
  });
  mathProcess.on("exit", (code, signal) => {
    if (code !== 0 && code !== null) {
      logger.error({ code, signal }, "EquationPath math service exited unexpectedly");
    }
  });

  const healthUrl = `http://127.0.0.1:${mathServicePort}/healthz`;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (mathProcess.exitCode !== null) {
      logger.error({ exitCode: mathProcess.exitCode }, "EquationPath math service failed during startup");
      throw new Error("Math service failed to start. Install backend/requirements.txt into .venv or set PYTHON_PATH.");
    }
    try {
      const response = await fetch(healthUrl, { signal: AbortSignal.timeout(500) });
      if (response.ok) {
        logger.info("EquationPath math service is ready");
        return;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error("EquationPath math service did not become ready within 20 seconds");
}

function stopMathService(): void {
  mathProcess?.kill("SIGTERM");
}

process.once("SIGINT", stopMathService);
process.once("SIGTERM", stopMathService);

await startMathService();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
