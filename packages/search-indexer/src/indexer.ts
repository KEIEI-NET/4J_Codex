import { readFileSync } from "node:fs";
import { Client } from "@opensearch-project/opensearch";

export interface IndexRecord extends Record<string, unknown> {
  type?: string;
  id?: string;
}

export interface IndexSummary {
  totalRecords: number;
  documentCounts: Record<string, number>;
}

export interface OpenSearchOptions {
  endpoint: string;
  username?: string;
  password?: string;
  indexPrefix?: string;
  refresh?: boolean;
  setupIndices?: boolean;
}

export class SearchIndexerError extends Error {}

export function readIndexRecords(inputPath: string): IndexRecord[] {
  const raw = readFile(inputPath);
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line) as IndexRecord;
      } catch (error) {
        throw new SearchIndexerError(
          `JSON parse error at record ${index + 1}: ${(error as Error).message}`
        );
      }
    });
}

export function summarizeIndexRecords(records: IndexRecord[]): IndexSummary {
  const summary: IndexSummary = {
    totalRecords: 0,
    documentCounts: {}
  };

  for (const record of records) {
    summary.totalRecords += 1;
    const type = typeof record.type === "string" ? record.type : "(unknown)";
    summary.documentCounts[type] = (summary.documentCounts[type] ?? 0) + 1;
  }

  return summary;
}

export function summarizeIndexInput(inputPath: string): IndexSummary {
  return summarizeIndexRecords(readIndexRecords(inputPath));
}

export interface IndexMetrics {
  documentsWritten: number;
  indicesCreated: number;
  indicesTouched: number;
}

export async function indexDocuments(
  records: IndexRecord[],
  options: OpenSearchOptions
): Promise<IndexMetrics> {
  validateOptions(options);
  const client = new Client({
    node: options.endpoint,
    auth:
      options.username && options.password
        ? { username: options.username, password: options.password }
        : undefined
  });

  const body: unknown[] = [];
  const prefix = options.indexPrefix ?? "codex";

  for (const record of records) {
    const type = typeof record.type === "string" ? record.type : "generic";
    const indexName = `${prefix}-${type.toLowerCase()}`;
    const id = typeof record.id === "string" ? record.id : undefined;
    body.push({ index: { _index: indexName, ...(id ? { _id: id } : {}) } });
    body.push(record);
  }

  if (body.length === 0) {
    return { documentsWritten: 0, indicesCreated: 0, indicesTouched: 0 };
  }

  const indices = Array.from(new Set(indexNames(records, prefix)));
  let indicesCreated = 0;
  if (options.setupIndices !== false) {
    indicesCreated = await ensureIndices(client, indices);
  }

  const response = await client.bulk({
    body: body as any,
    refresh: options.refresh ?? true
  });

  const results = (response as { body?: { errors?: boolean; items?: Array<Record<string, any>> } })
    .body;
  if (results?.errors) {
    const failures = (results.items ?? [])
      .map((item) => Object.values(item)[0])
      .filter((entry) => entry?.error)
      .map((entry) => entry.error?.reason ?? "unknown error")
      .slice(0, 5)
      .join("; ");
    throw new SearchIndexerError(
      `OpenSearch bulk indexing reported errors: ${failures || "see logs"}`
    );
  }

  return {
    documentsWritten: records.length,
    indicesCreated,
    indicesTouched: indices.length
  };
}

function validateOptions(options: OpenSearchOptions) {
  if (!options.endpoint) {
    throw new SearchIndexerError("OpenSearch エンドポイント (--endpoint) が必要です。");
  }
}

function indexNames(records: IndexRecord[], prefix: string): string[] {
  const indices = new Set<string>();
  for (const record of records) {
    const type = typeof record.type === "string" ? record.type : "generic";
    indices.add(`${prefix}-${type.toLowerCase()}`);
  }
  return Array.from(indices);
}

export async function ensureIndices(client: Client, indices: string[]): Promise<number> {
  let created = 0;
  for (const index of indices) {
    const exists = await client.indices.exists({ index });
    if (!(exists as { body: boolean }).body) {
      await client.indices.create({
        index,
        body: {
          settings: {
            number_of_shards: 1,
            number_of_replicas: 0
          }
        }
      });
      created += 1;
    }
  }
  return created;
}

function readFile(path: string): string {
  try {
    return readFileSync(path, "utf-8");
  } catch (error) {
    throw new SearchIndexerError(`Failed to read input file ${path}: ${(error as Error).message}`);
  }
}
