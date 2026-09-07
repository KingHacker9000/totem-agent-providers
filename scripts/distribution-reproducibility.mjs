import { spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";
import process from "node:process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }
  return result.stdout;
}

async function cleanBuildInventory() {
  await rm("dist", { recursive: true, force: true });
  run(npm, ["run", "build"]);
  return run(process.execPath, ["scripts/distribution-integrity.mjs"]);
}

const first = await cleanBuildInventory();
const second = await cleanBuildInventory();
if (first !== second) {
  console.error("distribution-reproducibility: repeated clean builds produced different inventories");
  process.exit(1);
}

process.stdout.write(second);
