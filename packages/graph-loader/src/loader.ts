import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import neo4j, { type Session } from "neo4j-driver";

export interface GraphRecord extends Record<string, unknown> {
  type?: string;
  id?: string;
  rel?: string;
  from?: string;
  to?: string;
}

export interface GraphLoadSummary {
  totalRecords: number;
  nodeRecords: number;
  relRecords: number;
  typeCounts: Record<string, number>;
  relCounts: Record<string, number>;
}

export interface Neo4jLoadOptions {
  uri: string;
  user: string;
  password: string;
  database?: string;
  batchSize?: number;
}

export interface CsvExportOptions {
  outDir: string;
  includeHeaders?: boolean;
}

export class GraphLoaderError extends Error {}

const NODE_TYPES = new Set([
  "File",
  "Symbol",
  "Module",
  "DBTable",
  "DBQuery",
  "ESIndex",
  "RuleHit",
  "HttpEndpoint"
]);

export function readGraphRecords(inputPath: string): GraphRecord[] {
  const raw = readFile(inputPath);
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line) as GraphRecord;
      } catch (error) {
        throw new GraphLoaderError(
          `JSON parse error at record ${index + 1}: ${(error as Error).message}`
        );
      }
    });
}

export function summarizeGraphRecords(records: GraphRecord[]): GraphLoadSummary {
  const summary: GraphLoadSummary = {
    totalRecords: 0,
    nodeRecords: 0,
    relRecords: 0,
    typeCounts: {},
    relCounts: {}
  };

  for (const record of records) {
    summary.totalRecords += 1;
    const type = typeof record.type === "string" ? record.type : "(unknown)";
    summary.typeCounts[type] = (summary.typeCounts[type] ?? 0) + 1;

    if (type === "Rel") {
      summary.relRecords += 1;
      const rel = typeof record.rel === "string" ? record.rel : "(unknown)";
      summary.relCounts[rel] = (summary.relCounts[rel] ?? 0) + 1;
    } else if (NODE_TYPES.has(type)) {
      summary.nodeRecords += 1;
    }
  }

  return summary;
}

export function summarizeGraphInput(inputPath: string): GraphLoadSummary {
  const records = readGraphRecords(inputPath);
  return summarizeGraphRecords(records);
}

export interface GraphLoadMetrics {
  nodeLabels: number;
  nodesWritten: number;
  relationshipTypes: number;
  relationshipsWritten: number;
}

export async function loadGraphToNeo4j(
  records: GraphRecord[],
  options: Neo4jLoadOptions
): Promise<GraphLoadMetrics> {
  validateNeo4jOptions(options);
  const driver = neo4j.driver(options.uri, neo4j.auth.basic(options.user, options.password));
  const session = driver.session({ database: options.database });
  try {
    const { nodesByLabel, relsByType } = buildBatches(records);

    const metrics: GraphLoadMetrics = {
      nodeLabels: nodesByLabel.size,
      nodesWritten: 0,
      relationshipTypes: relsByType.size,
      relationshipsWritten: 0
    };

    await session.executeWrite(async (tx) => {
      for (const [label, batch] of nodesByLabel.entries()) {
        if (batch.length === 0) {
          continue;
        }
        const cypher = `
          UNWIND $batch AS row
          MERGE (n:Entity:${label} {id: row.id})
          SET n += row.props
        `;
        await tx.run(cypher, { batch });
        metrics.nodesWritten += batch.length;
      }

      for (const [relLabel, batch] of relsByType.entries()) {
        if (batch.length === 0) {
          continue;
        }
        const cypher = `
          UNWIND $batch AS row
          MERGE (s:Entity {id: row.from})
          MERGE (t:Entity {id: row.to})
          MERGE (s)-[r:${relLabel}]->(t)
          SET r += row.props
        `;
        await tx.run(cypher, { batch });
        metrics.relationshipsWritten += batch.length;
      }
    });

    return metrics;
  } finally {
    await session.close();
    await driver.close();
  }
}

