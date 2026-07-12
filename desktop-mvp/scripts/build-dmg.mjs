import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DESKTOP_DIR = path.resolve(__dirname, "..");
const PACKAGE_JSON_PATH = path.join(DESKTOP_DIR, "package.json");

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
  const version = pkg.version ?? "0.0.0";
  const appPath = path.join(DESKTOP_DIR, "dist", "mac-arm64", `${productName}.app`);
  const dmgPath = path.join(DESKTOP_DIR, "dist", `${productName}-${version}-arm64.dmg`);

  await fs.rm(dmgPath, { force: true });

  console.log("Creating DMG...");
  await runCommand("hdiutil", [
    "create",
    "-volname",
    productName,
    "-srcfolder",
    appPath,
    "-ov",
    "-format",
    "UDZO",
    dmgPath,
  ]);

  console.log("DMG ready at:", dmgPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
