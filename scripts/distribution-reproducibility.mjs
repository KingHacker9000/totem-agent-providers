import { spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";
import process from "node:process";

const npmCli = process.env.npm_execpath;
if (!npmCli) {
  console.error("distribution-reproducibility: npm_execpath is unavailable");
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) {
    console.error(`distribution-reproducibility: failed to launch ${command}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }
  return result.stdout;
}

async function cleanBuildInventory() {
  await rm("dist", { recursive: true, force: true });
  run(process.execPath, [npmCli, "run", "build"]);
  return run(process.execPath, ["scripts/distribution-integrity.mjs"]);
}

const first = await cleanBuildInventory();
const second = await cleanBuildInventory();
if (first !== second) {
  console.error("distribution-reproducibility: repeated clean builds produced different inventories");
  process.exit(1);
}

process.stdout.write(second);
