import { CaseContext, FactRecord, RuleDefinition, RuleMatch } from "../types.js";

interface DbQueryPayload {
  cql?: string;
  operation?: string;
  allowFiltering?: boolean;
  parameters?: string[] | null;
  limit?: number | null;
  consistency?: string | null;
  predicates?: Array<{ column: string; operator: string; value?: unknown; inListLength?: number }>;
  secondaryIndexUsed?: boolean;
  orderBy?: Array<{ column: string; direction: string }>;
  clusteringOrder?: string[] | null;
  timeoutMillis?: number | null;
  builder?: string;
  builderMethod?: string;
  inListLength?: number;
  joinLike?: boolean;
  materializedViewExists?: boolean;
}

interface TableSchemaPayload {
  keyspace?: string;
  table?: string;
  partitionKeys?: string[];
  materializedViews?: string[];
}

interface ExecutionConfigPayload {
  pageSize?: number | null;
}

interface MutationPayload {
  operation?: string;
  consistency?: string | null;
  ifCondition?: boolean;
  idempotent?: boolean;
  table?: string;
}

interface BatchPayload {
  kind?: string;
  statements?: Array<{ operation?: string; ifCondition?: boolean }>;
}

interface StatementUsagePayload {
  statementKind?: string;
  usesPrepared?: boolean;
  executions?: number;
  query?: string;
}

interface RetryPolicyPayload {
  policyClass?: string;
  onWriteTimeout?: string;
  maxAttempts?: number;
}

interface JobConfigPayload {
  job?: string;
  batchSize?: number;
  ttlStrategy?: string | null;
}

interface PartitionMetricsPayload {
  table?: string;
  partitionKey?: string;
  writesPerSecond?: number;
  shareOfCluster?: number;
  windowSeconds?: number;
}

interface LwtUsagePayload {
  table?: string;
  lwtPerSecond?: number;
  lwtToTotalRatio?: number;
  sampleWindowSeconds?: number;
}

interface TableConfigPayload {
  table?: string;
  readRepairChance?: number;
  dcReplication?: Record<string, number>;
}

interface ConsistencyUsagePayload {
  table?: string;
  readConsistency?: string;
  writeConsistency?: string;
  readRepairRate?: number;
}

interface TableCompactionPayload {
  table?: string;
  strategy?: string;
  windowSizeHours?: number;
}

interface AccessPatternPayload {
  table?: string;
  pattern?: string;
  olderDataAccessRatio?: number;
}

interface PartitionSizePayload {
  table?: string;
  partitionKey?: string;
  rowCount?: number;
  sizeMb?: number;
}

const DEFAULT_MIN_PREPARE_THRESHOLD = 5;
const DEFAULT_MIN_TOMBSTONE_BATCH = 1000;
const DEFAULT_IN_LIST_THRESHOLD = 50;
const DEFAULT_HOT_PARTITION_SHARE = 0.5;
const DEFAULT_HOT_PARTITION_WRITES = 500;
const DEFAULT_LWT_THRESHOLD = 500;
const DEFAULT_LWT_RATIO = 0.5;
const DEFAULT_READ_REPAIR_CHANCE = 0.1;
const DEFAULT_READ_REPAIR_RATE = 100;
const DEFAULT_TWCS_ACCESS_THRESHOLD = 0.4;
const DEFAULT_WIDE_PARTITION_ROWS = 500000;
const DEFAULT_WIDE_PARTITION_SIZE_MB = 100;

interface NormalizedQuery {
  fact: FactRecord<DbQueryPayload>;
  table?: string;
  missingPartitionKeys: string[];
}

function hasOwnProperty<T extends object>(
  obj: T | undefined,
  key: string | number | symbol
): boolean {
  return Boolean(obj && Object.prototype.hasOwnProperty.call(obj, key));
}

