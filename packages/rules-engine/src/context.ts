import { CaseContext, FactRecord } from "./types.js";

export function createCaseContext(caseId: string, facts: FactRecord[]): CaseContext {
  return {
    caseId,
    facts,
    factsOfType<T = Record<string, unknown>>(type: string) {
      return facts.filter((fact) => fact.type === type) as FactRecord<T>[];
    }
  };
}

export function groupFactsByCase(facts: FactRecord[]): Map<string, FactRecord[]> {
  const grouped = new Map<string, FactRecord[]>();
  facts.forEach((fact) => {
    const bucket = grouped.get(fact.caseId);
    if (bucket) {
      bucket.push(fact);
      return;
    }
    grouped.set(fact.caseId, [fact]);
  });
  return grouped;
}
