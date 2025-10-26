#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { evaluateFacts } from "./engine.js";
import { FactRecord } from "./types.js";
import { cassandraRules } from "./rules/cassandra.js";

interface CliOptions {
  command: string | null;
  factsPath: string | null;
  outputPath: string | null;
}

function parseArgs(argv: string[]): CliOptions {
  const [, , ...rest] = argv;
  if (rest.length === 0) {
    return { command: null, factsPath: null, outputPath: null };
  }

  const [command, ...params] = rest;
  let factsPath: string | null = null;
  let outputPath: string | null = null;

  for (let index = 0; index < params.length; index += 1) {
    const token = params[index];
    if (token === "--facts" || token === "-f") {
      factsPath = params[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (token === "--output" || token === "-o") {
      outputPath = params[index + 1] ?? null;
      index += 1;
      continue;
    }
  }

  return { command, factsPath, outputPath };
}

function readFactsFromPath(targetPath: string): FactRecord[] {
  const absolute = resolve(process.cwd(), targetPath);
  const stats = statSync(absolute);
  if (stats.isDirectory()) {
    const entries = readdirSync(absolute);
    return entries
      .filter((entry) => entry.endsWith(".jsonl"))
      .flatMap((entry) => readFactsFromFile(resolve(absolute, entry)));
  }
  return readFactsFromFile(absolute);
}

function readFactsFromFile(filePath: string): FactRecord[] {
  const content = readFileSync(filePath, "utf-8");
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, index) => {
      try {
        const data = JSON.parse(line);
        return data as FactRecord;
      } catch (error) {
        throw new Error(`Failed to parse JSON at ${filePath}:${index + 1} - ${(error as Error).message}`);
      }
    });
}

async function writeOutput(path: string | null, hits: unknown) {
  const serialized = JSON.stringify(hits, null, 2);
  if (!path) {
    console.log(serialized);
    return;
  }
  const absolute = resolve(process.cwd(), path);
  await writeFile(absolute, `${serialized}\n`, "utf-8");
}

async function main() {
  try {
    const options = parseArgs(process.argv);
    if (!options.command || options.command === "--help" || options.command === "-h") {
      printHelp();
      process.exitCode = 1;
      return;
    }

    if (options.command !== "cassandra") {
      console.error(`[error] Unsupported command: ${options.command}`);
      printHelp();
      process.exitCode = 1;
      return;
    }

    if (!options.factsPath) {
      console.error("[error] Missing --facts path");
      printHelp();
      process.exitCode = 1;
      return;
    }

    const facts = readFactsFromPath(options.factsPath);
    const hits = evaluateFacts(facts, { rules: cassandraRules });
    await writeOutput(options.outputPath, hits);
  } catch (error) {
    console.error(`[error] ${(error as Error).message}`);
    process.exitCode = 1;
  }
}

function printHelp() {
  console.log(
    [
      "Usage: rules-engine cassandra --facts <path> [--output <file>]",
      "",
      "Options:",
      "  --facts, -f    Path to a JSONL file or directory containing facts",
      "  --output, -o   Optional path to write RuleHit JSON (defaults to stdout)"
    ].join("\n")
  );
}

void main();
