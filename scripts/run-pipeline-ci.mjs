#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync, mkdirSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");
const sampleIr = resolve(repoRoot, "tests/samples/ir/sample-ir.jsonl");
const tmpDir = resolve(repoRoot, "tmp");
if (!existsSync(tmpDir)) {
  mkdirSync(tmpDir, { recursive: true });
}

async function main() {
  await runCommand(resolve(repoRoot, "packages/graph-loader/bin/graph-loader"), [
    "--in",
    sampleIr,
    "--dry-run",
    "true",
    "--out-csv",
    resolve(tmpDir, "ci-csv")
  ]);

  await runCommand(resolve(repoRoot, "packages/search-indexer/bin/search-indexer"), [
    "--in",
    sampleIr,
    "--dry-run",
    "true"
  ]);

  await runCommand("npm", [
    "run",
    "-w",
    "@codex/rules-engine",
    "report:cassandra",
    "--",
    "--report",
    resolve(tmpDir, "cassandra-report.json")
  ]);

  await runCommand("npx", ["playwright", "install", "--with-deps"], {
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: resolve(tmpDir, "pw-browsers") }
  });

  await runCommand("npm", ["run", "-w", "@codex/ui", "test:e2e"], {
    env: {
      ...process.env,
      PLAYWRIGHT_HEADLESS: "1"
    }
  });
}

function runCommand(command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      cwd: options.cwd ?? repoRoot,
      env: { ...process.env, ...(options.env ?? {}) }
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise(undefined);
      } else {
        rejectPromise(new Error(`${command} exited with code ${code}`));
      }
    });
  });
}

main().catch((error) => {
  console.error("[error] CI pipeline failed", error.message);
  process.exitCode = 1;
});
