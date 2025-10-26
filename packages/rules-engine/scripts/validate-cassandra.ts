#!/usr/bin/env ts-node

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv, { DefinedError } from "ajv";

type RecordKind = "facts" | "rulehits" | "ir";

interface ValidationIssue {
  file: string;
  line: number;
  message: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, "..");
const candidates = [
  resolve(__dirname, "..", "..", ".."),
  resolve(__dirname, "..", "..", "..", "..")
];
const repoRoot = candidates.find((candidate) => existsSync(resolve(candidate, "tests"))) ?? candidates[candidates.length - 1];
const goldsetRoot = resolve(repoRoot, "tests", "goldsets", "cassandra");
const fixturesDir = resolve(goldsetRoot, "fixtures");
const schemasDir = resolve(goldsetRoot, "schemas");

const ajv = new Ajv({ allErrors: true, strict: false });

const schemaValidators: Record<RecordKind, ReturnType<typeof ajv.compile> | null> = {
  facts: loadSchema("facts"),
  rulehits: loadSchema("rulehits"),
  ir: null
};

const issues: ValidationIssue[] = [];

function loadSchema(kind: "facts" | "rulehits") {
  const schemaPath = resolve(schemasDir, `${kind}.schema.json`);
  const schemaContent = readFileSafe(schemaPath);
  if (!schemaContent) {
    console.warn(`[warn] schema not found for ${kind}: ${schemaPath}`);
    return null;
  }
  return ajv.compile(JSON.parse(schemaContent));
}

function readFileSafe(path: string) {
  try {
    return readFileSync(path, "utf-8");
  } catch (error) {
    return null;
  }
}

function detectKind(filename: string): RecordKind {
  if (filename.endsWith("_facts.jsonl")) {
    return "facts";
  }
  if (filename.endsWith("_rulehits.jsonl")) {
    return "rulehits";
  }
  if (filename.endsWith("_ir.jsonl")) {
    return "ir";
  }
  throw new Error(`Unknown fixture filename pattern: ${filename}`);
}

function validateFile(file: string) {
  const fullPath = resolve(fixturesDir, file);
  if (!statSync(fullPath).isFile()) {
    return;
  }

  const kind = detectKind(file);
  const validator = schemaValidators[kind];
  const content = readFileSync(fullPath, "utf-8");
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    let record: unknown;
    try {
      record = JSON.parse(raw);
    } catch (error) {
      issues.push({
        file,
        line: index + 1,
        message: `JSON parse error: ${(error as Error).message}`
      });
      continue;
    }

    if (typeof record !== "object" || record === null) {
      issues.push({
        file,
        line: index + 1,
        message: "Record is not a JSON object"
      });
      continue;
    }

    const caseId = (record as { caseId?: unknown }).caseId;
    if (typeof caseId !== "string") {
      issues.push({
        file,
        line: index + 1,
        message: "Missing caseId string property"
      });
    } else if (!file.startsWith(caseId)) {
      issues.push({
        file,
        line: index + 1,
        message: `caseId ${caseId} does not match filename ${file}`
      });
    }

    if (validator) {
      const valid = validator(record);
      if (!valid && validator.errors) {
        validator.errors.forEach((error) => {
          const ajvError = error as DefinedError;
          const location = ajvError.instancePath || "(root)";
          issues.push({
            file,
            line: index + 1,
            message: `${location} ${ajvError.message ?? "validation error"}`
          });
        });
      }
    }
  }
}

function main() {
  const fixtureFiles = readdirSync(fixturesDir).filter((file) => file.endsWith(".jsonl"));
  fixtureFiles.sort().forEach(validateFile);

  if (issues.length > 0) {
    console.error("[fail] Cassandra goldset validation failed.");
    issues.forEach((issue) => {
      console.error(`  ${issue.file}:${issue.line} ${issue.message}`);
    });
    process.exitCode = 1;
    return;
  }

  console.log("[ok] Cassandra goldset fixtures passed schema validation.");
}

main();