export function exportGraphToCsv(records: GraphRecord[], options: CsvExportOptions): {
  nodesPath: string;
  relsPath: string;
} {
  const { outDir, includeHeaders = true } = options;
  mkdirSync(outDir, { recursive: true });

  const uniqueNodes = new Map<string, { type: string; props: Record<string, unknown> }>();
  const uniqueRels = new Map<
    string,
    { rel: string; from: string; to: string; props: Record<string, unknown> }
  >();
  const knownNodes = new Map<string, string>();

  const addNodeRecord = (type: string, id: string, props: Record<string, unknown>) => {
    const existing = uniqueNodes.get(id) ?? { type, props: {} };
    existing.type = type;
    existing.props = { ...existing.props, ...props };
    uniqueNodes.set(id, existing);
    knownNodes.set(id, type);
  };

  const ensurePlaceholderNode = (id: string, relRecord?: GraphRecord) => {
    if (knownNodes.has(id)) {
      return;
    }
    const { label, props } = inferPlaceholderNode(id, relRecord);
    addNodeRecord(label, id, props);
  };

  for (const record of records) {
    const type = typeof record.type === "string" ? record.type : undefined;
    if (type && NODE_TYPES.has(type)) {
      const id = typeof record.id === "string" ? record.id : undefined;
      if (!id) {
        continue;
      }
      addNodeRecord(type, id, pickProperties(record, ["type", "id"]));
      continue;
    }

    if (type === "Rel") {
      const from = typeof record.from === "string" ? record.from : undefined;
      const to = typeof record.to === "string" ? record.to : undefined;
      const rel = typeof record.rel === "string" ? record.rel : undefined;
      if (!from || !to || !rel) {
        continue;
      }
      ensurePlaceholderNode(from, record);
      ensurePlaceholderNode(to, record);
      const key = `${from}|${rel}|${to}`;
      const existing = uniqueRels.get(key) ?? {
        rel,
        from,
        to,
        props: {}
      };
      existing.props = {
        ...existing.props,
        ...pickProperties(record, ["type", "rel", "from", "to"])
      };
      uniqueRels.set(key, existing);
    }
  }

  const nodesPath = join(outDir, "nodes.csv");
  const relsPath = join(outDir, "relationships.csv");

  const nodeLines = Array.from(uniqueNodes.entries()).map(([id, value]) => {
    const props = JSON.stringify(value.props ?? {});
    return `${escapeCsv(id)},${escapeCsv(value.type)},${escapeCsv(props)}`;
  });
  const relLines = Array.from(uniqueRels.values()).map((value) => {
    const props = JSON.stringify(value.props ?? {});
    return `${escapeCsv(value.from)},${escapeCsv(value.to)},${escapeCsv(value.rel)},${escapeCsv(props)}`;
  });

  writeFileSync(
    nodesPath,
    [includeHeaders ? "id,type,properties" : null, ...nodeLines].filter(Boolean).join("\n"),
    "utf-8"
  );
  writeFileSync(
    relsPath,
    [includeHeaders ? "from,to,type,properties" : null, ...relLines].filter(Boolean).join("\n"),
    "utf-8"
  );

  return { nodesPath, relsPath };
}

function validateNeo4jOptions(options: Neo4jLoadOptions) {
  if (!options.uri) {
    throw new GraphLoaderError("Neo4j URI (--neo4j-uri) が必要です。");
  }
  if (!options.user || !options.password) {
    throw new GraphLoaderError("Neo4j 認証情報 (--neo4j-user / --neo4j-password) が必要です。");
  }
}

