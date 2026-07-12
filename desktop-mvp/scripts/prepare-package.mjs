import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import {
  BACKEND_DIR,
  FRONTEND_DIR,
  DESKTOP_DIR,
  ROOT_DIR,
  rebuildFrontend,
} from "../src/service-manager.mjs";

const BUNDLE_ROOT = path.join(DESKTOP_DIR, ".bundle", "app-bundle");
const BUNDLE_BACKEND_DIR = path.join(BUNDLE_ROOT, "backend");
const BUNDLE_FRONTEND_DIR = path.join(BUNDLE_ROOT, "frontend");
const BUNDLE_AGENTS_DIR = path.join(BUNDLE_ROOT, "agents");
const BUNDLE_SEED_DATA_DIR = path.join(BUNDLE_ROOT, "seed-data");
const BUNDLE_PYTHON_DIR = path.join(BUNDLE_ROOT, "backend-runtime", "python");
const BUNDLE_PYTHON_BIN = path.join(BUNDLE_PYTHON_DIR, "bin", "python3");
const BUNDLE_FRONTEND_SERVER = path.join(BUNDLE_FRONTEND_DIR, "server.js");
const FRONTEND_STANDALONE_DIR = path.join(FRONTEND_DIR, ".next", "standalone");
const FRONTEND_STATIC_DIR = path.join(FRONTEND_DIR, ".next", "static");
const FRONTEND_PUBLIC_DIR = path.join(FRONTEND_DIR, "public");
const ROOT_RUNTIME_MODULES = ["llm_runtime.py"];

const PYTHON_ARCHIVE_NAME =
  "cpython-3.11.15+20260623-aarch64-apple-darwin-install_only_stripped.tar.gz";
const PYTHON_ARCHIVE_URL =
  `https://github.com/astral-sh/python-build-standalone/releases/download/20260623/${encodeURIComponent(PYTHON_ARCHIVE_NAME)}`;
const PYTHON_ARCHIVE_SHA256 = "2318799eaf104f8a29bc09a93b0851b05dbbcb4ce9a5f045ddea169c0c7ff3a5";
const PYTHON_ARCHIVE_PATH = path.join(DESKTOP_DIR, ".staging", PYTHON_ARCHIVE_NAME);

const BACKEND_EXCLUDES = new Set([
  ".DS_Store",
  ".env",
  ".next",
  ".venv",
  "__pycache__",
  "kb.db",
  "kb.db-shm",
  "kb.db-wal",
  "tests",
]);

const SOURCE_EXCLUDES = new Set([".DS_Store", "__pycache__"]);

function normalizeRelative(from, target) {
  return path.relative(from, target).split(path.sep).join("/");
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function copyTree(source, destination, excludes = new Set()) {
  await fs.cp(source, destination, {
    recursive: true,
    force: true,
    filter: (src) => {
      const relative = normalizeRelative(source, src);
      if (!relative || relative === ".") return true;
      const segments = relative.split("/");
      return !Array.from(excludes).some((entry) =>
        entry.includes("/")
          ? relative === entry || relative.startsWith(`${entry}/`)
          : segments.includes(entry)
      );
    },
  });
}

async function removeBytecodeArtifacts(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__pycache__") {
        await fs.rm(entryPath, { recursive: true, force: true });
      } else {
        await removeBytecodeArtifacts(entryPath);
      }
    } else if (entry.name.endsWith(".pyc") || entry.name.endsWith(".pyo")) {
      await fs.rm(entryPath, { force: true });
    }
  }
}

async function prunePythonRuntime() {
  await removeBytecodeArtifacts(BUNDLE_PYTHON_DIR);
  const binDir = path.join(BUNDLE_PYTHON_DIR, "bin");
  const requiredExecutables = new Set([
    "python",
    "python3",
    "python3-config",
    "python3.11",
    "python3.11-config",
  ]);
  for (const entry of await fs.readdir(binDir)) {
    if (!requiredExecutables.has(entry)) {
      await fs.rm(path.join(binDir, entry), { recursive: true, force: true });
    }
  }
}

