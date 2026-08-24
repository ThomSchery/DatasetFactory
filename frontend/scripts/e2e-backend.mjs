import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(frontendRoot, "..");
const python = path.join(
  repositoryRoot,
  ".venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
const child = spawn(python, ["-m", "backend.tests.e2e_server"], {
  cwd: repositoryRoot,
  env: process.env,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code, signal) => {
  if (signal !== null) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 1);
  }
});