function buildBatches(records: GraphRecord[]): {
  nodesByLabel: Map<string, Array<{ id: string; props: Record<string, unknown> }>>;
  relsByType: Map<
    string,
    Array<{ from: string; to: string; props: Record<string, unknown> }>
  >;
} {
  const nodesByLabel = new Map<string, Array<{ id: string; props: Record<string, unknown> }>>();
  const relsByType = new Map<
    string,
    Array<{ from: string; to: string; props: Record<string, unknown> }>
  >();
  const knownNodes = new Map<string, string>();

  const addNodeRecord = (label: string, id: string, props: Record<string, unknown>) => {
    const list = nodesByLabel.get(label) ?? [];
    const existing = list.find((item) => item.id === id);
    if (existing) {
      existing.props = { ...existing.props, ...props };
    } else {
      list.push({ id, props });
    }
    nodesByLabel.set(label, list);
    knownNodes.set(id, label);
  };

  const ensurePlaceholderNode = (id: string, relRecord?: GraphRecord) => {
    if (knownNodes.has(id)) {
      return;
    }
    const { label, props } = inferPlaceholderNode(id, relRecord);
    addNodeRecord(label, id, props);
  };

  for (const record of records) {
    const type = typeof record.type === "string" ? record.type : undefined;
    if (type && NODE_TYPES.has(type)) {
      const id = typeof record.id === "string" ? record.id : undefined;
      if (!id) {
        continue;
      }
      const label = sanitizeLabel(type);
      const props = pickProperties(record, ["type", "id"]);
      addNodeRecord(label, id, props);
      continue;
    }

    if (type === "Rel") {
      const from = typeof record.from === "string" ? record.from : undefined;
      const to = typeof record.to === "string" ? record.to : undefined;
      const rel = typeof record.rel === "string" ? record.rel : undefined;
      if (!from || !to || !rel) {
        continue;
      }
      ensurePlaceholderNode(from, record);
      ensurePlaceholderNode(to, record);
      const props = pickProperties(record, ["type", "rel", "from", "to"]);
      const label = sanitizeLabel(rel);
      const list = relsByType.get(label) ?? [];
      const existing = list.find((item) => item.from === from && item.to === to);
      if (existing) {
        existing.props = { ...existing.props, ...props };
      } else {
        list.push({ from, to, props });
      }
      relsByType.set(label, list);
    }
  }

  for (const [label, list] of nodesByLabel.entries()) {
    if (list.length === 0) {
      nodesByLabel.delete(label);
    }
  }
  for (const [label, list] of relsByType.entries()) {
    if (list.length === 0) {
      relsByType.delete(label);
    }
  }

  return { nodesByLabel, relsByType };
}

function inferPlaceholderNode(id: string, relRecord?: GraphRecord): {
  label: string;
  props: Record<string, unknown>;
} {
  if (id.startsWith("file:")) {
    return { label: sanitizeLabel("File"), props: { type: "File", id } };
  }
  if (id.startsWith("sym:")) {
    return { label: sanitizeLabel("Symbol"), props: { type: "Symbol", id } };
  }
  if (id.startsWith("dbq:")) {
    return { label: sanitizeLabel("DBQuery"), props: { type: "DBQuery", id } };
  }
  if (id.startsWith("http:")) {
    return {
      label: sanitizeLabel("HttpEndpoint"),
      props: {
        type: "HttpEndpoint",
        id,
        url: typeof relRecord?.url === "string" ? relRecord.url : undefined
      }
    };
  }
  return { label: sanitizeLabel("Entity"), props: { type: "Entity", id } };
}

function pickProperties(record: GraphRecord, omitKeys: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!omitKeys.includes(key)) {
      result[key] = value;
    }
  }
  return result;
}

function sanitizeLabel(label: string): string {
  return label.replace(/[^A-Za-z0-9_]/g, "_");
}

function escapeCsv(value: unknown): string {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes("\"")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function readFile(path: string): string {
  try {
    return readFileSync(path, "utf-8");
  } catch (error) {
    throw new GraphLoaderError(`Failed to read input file ${path}: ${(error as Error).message}`);
  }
}
