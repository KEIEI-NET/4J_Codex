import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { evaluateFacts } from "../engine.js";
import { cassandraRules } from "./cassandra.js";
import type { FactRecord, RuleHit } from "../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..", "..", "..");
const cassandraFixturesDir = resolve(repoRoot, "tests", "goldsets", "cassandra", "fixtures");

function readJsonl<T>(path: string): T[] {
  const content = readFileSync(path, "utf-8");
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line) as T;
      } catch (error) {
        throw new Error(`Failed to parse JSON at ${path}:${index + 1} - ${(error as Error).message}`);
      }
    });
}

describe("cassandra rules", () => {
  it("produce expected RuleHits for CASS-01..10 fixtures", () => {
    const factFiles = readdirSync(cassandraFixturesDir).filter((file) =>
      file.endsWith("_facts.jsonl")
    );
    const ruleHitFiles = readdirSync(cassandraFixturesDir).filter((file) =>
      file.endsWith("_rulehits.jsonl")
    );

    const facts = factFiles.flatMap((file) =>
      readJsonl<FactRecord>(resolve(cassandraFixturesDir, file))
    );
    const expectedHits = ruleHitFiles.flatMap((file) =>
      readJsonl<RuleHit>(resolve(cassandraFixturesDir, file))
    );

    const actualHits = evaluateFacts(facts, { rules: cassandraRules });

    const normalize = (hit: RuleHit) => ({
      caseId: hit.caseId,
      ruleId: hit.ruleId,
      severity: hit.severity,
      message: hit.message
    });

    const sortedActual = actualHits.map(normalize).sort(sortRuleHit);
    const sortedExpected = expectedHits.map(normalize).sort(sortRuleHit);

    expect(sortedActual).toEqual(sortedExpected);
  });
});

function sortRuleHit(
  a: { caseId: string; ruleId: string },
  b: { caseId: string; ruleId: string }
): number {
  if (a.caseId === b.caseId) {
    return a.ruleId.localeCompare(b.ruleId);
  }
  return a.caseId.localeCompare(b.caseId);
}
