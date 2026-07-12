import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const desktopDir = path.resolve(__dirname, "..");
const buildDir = path.join(desktopDir, "build");
const sourcePath = path.join(buildDir, "lit-panel-icon.svg");
const basePngPath = path.join(buildDir, "lit-panel-icon.png");
const iconsetPath = path.join(buildDir, "lit-panel.iconset");
const outputPath = path.join(buildDir, "lit-panel.icns");

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} failed with exit code ${code ?? "unknown"}`));
    });
  });
}

async function main() {
  await fs.rm(iconsetPath, { recursive: true, force: true });
  await fs.mkdir(iconsetPath, { recursive: true });
  await run("sips", ["-s", "format", "png", sourcePath, "--out", basePngPath]);

  for (const size of [16, 32, 128, 256, 512]) {
    await run("sips", [
      "-z",
      String(size),
      String(size),
      basePngPath,
      "--out",
      path.join(iconsetPath, `icon_${size}x${size}.png`),
    ]);
    await run("sips", [
      "-z",
      String(size * 2),
      String(size * 2),
      basePngPath,
      "--out",
      path.join(iconsetPath, `icon_${size}x${size}@2x.png`),
    ]);
  }

  await fs.rm(outputPath, { force: true });
  await run("iconutil", ["-c", "icns", iconsetPath, "-o", outputPath]);
  await fs.rm(iconsetPath, { recursive: true, force: true });
  await fs.rm(basePngPath, { force: true });
  process.stdout.write(`${outputPath}\n`);
}

await main();
