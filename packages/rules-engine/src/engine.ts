import { createCaseContext, groupFactsByCase } from "./context.js";
import { RuleDefinition, RuleHit, FactRecord } from "./types.js";

export interface EvaluateOptions {
  rules: RuleDefinition[];
}

export function evaluateFacts(facts: FactRecord[], options: EvaluateOptions): RuleHit[] {
  const grouped = groupFactsByCase(facts);
  const hits: RuleHit[] = [];

  grouped.forEach((caseFacts, caseId) => {
    const context = createCaseContext(caseId, caseFacts);
    options.rules.forEach((rule) => {
      const ruleMatches = rule.evaluate(context);
      ruleMatches.forEach((match) => {
        hits.push({
          type: "RuleHit",
          caseId,
          ruleId: rule.id,
          severity: match.severity ?? rule.severity,
          message: match.message,
          evidence: match.evidence
        });
      });
    });
  });

  return hits;
}
