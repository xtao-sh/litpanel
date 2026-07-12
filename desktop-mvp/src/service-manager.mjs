import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DESKTOP_DIR = path.resolve(__dirname, "..");
export const ROOT_DIR = path.resolve(DESKTOP_DIR, "..");
export const BUNDLE_ROOT = process.env.NBER_DESKTOP_BUNDLE_ROOT ?? ROOT_DIR;
export const BACKEND_DIR = path.join(BUNDLE_ROOT, "backend");
export const FRONTEND_DIR = path.join(BUNDLE_ROOT, "frontend");
export const RUNTIME_DIR = process.env.NBER_DESKTOP_RUNTIME_DIR ?? path.join(DESKTOP_DIR, ".runtime");
export const LOG_DIR = path.join(RUNTIME_DIR, "logs");
export const NPM_CACHE_DIR = path.join(RUNTIME_DIR, "npm-cache");
export const BACKEND_VENV_DIR = path.join(RUNTIME_DIR, "backend-venv");
export const BUNDLED_PYTHON_DIR = path.join(BUNDLE_ROOT, "backend-runtime", "python");
export const USER_DATA_DIR = process.env.NBER_DESKTOP_USER_DATA_DIR ?? path.join(RUNTIME_DIR, "user-data");
export const USER_DATA_ROOT = path.join(USER_DATA_DIR, "Data");
export const USER_DB_PATH = path.join(USER_DATA_DIR, "kb.db");
export const SEED_DATA_DIR = path.join(BUNDLE_ROOT, "seed-data");
export const BACKEND_LOG = path.join(LOG_DIR, "backend.log");
export const FRONTEND_LOG = path.join(LOG_DIR, "frontend.log");
export const SYSTEM_PYTHON_COMMAND = process.env.NBER_DESKTOP_SYSTEM_PYTHON ?? "python3";
export const SYSTEM_NODE_COMMAND = process.env.NBER_DESKTOP_SYSTEM_NODE ?? "node";
export const BACKEND_HOST = process.env.NBER_DESKTOP_BACKEND_HOST ?? "127.0.0.1";
export const BACKEND_PORT = Number(process.env.NBER_DESKTOP_BACKEND_PORT ?? "38000");
export const FRONTEND_HOST = process.env.NBER_DESKTOP_FRONTEND_HOST ?? "127.0.0.1";
export const FRONTEND_PORT = Number(process.env.NBER_DESKTOP_FRONTEND_PORT ?? "38001");
export const BACKEND_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}`;
export const FRONTEND_URL = `http://${FRONTEND_HOST}:${FRONTEND_PORT}`;
export const IS_BUNDLED_RUNTIME = BUNDLE_ROOT !== ROOT_DIR;
const PYTHON_COMMAND_CANDIDATES = [
  process.env.NBER_DESKTOP_SYSTEM_PYTHON,
  "/opt/homebrew/opt/python@3.12/bin/python3.12",
  "/opt/homebrew/opt/python@3.11/bin/python3.11",
  "/opt/homebrew/bin/python3",
  "/usr/local/opt/python@3.12/bin/python3.12",
  "/usr/local/opt/python@3.11/bin/python3.11",
  "/usr/local/bin/python3",
  "/usr/bin/python3",
  "python3",
].filter(Boolean);

const NEXT_PUBLIC_ENV = {
  NEXT_PUBLIC_API_URL: BACKEND_URL,
  NEXT_PUBLIC_GRAPHQL_URL: `${BACKEND_URL}/graphql`,
  NEXT_PUBLIC_APP_NAME: "Lit Panel",
  NEXT_PUBLIC_APP_SHORT_NAME: "Lit Panel",
  NEXT_PUBLIC_APP_DESCRIPTION:
    "Explore papers, methods, datasets, and research ideas in your local literature workspace.",
  NEXT_PUBLIC_CORPUS_LABEL: "local corpus",
  NEXT_PUBLIC_SOURCE_NAME: "Source Library",
  NEXT_PUBLIC_SOURCE_PAPER_LABEL: "papers",
  NEXT_PUBLIC_EXTERNAL_PAPER_LABEL: "View at source",
  NEXT_PUBLIC_REMOTE_DISCOVERY_LABEL: "NBER",
  NEXT_PUBLIC_SUPPORTS_REMOTE_DISCOVERY: "true",
};

