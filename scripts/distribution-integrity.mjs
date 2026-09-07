import { createHash } from "node:crypto";
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const dist = path.join(root, "dist");
const expected = ["index.d.ts", "index.js"];

function fail(message) {
  console.error(`distribution-integrity: ${message}`);
  process.exitCode = 1;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function main() {
  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  if (packageJson.name !== "@totem/agent-providers") fail(`unexpected package name ${packageJson.name}`);
  if (packageJson.exports !== "./dist/index.js") fail(`unexpected exports ${packageJson.exports}`);
  if (packageJson.types !== "./dist/index.d.ts") fail(`unexpected types ${packageJson.types}`);

  const distStat = await lstat(dist).catch(() => null);
  if (!distStat?.isDirectory() || distStat.isSymbolicLink()) fail("dist must be a real directory");
  if (process.exitCode) return;

  const resolvedRoot = await realpath(root);
  const resolvedDist = await realpath(dist);
  if (!resolvedDist.startsWith(`${resolvedRoot}${path.sep}`)) fail("dist escapes repository root");

  const entries = (await readdir(dist, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
  const names = entries.map((entry) => entry.name);
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    fail(`unexpected dist surface: ${names.join(", ")}`);
    return;
  }

  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink()) {
      fail(`unsafe dist entry: ${entry.name}`);
      continue;
    }
    const bytes = await readFile(path.join(dist, entry.name));
    files.push({ path: `dist/${entry.name}`, bytes: bytes.length, sha256: sha256(bytes) });
  }
  if (process.exitCode) return;

  const canonical = files.map((file) => `${file.path}\0${file.bytes}\0${file.sha256}\n`).join("");
  const inventory = {
    schema: "totem.agent-provider-distribution/v1",
    package: packageJson.name,
    version: packageJson.version,
    files,
    aggregate_sha256: sha256(canonical),
  };
  process.stdout.write(`${JSON.stringify(inventory, null, 2)}\n`);
}

await main();
