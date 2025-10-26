export type Severity = "info" | "low" | "medium" | "high" | "critical";

export interface OriginInfo {
  file?: string;
  line?: number;
}

export interface FactRecord<T = Record<string, unknown>> {
  caseId: string;
  type: string;
  origin?: OriginInfo;
  payload: T;
}

export interface RuleHit {
  type: "RuleHit";
  caseId: string;
  ruleId: string;
  severity: Severity;
  message: string;
  evidence?: Record<string, unknown>;
}

export interface RuleMatch {
  severity?: Severity;
  message: string;
  evidence?: Record<string, unknown>;
  origin?: OriginInfo;
}

export interface RuleDefinition {
  id: string;
  severity: Severity;
  description: string;
  evaluate(context: CaseContext): RuleMatch[];
}

export interface CaseContext {
  caseId: string;
  facts: FactRecord[];
  factsOfType<T = Record<string, unknown>>(type: string): FactRecord<T>[];
}
