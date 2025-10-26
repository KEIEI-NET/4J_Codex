#!/usr/bin/env node
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";
import minimist from "minimist";
import { normalizeEntity } from "./normalizer.js";
import { ValidationError } from "./validator.js";

interface CliArgs {
  command: string;
  input?: string;
  output?: string;
  strict: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const parsed = minimist(argv, {
    boolean: ["strict", "help"],
    string: ["in", "out"],
    alias: {
      i: "in",
      o: "out",
      h: "help",
    },
  });

  if (parsed.help) {
    printHelp();
    process.exit(0);
  }

  const [command = "normalize"] = parsed._;
  return {
    command,
    input: parsed.in,
    output: parsed.out,
    strict: Boolean(parsed.strict),
  };
}

function printHelp(): void {
  process.stdout.write(`Usage: ir-normalizer <command> [options]\n\n`);
  process.stdout.write(`Commands:\n`);
  process.stdout.write(
    `  normalize    Normalize raw facts JSONL into IR JSONL (default)\n\n`,
  );
  process.stdout.write(`Options:\n`);
  process.stdout.write(`  --in <file>   Input JSONL file\n`);
  process.stdout.write(`  --out <file>  Output JSONL file (default: stdout)\n`);
  process.stdout.write(`  --strict      Enable strict namespace enforcement\n`);
  process.stdout.write(`  --help        Show this help\n`);
}

async function normalizeFile(args: CliArgs): Promise<number> {
  const inputPath = args.input ?? "";
  if (!inputPath) {
    throw new Error("Input file (--in) is required");
  }

  const outStream = args.output
    ? createWriteStream(await prepareOutput(args.output), { encoding: "utf8" })
    : process.stdout;

  const rl = readline.createInterface({
    input: createReadStream(inputPath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  let count = 0;
  try {
    for await (const line of rl) {
      if (!line.trim()) {
        continue;
      }
      const raw = JSON.parse(line);
      const normalized = normalizeEntity(raw, { strict: args.strict });
      outStream.write(`${JSON.stringify(normalized)}\n`);
      count += 1;
    }
  } finally {
    if (outStream !== process.stdout) {
      await new Promise<void>((resolve, reject) => {
        outStream.end(() => resolve());
        outStream.on("error", reject);
      });
    }
  }

  process.stderr.write(
    `${JSON.stringify({ event: "ir_normalizer.summary", input: inputPath, output: args.output ?? "stdout", entities: count })}\n`,
  );

  return 0;
}

async function prepareOutput(outPath: string): Promise<string> {
  const resolved = path.resolve(outPath);
  await mkdir(path.dirname(resolved), { recursive: true });
  return resolved;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.command !== "normalize") {
    throw new Error(`Unknown command: ${args.command}`);
  }
  try {
    await normalizeFile(args);
  } catch (err) {
    if (err instanceof ValidationError) {
      process.stderr.write(
        `${JSON.stringify({ event: "ir_normalizer.validation_error", message: err.message, errors: err.errors })}\n`,
      );
      process.exitCode = 1;
      return;
    }
    if (err instanceof Error) {
      process.stderr.write(
        `${JSON.stringify({ event: "ir_normalizer.error", message: err.message })}\n`,
      );
    }
    process.exitCode = 1;
  }
}

main();
