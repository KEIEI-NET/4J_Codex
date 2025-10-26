#!/usr/bin/env node
import { createWriteStream } from "node:fs";
import { once } from "node:events";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import minimist from "minimist";
import { scanRepository } from "./scanner.js";
import { listChangedFiles, listUntrackedFiles } from "./git.js";

interface CliOptions {
  command: string;
  root: string;
  out?: string;
  includeHash: boolean;
  changedFrom?: string;
  ignorePatterns: string[];
}

function parseArgs(argv: string[]): CliOptions {
  const parsed = minimist(argv, {
    boolean: ["include-hash", "help"],
    string: ["root", "out", "changed-from", "ignore"],
    alias: {
      h: "help",
    },
    default: {
      root: process.cwd(),
    },
  });

  if (parsed.help) {
    printHelp();
    process.exit(0);
  }

  const [command = "scan"] = parsed._;

  const ignorePatterns: string[] = [];
  if (parsed.ignore) {
    if (Array.isArray(parsed.ignore)) {
      ignorePatterns.push(...parsed.ignore.map(String));
    } else {
      ignorePatterns.push(String(parsed.ignore));
    }
  }

  return {
    command,
    root: path.resolve(String(parsed.root)),
    out: parsed.out ? path.resolve(String(parsed.out)) : undefined,
    includeHash: Boolean(parsed["include-hash"]),
    changedFrom: parsed["changed-from"]
      ? String(parsed["changed-from"])
      : undefined,
    ignorePatterns,
  };
}

function printHelp(): void {
  const help = `Usage: scanner [command] [options]

Commands:
  scan                       Scan repository and emit File records (default)

Options:
  --root <path>              Repository root (default: cwd)
  --out <file>               Output file (JSONL). Default: stdout
  --include-hash             Compute SHA256 hash for files
  --changed-from <ref>       Limit output to files changed since Git ref
  --ignore <pattern>         Additional ignore pattern (repeatable)
  --help                     Show this help
`;
  process.stdout.write(help);
}

async function collectChangedFiles(
  root: string,
  ref?: string,
): Promise<Set<string> | null> {
  if (!ref) {
    return null;
  }
  const changed = await listChangedFiles(root, ref);
  const untracked = await listUntrackedFiles(root);
  if (!changed && !untracked) {
    return null;
  }
  const result = new Set<string>();
  if (changed) {
    for (const file of changed) {
      result.add(file);
    }
  }
  if (untracked) {
    for (const file of untracked) {
      result.add(file);
    }
  }
  return result;
}

async function run(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.command !== "scan") {
    throw new Error(`Unknown command: ${options.command}`);
  }

  const changedFiles = await collectChangedFiles(
    options.root,
    options.changedFrom,
  );
  const start = Date.now();

  let writer: NodeJS.WritableStream | null = null;
  if (options.out) {
    await mkdir(path.dirname(options.out), { recursive: true });
    writer = createWriteStream(options.out, { encoding: "utf8" });
  } else {
    writer = process.stdout;
  }

  let count = 0;
  let totalBytes = 0;

  try {
    for await (const record of scanRepository({
      root: options.root,
      includeHash: options.includeHash,
      changedFiles,
      ignorePatterns: options.ignorePatterns,
    })) {
      count += 1;
      totalBytes += record.size;
      const line = JSON.stringify({
        type: "File",
        path: record.path,
        size: record.size,
        mtimeMs: record.mtimeMs,
        hash: record.hash,
      });
      if (!writer.write(`${line}\n`)) {
        await once(writer, "drain");
      }
    }
  } finally {
    if (writer !== process.stdout) {
      await new Promise<void>((resolve, reject) => {
        (writer as unknown as NodeJS.WritableStream).end(() => resolve());
        (writer as unknown as NodeJS.WritableStream).on("error", reject);
      });
    }
  }

  const durationMs = Date.now() - start;
  const summary = {
    event: "scanner.summary",
    root: options.root,
    files: count,
    totalBytes,
    includeHash: options.includeHash,
    changedFilter: options.changedFrom ?? null,
    durationMs,
  };
  process.stderr.write(`${JSON.stringify(summary)}\n`);
}

run().catch((err) => {
  process.stderr.write(
    `${JSON.stringify({ event: "scanner.error", message: err.message })}\n`,
  );
  process.exitCode = 1;
});