async function runCommand(command, args, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT_DIR,
      stdio: "inherit",
      shell: false,
      ...options,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code ?? "unknown"}`));
    });
  });
}

async function sha256(filePath) {
  const content = await fs.readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

async function ensurePythonArchive() {
  await fs.mkdir(path.dirname(PYTHON_ARCHIVE_PATH), { recursive: true });
  if ((await pathExists(PYTHON_ARCHIVE_PATH)) && (await sha256(PYTHON_ARCHIVE_PATH)) === PYTHON_ARCHIVE_SHA256) {
    return;
  }

  console.log("Downloading portable Python runtime...");
  const response = await fetch(PYTHON_ARCHIVE_URL);
  if (!response.ok) {
    throw new Error(`Portable Python download failed with HTTP ${response.status}`);
  }
  await fs.writeFile(PYTHON_ARCHIVE_PATH, Buffer.from(await response.arrayBuffer()));
  const digest = await sha256(PYTHON_ARCHIVE_PATH);
  if (digest !== PYTHON_ARCHIVE_SHA256) {
    await fs.rm(PYTHON_ARCHIVE_PATH, { force: true });
    throw new Error(`Portable Python checksum mismatch: ${digest}`);
  }
}

async function preparePythonRuntime() {
  await ensurePythonArchive();
  const runtimeRoot = path.dirname(BUNDLE_PYTHON_DIR);
  await fs.mkdir(runtimeRoot, { recursive: true });
  await runCommand("tar", ["-xzf", PYTHON_ARCHIVE_PATH, "-C", runtimeRoot]);
  if (!(await pathExists(BUNDLE_PYTHON_BIN))) {
    throw new Error(`Portable Python is missing: ${BUNDLE_PYTHON_BIN}`);
  }
  console.log("Installing backend dependencies into portable Python...");
  await runCommand(
    BUNDLE_PYTHON_BIN,
    ["-m", "pip", "install", "--disable-pip-version-check", "--no-cache-dir", "-r", path.join(BUNDLE_BACKEND_DIR, "requirements.txt")],
    { env: { ...process.env, PIP_NO_INPUT: "1" } }
  );
}

async function createPublicDemoSeed() {
  console.log("Creating clean public demo seed...");
  const seedEnv = {
    ...process.env,
    KB_DISABLE_LEGACY_AI_IMPORT: "1",
    LLM_API_KEY: "",
    KIMI_API_KEY: "",
    KB_LLM_API_KEY: "",
    NBER_API_KEY: "",
  };
  await runCommand(
    BUNDLE_PYTHON_BIN,
    [
      path.join(ROOT_DIR, "scripts", "create_demo_db.py"),
      "--db",
      path.join(BUNDLE_BACKEND_DIR, "kb.db"),
      "--data-root",
      BUNDLE_SEED_DATA_DIR,
      "--force",
      "--replace-files",
      "--portable-paths",
    ],
    { env: seedEnv }
  );
}

async function copyStandaloneFrontend() {
  if (!(await pathExists(FRONTEND_STANDALONE_DIR))) {
    throw new Error(`Next.js standalone output is missing: ${FRONTEND_STANDALONE_DIR}`);
  }
  await copyTree(FRONTEND_STANDALONE_DIR, BUNDLE_FRONTEND_DIR);
  await copyTree(FRONTEND_STATIC_DIR, path.join(BUNDLE_FRONTEND_DIR, ".next", "static"));
  if (await pathExists(FRONTEND_PUBLIC_DIR)) {
    await copyTree(FRONTEND_PUBLIC_DIR, path.join(BUNDLE_FRONTEND_DIR, "public"));
  }

  // Next embeds the build machine's project root in two standalone metadata
  // files. Those fields are not needed as absolute paths at runtime and make
  // an otherwise portable public bundle disclose the developer directory.
  for (const relativePath of ["server.js", path.join(".next", "required-server-files.json")]) {
    const targetPath = path.join(BUNDLE_FRONTEND_DIR, relativePath);
    const content = await fs.readFile(targetPath, "utf8");
    await fs.writeFile(targetPath, content.replaceAll(FRONTEND_DIR, "."), "utf8");
  }
}

async function main() {
  if (process.platform !== "darwin" || process.arch !== "arm64") {
    throw new Error("The current desktop package target is macOS arm64.");
  }

  console.log("Preparing desktop package bundle...");
  await rebuildFrontend();
  await fs.rm(path.join(DESKTOP_DIR, ".bundle"), { recursive: true, force: true });
  await fs.mkdir(BUNDLE_ROOT, { recursive: true });

  console.log("Copying backend and agent sources...");
  await copyTree(BACKEND_DIR, BUNDLE_BACKEND_DIR, BACKEND_EXCLUDES);
  await copyTree(path.join(ROOT_DIR, "agents"), BUNDLE_AGENTS_DIR, SOURCE_EXCLUDES);
  for (const moduleName of ROOT_RUNTIME_MODULES) {
    await fs.copyFile(path.join(ROOT_DIR, moduleName), path.join(BUNDLE_ROOT, moduleName));
  }

  await preparePythonRuntime();
  await createPublicDemoSeed();
  console.log("Pruning build-only Python artifacts...");
  await prunePythonRuntime();

  console.log("Copying standalone frontend...");
  await copyStandaloneFrontend();
  if (!(await pathExists(BUNDLE_FRONTEND_SERVER))) {
    throw new Error(`Bundled frontend server is missing: ${BUNDLE_FRONTEND_SERVER}`);
  }

  console.log("Desktop package bundle ready:", BUNDLE_ROOT);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