function withNpmCache(env = process.env) {
  return {
    ...env,
    npm_config_cache: NPM_CACHE_DIR,
  };
}

function appendLogLine(logPath, message) {
  fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`);
}

const state = {
  backendProcess: null,
  frontendProcess: null,
  managedBackend: false,
  managedFrontend: false,
};

function getVenvPythonPath() {
  return path.join(BACKEND_VENV_DIR, "bin", "python");
}

function getBundledVenvPythonPath() {
  return path.join(BUNDLED_PYTHON_DIR, "bin", "python3");
}

function getNextBinPath() {
  return path.join(FRONTEND_DIR, "node_modules", "next", "dist", "bin", "next");
}

function getFrontendBuildIdPath() {
  return path.join(FRONTEND_DIR, ".next", "BUILD_ID");
}

function getStandaloneServerPath() {
  return path.join(FRONTEND_DIR, "server.js");
}

async function resolveNodeCommand() {
  return process.execPath;
}

async function resolvePythonCommand() {
  for (const candidate of PYTHON_COMMAND_CANDIDATES) {
    if (candidate.includes(path.sep) && !(await pathExists(candidate))) {
      continue;
    }

    const isCompatible = await commandSucceeds(candidate, [
      "-c",
      "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)",
    ]);
    if (isCompatible) {
      return candidate;
    }
  }

  throw new Error(
    `Unable to find Python 3.10+ for the backend runtime. Checked: ${PYTHON_COMMAND_CANDIDATES.join(", ")}`
  );
}

async function ensureRuntimeDirs() {
  await Promise.all([
    fsp.mkdir(RUNTIME_DIR, { recursive: true }),
    fsp.mkdir(LOG_DIR, { recursive: true }),
    fsp.mkdir(NPM_CACHE_DIR, { recursive: true }),
  ]);
}

async function prepareBundledUserData() {
  if (!IS_BUNDLED_RUNTIME) return;

  await fsp.mkdir(USER_DATA_DIR, { recursive: true });
  const seedDbPath = path.join(BACKEND_DIR, "kb.db");
  if (!(await pathExists(USER_DB_PATH))) {
    if (!(await pathExists(seedDbPath))) {
      throw new Error(`Bundled demo database is missing: ${seedDbPath}`);
    }
    await fsp.copyFile(seedDbPath, USER_DB_PATH);
  }
  if (await pathExists(SEED_DATA_DIR)) {
    await fsp.cp(SEED_DATA_DIR, USER_DATA_ROOT, {
      recursive: true,
      force: false,
      errorOnExist: false,
    });
  }
}

function backendEnvironment() {
  if (!IS_BUNDLED_RUNTIME) return process.env;
  const papersDir = path.join(USER_DATA_ROOT, "papers", "source-library");
  const contentDir = path.join(USER_DATA_ROOT, "knowledge_base", "source-library");
  const agentDbPath = path.join(USER_DATA_ROOT, "source-library_agent.db");
  const agentsDir = path.join(BUNDLE_ROOT, "agents");
  return {
    ...process.env,
    KB_DESKTOP_MODE: "1",
    KB_DB_PATH: USER_DB_PATH,
    KB_DATA_ROOT: USER_DATA_ROOT,
    PAPERS_DIR: papersDir,
    KB_PAPERS_DIR: papersDir,
    KNOWLEDGE_BASE_DIR: contentDir,
    KB_CONTENT_ROOT: contentDir,
    AGENT_DB_PATH: agentDbPath,
    KB_AGENT_DB_PATH: agentDbPath,
    EXISTING_AGENT_DB_PATHS: agentDbPath,
    KB_EXISTING_AGENT_DB_PATHS: agentDbPath,
    AGENTS_DIR: agentsDir,
    KB_AGENTS_DIR: agentsDir,
    APP_NAME: "Lit Panel",
    APP_SHORT_NAME: "Lit Panel",
    SOURCE_NAME: "Source Library",
    SUPPORTS_REMOTE_DISCOVERY: "true",
    REMOTE_SOURCE_KIND: "nber",
    KB_DISABLE_LEGACY_AI_IMPORT: "1",
    PYTHONDONTWRITEBYTECODE: "1",
    PYTHONNOUSERSITE: "1",
    PYTHONUTF8: "1",
  };
}

function nodeEnvironment(extra = {}) {
  return {
    ...process.env,
    ...(process.versions?.electron ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
    ...extra,
  };
}

async function pathExists(targetPath) {
  try {
    await fsp.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function hashFileContent(content) {
  return createHash("sha1").update(content).digest("hex");
}

async function hashFile(filePath) {
  const content = await fsp.readFile(filePath);
  return hashFileContent(content);
}

function createLogStream(logPath, label) {
  const stream = fs.createWriteStream(logPath, { flags: "a" });
  stream.write(`\n[${new Date().toISOString()}] Starting ${label}\n`);
  return stream;
}

async function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: false,
      ...options,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code ?? "unknown"}`));
      }
    });
  });
}

