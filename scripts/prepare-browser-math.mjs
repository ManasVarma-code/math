// Package all runtime dependencies into static site assets. No runtime CDN/API calls.
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  copyFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = path.join(root, "artifacts/equationpath");
const require = createRequire(path.join(app, "package.json"));
const runtime = path.dirname(require.resolve("pyodide/package.json"));
const destination = path.join(app, "public/python");
await mkdir(destination, { recursive: true });
const packageInfo = JSON.parse(
  await readFile(path.join(runtime, "package.json"), "utf8"),
);
const lock = JSON.parse(
  await readFile(path.join(runtime, "pyodide-lock.json"), "utf8"),
);
for (const name of await readdir(runtime)) {
  if (/\.(mjs|js|wasm|zip|json)$/.test(name) && !name.endsWith(".map"))
    await copyFile(path.join(runtime, name), path.join(destination, name));
}
const needed = new Set();
function collect(name) {
  if (needed.has(name)) return;
  const pkg = lock.packages[name];
  if (!pkg) throw new Error(`Pyodide package missing: ${name}`);
  needed.add(name);
  for (const dep of pkg.depends || []) collect(dep);
}
for (const name of ["sympy", "numpy", "scipy"]) collect(name);
const sha = (data) => createHash("sha256").update(data).digest("hex");
for (const name of needed) {
  const pkg = lock.packages[name];
  const filename = pkg.file_name;
  if (path.basename(filename) !== filename)
    throw new Error("Unexpected package path in runtime lockfile.");
  const target = path.join(destination, filename);
  try {
    if (sha(await readFile(target)) === pkg.sha256) continue;
  } catch {}
  console.log(`Bundling browser math: ${name} ${pkg.version}`);
  const response = await fetch(
    `https://cdn.jsdelivr.net/pyodide/v${packageInfo.version}/full/${filename}`,
    { signal: AbortSignal.timeout(180000) },
  );
  if (!response.ok)
    throw new Error(`Could not download ${name}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (sha(bytes) !== pkg.sha256)
    throw new Error(`Integrity check failed for ${name}`);
  await writeFile(target, bytes);
}
await writeFile(
  path.join(destination, "equationpath-runtime.json"),
  JSON.stringify({ version: packageInfo.version, packages: [...needed] }),
);
console.log(
  "Browser math assets ready. Python and a backend server are not required.",
);