function extractTableFromCql(cql?: string): { keyspace?: string; table?: string } | null {
  if (!cql) {
    return null;
  }
  const match = /\bFROM\s+([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)/i.exec(cql);
  if (match) {
    return { keyspace: match[1], table: match[2] };
  }
  const updateMatch = /\bINTO\s+([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)/i.exec(cql);
  if (updateMatch) {
    return { keyspace: updateMatch[1], table: updateMatch[2] };
  }
  return null;
}

function collectQueries(context: CaseContext): NormalizedQuery[] {
  const dbQueries = context.factsOfType<DbQueryPayload>("DBQuery");
  const schemas = context.factsOfType<TableSchemaPayload>("TableSchema");

  return dbQueries.map((fact) => {
    const tableInfo = extractTableFromCql(fact.payload.cql);
    let schema: FactRecord<TableSchemaPayload> | undefined;
    if (tableInfo?.table) {
      schema = schemas.find(
        (schemaFact) =>
          schemaFact.payload.table === tableInfo.table &&
          (schemaFact.payload.keyspace == null || schemaFact.payload.keyspace === tableInfo.keyspace)
      );
    }
    const partitionKeys = schema?.payload.partitionKeys ?? [];
    const parameters = new Set(
      (fact.payload.parameters ?? []).map((param) => param.toLowerCase())
    );
    const missingPartitionKeys = partitionKeys.filter(
      (key) => !parameters.has(key.toLowerCase())
    );
    return {
      fact,
      table: tableInfo?.table,
      missingPartitionKeys
    };
  });
}

function matchAllowFiltering(context: CaseContext): RuleMatch[] {
  const queries = collectQueries(context);
  return queries
    .filter((entry) => entry.fact.payload.allowFiltering === true)
    .map((entry) => {
      const severity = entry.missingPartitionKeys.length > 0 ? "critical" : "high";
      const message =
        entry.missingPartitionKeys.length > 0
          ? `ALLOW FILTERING on ${entry.table ?? "query"} without partition predicates`
          : "ALLOW FILTERING with secondary index query";
      return {
        severity,
        message,
        evidence: {
          file: entry.fact.origin?.file,
          line: entry.fact.origin?.line,
          cql: entry.fact.payload.cql
        }
      };
    });
}

function matchMvMissing(context: CaseContext): RuleMatch[] {
  const queries = collectQueries(context);
  return queries
    .filter(
      (entry) =>
        entry.fact.payload.joinLike === true &&
        entry.fact.payload.materializedViewExists === false
    )
    .map((entry) => ({
      severity: "medium",
      message: "Join-like access without materialized view",
      evidence: {
        table: entry.table,
        suggestedView: `${entry.table ?? "table"}_by_status`
      }
    }));
}

function matchMissingPk(context: CaseContext): RuleMatch[] {
  const queries = collectQueries(context);
  return queries
    .filter(
      (entry) =>
        entry.fact.payload.operation?.toUpperCase() === "SELECT" &&
        entry.missingPartitionKeys.length > 0
    )
    .map((entry) => ({
      severity: "critical",
      message: `Partition keys ${entry.missingPartitionKeys.join("/")} missing from WHERE clause`,
      evidence: {
        table: entry.table,
        missingKeys: entry.missingPartitionKeys
      }
    }));
}

function matchNoLimit(context: CaseContext): RuleMatch[] {
  const queries = collectQueries(context);
  return queries
    .filter((entry) => {
      if (!hasOwnProperty(entry.fact.payload, "limit")) {
        return false;
      }
      const limitValue = entry.fact.payload.limit;
      return (
        entry.fact.payload.operation?.toUpperCase() === "SELECT" &&
        (limitValue === null || limitValue === undefined)
      );
    })
    .map((entry) => {
      const label = entry.table ?? "query";
      return {
        message: `SELECT on ${label} lacks LIMIT`,
        evidence: {
          file: entry.fact.origin?.file,
          line: entry.fact.origin?.line,
          cql: entry.fact.payload.cql
        }
      };
    });
}

function matchNoPaging(context: CaseContext): RuleMatch[] {
  const configs = context.factsOfType<ExecutionConfigPayload>("ExecutionConfig");
  return configs
    .filter(
      (fact) =>
        hasOwnProperty(fact.payload, "pageSize") &&
        (!fact.payload.pageSize || fact.payload.pageSize <= 0)
    )
    .map((fact) => ({
      message: "Statement executes without page size configuration",
      evidence: {
        pageSize: fact.payload.pageSize ?? null
      }
    }));
}

function matchConsistencyMismatch(context: CaseContext): RuleMatch[] {
  const dbQueries = context.factsOfType<DbQueryPayload>("DBQuery");
  const mutations = context.factsOfType<MutationPayload>("Mutation");
  const reads = dbQueries
    .map((fact) => fact.payload.consistency?.toUpperCase())
    .filter((consistency): consistency is string => Boolean(consistency));
  const writes = mutations
    .map((fact) => fact.payload.consistency?.toUpperCase())
    .filter((consistency): consistency is string => Boolean(consistency));

  if (!reads.length || !writes.length) {
    return [];
  }

  const mismatched = reads.some((readConsistency) =>
    writes.some((writeConsistency) => writeConsistency !== readConsistency)
  );

  if (!mismatched) {
    return [];
  }

  const readLevel = reads[0];
  const writeLevel = writes[0];

  return [
    {
      severity: "high",
      message: `Read at ${readLevel} while writes occur at ${writeLevel}`,
      evidence: {
        readLevels: reads,
        writeLevels: writes
      }
    }
  ];
}

function matchReadRepairMismatch(context: CaseContext): RuleMatch[] {
  const configs = context.factsOfType<TableConfigPayload>("TableConfig");
  const usages = context.factsOfType<ConsistencyUsagePayload>("ConsistencyUsage");

  return usages
    .map((usage) => {
      const table = usage.payload.table;
      const config = configs.find((item) => item.payload.table === table);
      return { usage, config };
    })
    .filter((entry) => {
      const chance = entry.config?.payload.readRepairChance ?? 0;
      const readConsistency = entry.usage.payload.readConsistency?.toUpperCase();
      const writeConsistency = entry.usage.payload.writeConsistency?.toUpperCase();
      const mismatch = readConsistency && writeConsistency && readConsistency !== writeConsistency;
      const repairRate = entry.usage.payload.readRepairRate ?? 0;
      return mismatch && chance >= DEFAULT_READ_REPAIR_CHANCE && repairRate >= DEFAULT_READ_REPAIR_RATE;
    })
    .map((entry) => ({
      severity: "medium",
      message: `Read repair chance ${entry.config?.payload.readRepairChance} with consistency mismatch`,
      evidence: {
        table: entry.usage.payload.table,
        readRepairChance: entry.config?.payload.readRepairChance,
        readConsistency: entry.usage.payload.readConsistency,
        writeConsistency: entry.usage.payload.writeConsistency
      }
    }));
}

function matchMixedLwtBatch(context: CaseContext): RuleMatch[] {
  const batches = context.factsOfType<BatchPayload>("Batch");
  return batches
    .filter((fact) => fact.payload.statements?.length)
    .flatMap((fact) => {
      const statements = fact.payload.statements ?? [];
      const hasLwt = statements.some((statement) => statement.ifCondition === true);
      const hasNonLwt = statements.some((statement) => statement.ifCondition === false);
      if (!hasLwt || !hasNonLwt) {
        return [];
      }
      return [
        {
          severity: "medium",
          message: "Batch mixes IF LWT and non-LWT mutations",
          evidence: {
            batchKind: fact.payload.kind ?? "UNKNOWN",
            statementCount: statements.length
          }
        }
      ];
    });
}

function matchMissingPrepare(context: CaseContext): RuleMatch[] {
  const usages = context.factsOfType<StatementUsagePayload>("StatementUsage");
  return usages
    .filter(
      (fact) =>
        fact.payload.statementKind === "SimpleStatement" &&
        fact.payload.usesPrepared === false &&
        (fact.payload.executions ?? 0) >= DEFAULT_MIN_PREPARE_THRESHOLD
    )
    .map((fact) => ({
      severity: "low",
      message: "SimpleStatement executed repeatedly without prepare/bind",
      evidence: {
        executions: fact.payload.executions,
        statementKind: fact.payload.statementKind,
        query: fact.payload.query
      }
    }));
}

function matchSecondaryIndexLike(context: CaseContext): RuleMatch[] {
  const queries = collectQueries(context);
  return queries
    .filter((entry) => {
      const fact = entry.fact;
      if (!fact.payload.secondaryIndexUsed) {
        return false;
      }
      const predicate = fact.payload.predicates?.find(
        (item) => item.operator?.toUpperCase() === "LIKE"
      );
      if (!predicate) {
        return false;
      }
      const value = typeof predicate.value === "string" ? predicate.value : undefined;
      return value ? value.includes("%") : true;
    })
    .map((entry) => ({
      severity: "high",
      message: "LIKE predicate on secondary index leads to full scan",
      evidence: {
        cql: entry.fact.payload.cql,
        predicates: entry.fact.payload.predicates
      }
    }));
}

function matchSecondaryIndexLimit(context: CaseContext): RuleMatch[] {
  const queries = collectQueries(context);
  return queries
    .filter((entry) => {
      if (!entry.fact.payload.secondaryIndexUsed) {
        return false;
      }
      if (!hasOwnProperty(entry.fact.payload, "limit")) {
        return false;
      }
      const limitValue = entry.fact.payload.limit;
      return limitValue === null || limitValue === undefined;
    })
    .map((entry) => ({
      severity: "high",
      message: "Secondary index query must specify LIMIT and paging",
      evidence: {
        cql: entry.fact.payload.cql
      }
    }));
}

function matchTripleBadFilter(context: CaseContext): RuleMatch[] {
  const queries = collectQueries(context);
  return queries
    .filter((entry) => {
      if (!entry.fact.payload.allowFiltering || !entry.fact.payload.secondaryIndexUsed) {
        return false;
      }
      const likePredicate = entry.fact.payload.predicates?.find(
        (predicate) => predicate.operator?.toUpperCase() === "LIKE"
      );
      if (!likePredicate) {
        return false;
      }
      const value = typeof likePredicate.value === "string" ? likePredicate.value : undefined;
      return value ? value.includes("%") : true;
    })
    .map((entry) => ({
      severity: "critical",
      message: "ALLOW FILTERING + secondary index + LIKE combination detected",
      evidence: {
        cql: entry.fact.payload.cql
      }
    }));
}

function matchBulkDeleteTombstones(context: CaseContext): RuleMatch[] {
  const dbQueries = context.factsOfType<DbQueryPayload>("DBQuery");
  const jobs = context.factsOfType<JobConfigPayload>("JobConfig");
  const highRiskDelete = dbQueries.find(
    (fact) =>
      fact.payload.operation?.toUpperCase() === "DELETE" &&
      (fact.payload as unknown as { tombstoneRisk?: string }).tombstoneRisk === "high"
  );
  if (!highRiskDelete) {
    return [];
  }
  const job = jobs[0];
  const batchSize = job?.payload.batchSize ?? DEFAULT_MIN_TOMBSTONE_BATCH;

  return [
    {
      severity: "medium",
      message: "Bulk DELETE generates excessive tombstones",
      evidence: {
        job: job?.payload.job,
        batchSize,
        strategy: job?.payload.ttlStrategy
      }
    }
  ];
}

function matchOrderBySkew(context: CaseContext): RuleMatch[] {
  const queries = collectQueries(context);
  return queries
    .filter((entry) => (entry.fact.payload.orderBy?.length ?? 0) > 0)
    .flatMap((fact) => {
      const requestedDirection = fact.fact.payload.orderBy?.[0]?.direction?.toUpperCase();
      if (!requestedDirection) {
        return [];
      }
      const clusteringOrderRaw = fact.fact.payload.clusteringOrder?.[0];
      if (!clusteringOrderRaw) {
        return [];
      }
      const match = /(ASC|DESC)$/i.exec(clusteringOrderRaw);
      const clusterDirection = match ? match[1].toUpperCase() : undefined;
      if (!clusterDirection || clusterDirection === requestedDirection) {
        return [];
      }
      const column = fact.fact.payload.orderBy?.[0]?.column ?? "column";
      return [
        {
          severity: "low",
          message: `ORDER BY ${column} ${requestedDirection} conflicts with clustering order ${clusterDirection}`,
          evidence: {
            clusterOrder: clusterDirection,
            requestedOrder: requestedDirection,
            cql: fact.fact.payload.cql
          }
        }
      ];
    });
}

function matchTwcsMismatch(context: CaseContext): RuleMatch[] {
  const compactions = context.factsOfType<TableCompactionPayload>("TableCompaction");
  const accessPatterns = context.factsOfType<AccessPatternPayload>("AccessPattern");

  return compactions
    .map((compaction) => {
      const table = compaction.payload.table;
      const access = accessPatterns.find((pattern) => pattern.payload.table === table);
      return { compaction, access };
    })
    .filter((entry) => {
      const strategy = entry.compaction.payload.strategy?.toLowerCase();
      if (!strategy || !strategy.includes("timewindowcompactionstrategy")) {
        return false;
      }
      const accessPattern = entry.access?.payload.pattern?.toLowerCase() ?? "";
      const randomAccess = accessPattern.includes("random");
      const olderRatio = entry.access?.payload.olderDataAccessRatio ?? 0;
      return randomAccess || olderRatio >= DEFAULT_TWCS_ACCESS_THRESHOLD;
    })
    .map((entry) => ({
      severity: "medium",
      message: "TWCS strategy conflicts with random point-read access",
      evidence: {
        table: entry.compaction.payload.table,
        strategy: entry.compaction.payload.strategy,
        accessPattern: entry.access?.payload.pattern
      }
    }));
}

function matchWriteTimeoutRetry(context: CaseContext): RuleMatch[] {
  const policies = context.factsOfType<RetryPolicyPayload>("RetryPolicy");
  const mutations = context.factsOfType<MutationPayload>("Mutation");
  const retryOnWriteTimeout = policies.find(
    (fact) => fact.payload.onWriteTimeout?.toLowerCase() === "retry"
  );
  if (!retryOnWriteTimeout) {
    return [];
  }
  const nonIdempotentUpdate = mutations.find((fact) => fact.payload.idempotent === false);
  if (!nonIdempotentUpdate) {
    return [];
  }
  return [
    {
      severity: "high",
      message: "Write timeout retried without idempotent guarantee",
      evidence: {
        policy: policies[0]?.payload.policyClass,
        idempotent: nonIdempotentUpdate.payload.idempotent
      }
    }
  ];
}

function matchNoTimeout(context: CaseContext): RuleMatch[] {
  const queries = collectQueries(context);
  return queries
    .filter((entry) => {
      if (!hasOwnProperty(entry.fact.payload, "timeoutMillis")) {
        return false;
      }
      const value = entry.fact.payload.timeoutMillis;
      return value === null || value === undefined || value === 0;
    })
    .map((entry) => ({
      severity: "medium",
      message: "Statement executed without read timeout configuration",
      evidence: {
        cql: entry.fact.payload.cql
      }
    }));
}

function matchHotPartition(context: CaseContext): RuleMatch[] {
  const metrics = context.factsOfType<PartitionMetricsPayload>("PartitionMetrics");
  return metrics
    .filter((fact) => {
      const writesPerSecond = fact.payload.writesPerSecond ?? 0;
      const share = fact.payload.shareOfCluster ?? 0;
      return writesPerSecond >= DEFAULT_HOT_PARTITION_WRITES || share >= DEFAULT_HOT_PARTITION_SHARE;
    })
    .map((fact) => ({
      severity: "high",
      message: `Partition ${fact.payload.partitionKey ?? "unknown"} receives ${formatPercent(
        fact.payload.shareOfCluster
      )} of write load`,
      evidence: {
        partitionKey: fact.payload.partitionKey,
        writesPerSecond: fact.payload.writesPerSecond,
        shareOfCluster: fact.payload.shareOfCluster
      }
    }));
}

function matchWidePartition(context: CaseContext): RuleMatch[] {
  const partitions = context.factsOfType<PartitionSizePayload>("PartitionSize");
  return partitions
    .filter((fact) => {
      const rows = fact.payload.rowCount ?? 0;
      const sizeMb = fact.payload.sizeMb ?? 0;
      return rows >= DEFAULT_WIDE_PARTITION_ROWS || sizeMb >= DEFAULT_WIDE_PARTITION_SIZE_MB;
    })
    .map((fact) => ({
      severity: "high",
      message: `Partition ${fact.payload.partitionKey ?? "unknown"} holds ${fact.payload.rowCount} rows (${fact.payload.sizeMb}MB)`,
      evidence: {
        table: fact.payload.table,
        rowCount: fact.payload.rowCount,
        sizeMb: fact.payload.sizeMb
      }
    }));
}

function formatPercent(value?: number | null): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "a high share";
  }
  return `${Math.round(value * 100)}%`;
}