async function commandSucceeds(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: "ignore",
      shell: false,
      ...options,
    });

    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
  });
}

async function waitForUrl(url, { timeoutMs = 120000, intervalMs = 1000, validate } = {}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      const valid = validate ? await validate(response) : response.ok;
      if (valid) {
        return;
      }
    } catch {
      // ignore until timeout
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForUrlOrProcessExit(
  url,
  child,
  { label, timeoutMs = 120000, intervalMs = 1000, validate } = {}
) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    let finished = false;

    function cleanup() {
      child.off("exit", onExit);
      child.off("error", onError);
    }

    function finish(callback) {
      if (finished) {
        return;
      }
      finished = true;
      cleanup();
      callback();
    }

    function onExit(code, signal) {
      finish(() => {
        reject(new Error(`${label} exited before becoming ready (code=${code ?? "null"}, signal=${signal ?? "null"})`));
      });
    }

    function onError(error) {
      finish(() => {
        reject(error);
      });
    }

    async function poll() {
      if (finished) {
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        finish(() => {
          reject(new Error(`Timed out waiting for ${url}`));
        });
        return;
      }

      try {
        const response = await fetch(url);
        const valid = validate ? await validate(response) : response.ok;
        if (valid) {
          finish(resolve);
          return;
        }
      } catch {
        // ignore until timeout or process exit
      }

      setTimeout(() => {
        void poll();
      }, intervalMs);
    }

    child.once("exit", onExit);
    child.once("error", onError);
    void poll();
  });
}

async function ensureBackendVenv() {
  if (IS_BUNDLED_RUNTIME) {
    const bundledPythonPath = getBundledVenvPythonPath();
    if (
      (await pathExists(bundledPythonPath)) &&
      (await commandSucceeds(bundledPythonPath, [
        "-c",
        "import fastapi, aiosqlite, anthropic, numpy, requests; import strawberry",
      ], { env: backendEnvironment() }))
    ) {
      return bundledPythonPath;
    }
    throw new Error(`Bundled portable Python is unavailable: ${bundledPythonPath}`);
  }

  const systemPythonCommand = await resolvePythonCommand();
  const systemPythonReady = await commandSucceeds(
    systemPythonCommand,
    [
      "-c",
      "import fastapi, aiosqlite, anthropic, numpy, requests; import strawberry; import sentence_transformers",
    ],
    { cwd: ROOT_DIR }
  );
  if (systemPythonReady) {
    return systemPythonCommand;
  }

  const bundledPythonPath = getBundledVenvPythonPath();
  if (
    (await pathExists(bundledPythonPath)) &&
    (await commandSucceeds(bundledPythonPath, [
      "-c",
      "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)",
    ]))
  ) {
    return bundledPythonPath;
  }

  const runtimePythonPath = getVenvPythonPath();
  if (
    (await pathExists(runtimePythonPath)) &&
    (await commandSucceeds(runtimePythonPath, [
      "-c",
      "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)",
    ]))
  ) {
    return runtimePythonPath;
  }

  await fsp.rm(BACKEND_VENV_DIR, { recursive: true, force: true });
  await runCommand(systemPythonCommand, ["-m", "venv", BACKEND_VENV_DIR], {
    cwd: ROOT_DIR,
  });
  return runtimePythonPath;
}

