import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(frontendRoot, "..");
const python = path.join(
  repositoryRoot,
  ".venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
const backendHealthUrl = "http://127.0.0.1:8000/api/v1/health";
const controlPort = 8001;
let backend;
let restarting = false;
let shuttingDown = false;

function startBackend() {
  const child = spawn(python, ["-m", "backend.tests.e2e_server"], {
    cwd: repositoryRoot,
    env: process.env,
    stdio: "inherit",
  });
  child.on("exit", (code) => {
    if (child !== backend || restarting) {
      return;
    }
    if (shuttingDown) {
      process.exit(0);
    }
    process.exit(code ?? 1);
  });
  return child;
}

function terminateBackend(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    child.once("exit", resolve);
    child.once("error", reject);
    if (!child.kill("SIGKILL")) {
      reject(new Error("The E2E backend process could not be killed"));
    }
  });
}

async function waitForBackend() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(backendHealthUrl, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) {
        return;
      }
    } catch {
      // A hard restart is expected to leave a short connection-refused window.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("The restarted E2E backend did not become healthy within 30 seconds");
}

const controlServer = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/restart") {
    response.writeHead(404).end();
    return;
  }
  if (restarting) {
    response.writeHead(409, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "restart_in_progress" }));
    return;
  }

  restarting = true;
  const previousPid = backend.pid;
  try {
    await terminateBackend(backend);
    backend = startBackend();
    await waitForBackend();
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ previous_pid: previousPid, restarted_pid: backend.pid }));
  } catch (error) {
    response.writeHead(500, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({ error: error instanceof Error ? error.message : "restart_failed" }),
    );
  } finally {
    restarting = false;
  }
});

controlServer.listen(controlPort, "127.0.0.1");
backend = startBackend();

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    shuttingDown = true;
    controlServer.close();
    backend.kill(signal);
  });
}