function matchInListFanout(context: CaseContext): RuleMatch[] {
  const queries = collectQueries(context);
  return queries
    .map((entry) => {
      const predicate = entry.fact.payload.predicates?.find(
        (item) => item.operator?.toUpperCase() === "IN"
      );
      const length =
        (predicate?.inListLength as number | undefined) ??
        (entry.fact.payload as unknown as { inListLength?: number }).inListLength;
      return { entry, length };
    })
    .filter((item) => (item.length ?? 0) >= DEFAULT_IN_LIST_THRESHOLD)
    .map((item) => ({
      severity: "medium",
      message: `IN clause contains ${item.length} values which will fan out into multiple queries`,
      evidence: {
        column:
          item.entry.fact.payload.predicates?.find((p) => p.operator?.toUpperCase() === "IN")?.column ??
          "unknown",
        inListLength: item.length
      }
    }));
}

function matchAllowFilteringBuilder(context: CaseContext): RuleMatch[] {
  const queries = collectQueries(context);
  return queries
    .filter((entry) => entry.fact.payload.builder?.toLowerCase() === "querybuilder")
    .map((entry) => ({
      severity: "medium",
      message: "QueryBuilder#allowFiltering detected in service layer",
      evidence: {
        builder: entry.fact.payload.builder,
        method: entry.fact.payload.builderMethod ?? "allowFiltering"
      }
    }));
}