async function ensureBackendDependencies() {
  const pythonPath = await ensureBackendVenv();
  if (pythonPath !== getVenvPythonPath()) {
    return pythonPath;
  }
  const requirementsPath = path.join(BACKEND_DIR, "requirements.txt");
  const stampPath = path.join(BACKEND_VENV_DIR, ".requirements.sha1");
  const currentHash = await hashFile(requirementsPath);
  const previousHash = (await pathExists(stampPath))
    ? (await fsp.readFile(stampPath, "utf8")).trim()
    : "";

  if (currentHash === previousHash) {
    return pythonPath;
  }

  await runCommand(pythonPath, ["-m", "pip", "install", "--upgrade", "pip"], {
    cwd: ROOT_DIR,
  });
  await runCommand(pythonPath, ["-m", "pip", "install", "-r", requirementsPath], {
    cwd: ROOT_DIR,
  });
  await fsp.writeFile(stampPath, `${currentHash}\n`, "utf8");
  return pythonPath;
}

async function ensureFrontendDependencies() {
  if (IS_BUNDLED_RUNTIME) {
    const serverPath = getStandaloneServerPath();
    if (await pathExists(serverPath)) return serverPath;
    throw new Error(`Bundled standalone frontend is missing: ${serverPath}`);
  }
  const nextBinPath = getNextBinPath();
  if (await pathExists(nextBinPath)) {
    return nextBinPath;
  }

  await runCommand("npm", ["install"], {
    cwd: FRONTEND_DIR,
    env: withNpmCache(),
  });
  return nextBinPath;
}

async function ensureFrontendBuild({ forceBuild = false } = {}) {
  const frontendEntryPath = await ensureFrontendDependencies();
  const buildIdPath = getFrontendBuildIdPath();

  if (!forceBuild && (await pathExists(buildIdPath))) {
    return frontendEntryPath;
  }

  if (IS_BUNDLED_RUNTIME) {
    throw new Error(`Bundled frontend is missing production build output: ${buildIdPath}`);
  }

  await runCommand(await resolveNodeCommand(), [frontendEntryPath, "build"], {
    cwd: FRONTEND_DIR,
    env: nodeEnvironment({
      ...NEXT_PUBLIC_ENV,
    }),
  });

  return frontendEntryPath;
}

