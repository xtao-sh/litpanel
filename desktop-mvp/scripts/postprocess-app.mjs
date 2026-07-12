import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DESKTOP_DIR = path.resolve(__dirname, "..");
const PACKAGE_JSON_PATH = path.join(DESKTOP_DIR, "package.json");

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function runCommand(command, args) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: DESKTOP_DIR,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code ?? "unknown"}`));
    });
  });
}

async function main() {
  const pkg = JSON.parse(await fs.readFile(PACKAGE_JSON_PATH, "utf8"));
  const productName = pkg.build?.productName ?? pkg.productName ?? pkg.name;
  const appPath = path.join(DESKTOP_DIR, "dist", "mac-arm64", `${productName}.app`);
  const stagedBundlePath = path.join(DESKTOP_DIR, ".bundle", "app-bundle");
  const resourceBundlePath = path.join(appPath, "Contents", "Resources", "app-bundle");

  if (!(await pathExists(appPath))) {
    throw new Error(`Packaged app not found: ${appPath}`);
  }

  if (!(await pathExists(stagedBundlePath))) {
    throw new Error(`Staged app bundle not found: ${stagedBundlePath}`);
  }

  console.log("Replacing packaged app bundle with staged resources...");
  await fs.rm(resourceBundlePath, { recursive: true, force: true });
  await fs.cp(stagedBundlePath, resourceBundlePath, {
    recursive: true,
    force: true,
    verbatimSymlinks: true,
  });

  console.log("Re-signing patched app...");
  await runCommand("codesign", ["--force", "--deep", "--sign", "-", appPath]);

  console.log("Patched app ready at:", appPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