function matchLwtOveruse(context: CaseContext): RuleMatch[] {
  const usages = context.factsOfType<LwtUsagePayload>("LwtUsage");
  return usages
    .filter((usage) => {
      const rate = usage.payload.lwtPerSecond ?? 0;
      const ratio = usage.payload.lwtToTotalRatio ?? 0;
      return rate >= DEFAULT_LWT_THRESHOLD || ratio >= DEFAULT_LWT_RATIO;
    })
    .map((usage) => ({
      severity: "high",
      message: `LWT throughput ${usage.payload.lwtPerSecond}/s exceeds safe threshold`,
      evidence: {
        lwtPerSecond: usage.payload.lwtPerSecond,
        ratio: usage.payload.lwtToTotalRatio,
        table: usage.payload.table
      }
    }));
}

export const cassandraRules: RuleDefinition[] = [
  {
    id: "ALLOW_FILTERING",
    severity: "critical",
    description: "Detects ALLOW FILTERING usage",
    evaluate: matchAllowFiltering
  },
  {
    id: "MV_MISSING",
    severity: "medium",
    description: "Detects join-like SELECT without materialized view",
    evaluate: matchMvMissing
  },
  {
    id: "MISSING_PK",
    severity: "critical",
    description: "Detects SELECT queries missing partition key predicates",
    evaluate: matchMissingPk
  },
  {
    id: "HOT_PARTITION",
    severity: "high",
    description: "Detects partitions receiving disproportionate write load",
    evaluate: matchHotPartition
  },
  {
    id: "WIDE_PARTITION",
    severity: "high",
    description: "Detects partitions that have grown too large",
    evaluate: matchWidePartition
  },
  {
    id: "NO_LIMIT",
    severity: "high",
    description: "Detects SELECT queries without LIMIT",
    evaluate: matchNoLimit
  },
  {
    id: "IN_LIST_FANOUT",
    severity: "medium",
    description: "Detects large IN clause fan-out",
    evaluate: matchInListFanout
  },
  {
    id: "NO_PAGING",
    severity: "high",
    description: "Detects lack of explicit paging size configuration",
    evaluate: matchNoPaging
  },
  {
    id: "CONSISTENCY_MISMATCH",
    severity: "high",
    description: "Detects read/write consistency mismatch",
    evaluate: matchConsistencyMismatch
  },
  {
    id: "READ_REPAIR_MISMATCH",
    severity: "medium",
    description: "Detects high read repair chance with mismatched consistency",
    evaluate: matchReadRepairMismatch
  },
  {
    id: "MIXED_LWT_BATCH",
    severity: "medium",
    description: "Detects batches mixing LWT and non-LWT statements",
    evaluate: matchMixedLwtBatch
  },
  {
    id: "LWT_OVERUSE",
    severity: "high",
    description: "Detects excessive reliance on LWT in hot paths",
    evaluate: matchLwtOveruse
  },
  {
    id: "MISSING_PREPARE",
    severity: "low",
    description: "Detects repeated SimpleStatement usage without prepare",
    evaluate: matchMissingPrepare
  },
  {
    id: "SECONDARY_INDEX_LIKE",
    severity: "high",
    description: "Detects LIKE predicates on secondary indexes",
    evaluate: matchSecondaryIndexLike
  },
  {
    id: "SECONDARY_INDEX_LIMIT",
    severity: "high",
    description: "Detects secondary index queries without LIMIT/paging",
    evaluate: matchSecondaryIndexLimit
  },
  {
    id: "TRIPLE_BAD_FILTER",
    severity: "critical",
    description: "Detects ALLOW FILTERING + secondary index + LIKE",
    evaluate: matchTripleBadFilter
  },
  {
    id: "BULK_DELETE_TOMBSTONES",
    severity: "medium",
    description: "Detects bulk deletes that generate excessive tombstones",
    evaluate: matchBulkDeleteTombstones
  },
  {
    id: "TWCS_MISMATCH",
    severity: "medium",
    description: "Detects TWCS tables accessed with random patterns",
    evaluate: matchTwcsMismatch
  },
  {
    id: "ORDER_BY_SKEW",
    severity: "low",
    description: "Detects ORDER BY that conflicts with clustering order",
    evaluate: matchOrderBySkew
  },
  {
    id: "WRITE_TIMEOUT_RETRY",
    severity: "high",
    description: "Detects aggressive write timeout retry policies",
    evaluate: matchWriteTimeoutRetry
  },
  {
    id: "ALLOW_FILTERING_BUILDER",
    severity: "medium",
    description: "Detects QueryBuilder#allowFiltering usage",
    evaluate: matchAllowFilteringBuilder
  },
  {
    id: "NO_TIMEOUT",
    severity: "medium",
    description: "Detects statements executed without read timeout configuration",
    evaluate: matchNoTimeout
  }
];

export function evaluateCassandra(context: CaseContext): RuleMatch[] {
  return cassandraRules.flatMap((rule) => rule.evaluate(context));
}