async function isBackendReady() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/health`);
    if (!response.ok) {
      return false;
    }
    const payload = await response.json();
    return payload?.status === "ok";
  } catch {
    return false;
  }
}

async function isFrontendReady() {
  try {
    const response = await fetch(FRONTEND_URL);
    return response.ok;
  } catch {
    return false;
  }
}

function spawnManagedProcess(command, args, { cwd, env, logPath, label }) {
  const logStream = createLogStream(logPath, label);
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });

  child.stdout.pipe(logStream, { end: false });
  child.stderr.pipe(logStream, { end: false });

  child.on("error", (error) => {
    logStream.write(`\n[${new Date().toISOString()}] ${label} error: ${error.message}\n`);
  });

  child.on("exit", (code, signal) => {
    logStream.write(`\n[${new Date().toISOString()}] ${label} exited (code=${code ?? "null"}, signal=${signal ?? "null"})\n`);
    logStream.end();
  });

  return child;
}

async function startBackend() {
  if (await isBackendReady()) {
    state.managedBackend = false;
    return;
  }

  const pythonPath = await ensureBackendDependencies();
  state.backendProcess = spawnManagedProcess(
    pythonPath,
    ["-m", "uvicorn", "app:app", "--host", BACKEND_HOST, "--port", String(BACKEND_PORT)],
    {
      cwd: BACKEND_DIR,
      env: backendEnvironment(),
      logPath: BACKEND_LOG,
      label: "backend",
    }
  );
  state.managedBackend = true;

  await waitForUrlOrProcessExit(`${BACKEND_URL}/api/health`, state.backendProcess, {
    label: "backend",
    timeoutMs: 90000,
    validate: async (response) => {
      if (!response.ok) {
        return false;
      }
      const payload = await response.json();
      return payload?.status === "ok";
    },
  });
}

async function startFrontend() {
  if (await isFrontendReady()) {
    state.managedFrontend = false;
    return;
  }

  appendLogLine(
    FRONTEND_LOG,
    `Preparing frontend (bundled=${IS_BUNDLED_RUNTIME}; frontendDir=${FRONTEND_DIR})`
  );
  const frontendEntryPath = await ensureFrontendBuild();
  const nodeCommand = await resolveNodeCommand();
  appendLogLine(FRONTEND_LOG, `Using Node.js runtime at ${nodeCommand}`);
  appendLogLine(FRONTEND_LOG, `Using frontend entry at ${frontendEntryPath}`);
  const frontendArgs = IS_BUNDLED_RUNTIME
    ? [frontendEntryPath]
    : [frontendEntryPath, "start", "--hostname", FRONTEND_HOST, "--port", String(FRONTEND_PORT)];
  state.frontendProcess = spawnManagedProcess(
    nodeCommand,
    frontendArgs,
    {
      cwd: FRONTEND_DIR,
      env: nodeEnvironment({
        ...NEXT_PUBLIC_ENV,
        HOSTNAME: FRONTEND_HOST,
        PORT: String(FRONTEND_PORT),
      }),
      logPath: FRONTEND_LOG,
      label: "frontend",
    }
  );
  state.managedFrontend = true;

  await waitForUrlOrProcessExit(FRONTEND_URL, state.frontendProcess, {
    label: "frontend",
    timeoutMs: 120000,
  });
}

function killChild(child) {
  if (!child || child.exitCode !== null || child.killed) {
    return;
  }

  if (process.platform !== "win32") {
    try {
      process.kill(-child.pid, "SIGTERM");
      return;
    } catch {
      // fall through to direct kill
    }
  }

  try {
    child.kill("SIGTERM");
  } catch {
    // ignore
  }
}

export async function rebuildFrontend() {
  await ensureFrontendBuild({ forceBuild: true });
}

export async function startServices() {
  await ensureRuntimeDirs();
  await prepareBundledUserData();
  await startBackend();
  await startFrontend();
}

export async function stopServices() {
  if (state.managedFrontend && state.frontendProcess) {
    killChild(state.frontendProcess);
    state.frontendProcess = null;
  }
  if (state.managedBackend && state.backendProcess) {
    killChild(state.backendProcess);
    state.backendProcess = null;
  }
  state.managedFrontend = false;
  state.managedBackend = false;
}

export function getLogPaths() {
  return {
    backendLog: BACKEND_LOG,
    frontendLog: FRONTEND_LOG,
  };
}

export function getRuntimeSummary() {
  return {
    rootDir: ROOT_DIR,
    bundleRoot: BUNDLE_ROOT,
    desktopDir: DESKTOP_DIR,
    backendDir: BACKEND_DIR,
    frontendDir: FRONTEND_DIR,
    runtimeDir: RUNTIME_DIR,
    bundledPythonDir: BUNDLED_PYTHON_DIR,
    userDataDir: USER_DATA_DIR,
    backendUrl: BACKEND_URL,
    frontendUrl: FRONTEND_URL,
    platform: os.platform(),
  };
}
