import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  SearchIndexerError,
  indexDocuments,
  readIndexRecords,
  summarizeIndexInput,
  summarizeIndexRecords
} from "./indexer.js";

const bulkMock = vi.fn().mockResolvedValue({ body: { errors: false, items: [] } });
const existsMock = vi.fn().mockResolvedValue({ body: false });
const createMock = vi.fn().mockResolvedValue({});

vi.mock("@opensearch-project/opensearch", () => {
  return {
    Client: vi.fn().mockImplementation(() => ({
      bulk: bulkMock,
      indices: {
        exists: existsMock,
        create: createMock
      }
    }))
  };
});

describe("summarizeIndexInput", () => {
  it("タイプごとの件数を返す", () => {
    const dir = mkdtempSync(join(tmpdir(), "search-indexer-test-"));
    const file = join(dir, "sample.jsonl");
    const lines = [
      { type: "File", id: "file:src/index.ts" },
      { type: "Symbol", id: "sym:Service#do" },
      { type: "RuleHit", ruleId: "ALLOW_FILTERING" }
    ];
    writeFileSync(file, lines.map((line) => JSON.stringify(line)).join("\n"), "utf-8");

    const summary = summarizeIndexInput(file);

    expect(summary.totalRecords).toBe(3);
    expect(summary.documentCounts).toEqual({ File: 1, Symbol: 1, RuleHit: 1 });
  });

  it("不正な JSON を検出する", () => {
    const dir = mkdtempSync(join(tmpdir(), "search-indexer-test-"));
    const file = join(dir, "broken.jsonl");
    writeFileSync(file, "not-json", "utf-8");

    expect(() => summarizeIndexInput(file)).toThrow(SearchIndexerError);
  });
});

describe("indexDocuments", () => {
  beforeEach(() => {
    bulkMock.mockClear();
    existsMock.mockClear();
    createMock.mockClear();
  });

  it("OpenSearch にバルク投入する", async () => {
    const dir = mkdtempSync(join(tmpdir(), "search-indexer-test-"));
    const file = join(dir, "records.jsonl");
    const lines = [
      { type: "File", id: "file:src/index.ts", path: "src/index.ts" },
      { type: "RuleHit", id: "rule:CASS-01", ruleId: "ALLOW_FILTERING" }
    ];
    writeFileSync(file, lines.map((line) => JSON.stringify(line)).join("\n"), "utf-8");

    const records = readIndexRecords(file);
    const summary = summarizeIndexRecords(records);
    expect(summary.totalRecords).toBe(2);

    const metrics = await indexDocuments(records, {
      endpoint: "http://localhost:9200",
      username: "admin",
      password: "secret",
      indexPrefix: "codex-test"
    });

    expect(bulkMock).toHaveBeenCalledTimes(1);
    const call = bulkMock.mock.calls[0]?.[0];
    expect(call.body).toHaveLength(4);
    expect(existsMock).toHaveBeenCalled();
    expect(createMock).toHaveBeenCalled();
    expect(metrics.documentsWritten).toBe(2);
  });

  it("エンドポイントなしで失敗", async () => {
    await expect(
      indexDocuments([], {
        endpoint: ""
      })
    ).rejects.toThrow(SearchIndexerError);
  });
});
  it("インデックスが存在する場合は作成しない", async () => {
    existsMock.mockResolvedValueOnce({ body: true });
    const metrics = await indexDocuments(
      [
        { type: "File", id: "file:1" }
      ],
      {
        endpoint: "http://localhost:9200",
        setupIndices: true
      }
    );
    expect(createMock).not.toHaveBeenCalled();
    expect(metrics.indicesCreated).toBe(0);
  });
