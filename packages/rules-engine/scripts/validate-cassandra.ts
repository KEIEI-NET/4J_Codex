#!/usr/bin/env ts-node

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv, { DefinedError } from "ajv";

type RecordKind = "facts" | "rulehits" | "ir";

interface ValidationIssue {
  file: string;
  line: number;
  message: string;
}

interface ValidationStats {
  totalRecords: number;
  facts: number;
  rulehits: number;
  ir: number;
  cases: Set<string>;
  ruleHitCounts: Map<string, number>;
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
const stats: ValidationStats = {
  totalRecords: 0,
  facts: 0,
  rulehits: 0,
  ir: 0,
  cases: new Set<string>(),
  ruleHitCounts: new Map<string, number>()
};

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
    stats.totalRecords += 1;
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
    } else {
      stats.cases.add(caseId);
    }

    if (kind === "facts") {
      stats.facts += 1;
    } else if (kind === "rulehits") {
      stats.rulehits += 1;
      const ruleId = (record as { ruleId?: unknown }).ruleId;
      if (typeof ruleId === "string") {
        stats.ruleHitCounts.set(ruleId, (stats.ruleHitCounts.get(ruleId) ?? 0) + 1);
      }
    } else if (kind === "ir") {
      stats.ir += 1;
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
  const args = process.argv.slice(2);
  let reportPath: string | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--report") {
      reportPath = args[index + 1] ?? null;
      index += 1;
    }
  }

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
  console.log(
    `[summary] cases=${stats.cases.size} records=${stats.totalRecords} facts=${stats.facts} rulehits=${stats.rulehits}`
  );
  if (stats.ruleHitCounts.size > 0) {
    const ruleCoverage = Array.from(stats.ruleHitCounts.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([rule, count]) => `${rule}:${count}`)
      .join(", ");
    console.log(`[summary] rule coverage ${ruleCoverage}`);
  }

  if (reportPath) {
    const report = {
      timestamp: new Date().toISOString(),
      cases: Array.from(stats.cases.values()).sort(),
      totals: {
        records: stats.totalRecords,
        facts: stats.facts,
        rulehits: stats.rulehits
      },
      ruleHitCounts: Object.fromEntries(stats.ruleHitCounts)
    };
    writeReport(reportPath, report);
    console.log(`[summary] report written to ${reportPath}`);
  }
}

main();

function writeReport(path: string, data: unknown) {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
  } catch (error) {
    console.warn(`[warn] failed to write report to ${path}: ${(error as Error).message}`);
  }
}
