import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  GraphLoaderError,
  exportGraphToCsv,
  loadGraphToNeo4j,
  readGraphRecords,
  summarizeGraphInput,
  summarizeGraphRecords
} from "./loader.js";

vi.mock("neo4j-driver", () => {
  const run = vi.fn().mockResolvedValue(undefined);
  const close = vi.fn().mockResolvedValue(undefined);
  const session = {
    run,
    close,
    executeWrite: vi.fn(async (fn: (tx: { run: typeof run }) => Promise<void>) => {
      await fn({ run });
    })
  };
  const driver = {
    session: vi.fn(() => session),
    close
  };
  return {
    default: {
      driver: vi.fn(() => driver),
      auth: {
        basic: vi.fn(() => ({}))
      }
    }
  };
});

const neo4j = await import("neo4j-driver");

const mockedDriver = neo4j.default.driver as unknown as vi.Mock;
const mockedAuthBasic = neo4j.default.auth.basic as unknown as vi.Mock;

describe("summarizeGraphInput", () => {
  it("集計結果を返す", () => {
    const dir = mkdtempSync(join(tmpdir(), "graph-loader-test-"));
    const file = join(dir, "sample.jsonl");
    const lines = [
      { type: "File", id: "file:src/App.java" },
      { type: "Symbol", id: "sym:App#main" },
      { type: "Rel", rel: "CALLS", from: "sym:App#main", to: "sym:Service#do" },
      { type: "Rel", rel: "READS", from: "sym:Service#do", to: "dbq:hash" }
    ];
    writeFileSync(file, lines.map((line) => JSON.stringify(line)).join("\n"), "utf-8");

    const summary = summarizeGraphInput(file);

    expect(summary.totalRecords).toBe(4);
    expect(summary.nodeRecords).toBe(2);
    expect(summary.relRecords).toBe(2);
    expect(summary.typeCounts).toEqual({ File: 1, Symbol: 1, Rel: 2 });
    expect(summary.relCounts).toEqual({ CALLS: 1, READS: 1 });
  });

  it("不正な JSON を検出する", () => {
    const dir = mkdtempSync(join(tmpdir(), "graph-loader-test-"));
    const file = join(dir, "broken.jsonl");
    writeFileSync(file, "{invalid}", "utf-8");

    expect(() => summarizeGraphInput(file)).toThrow(GraphLoaderError);
  });
});

describe("loadGraphToNeo4j", () => {
  beforeEach(() => {
    mockedDriver.mockClear();
    mockedAuthBasic.mockClear();
  });

  it("書き込みステートメントを実行する", async () => {
    const dir = mkdtempSync(join(tmpdir(), "graph-loader-test-"));
    const file = join(dir, "records.jsonl");
    const lines = [
      { type: "File", id: "file:src/App.java", path: "src/App.java" },
      { type: "Rel", rel: "CALLS", from: "sym:A", to: "sym:B", weight: 2 }
    ];
    writeFileSync(file, lines.map((line) => JSON.stringify(line)).join("\n"), "utf-8");

    const records = readGraphRecords(file);
    const summary = summarizeGraphRecords(records);
    expect(summary.totalRecords).toBe(2);

    const metrics = await loadGraphToNeo4j(records, {
      uri: "bolt://localhost:7687",
      user: "neo4j",
      password: "test"
    });

    expect(mockedDriver).toHaveBeenCalledWith(
      "bolt://localhost:7687",
      expect.any(Object)
    );
    const driverInstance = mockedDriver.mock.results[0]?.value as {
      session: vi.Mock;
    };
    expect(driverInstance.session).toHaveBeenCalled();
    const sessionInstance = driverInstance.session.mock.results[0]?.value as {
      executeWrite: vi.Mock;
    };
    expect(sessionInstance.executeWrite).toHaveBeenCalled();
    expect(metrics.nodesWritten).toBeGreaterThan(0);
  });

  it("認証情報が不足しているとエラー", async () => {
    await expect(
      loadGraphToNeo4j([], {
        uri: "bolt://localhost:7687",
        user: "",
        password: ""
      })
    ).rejects.toThrow(GraphLoaderError);
  });

  it("CSV をエクスポートする", () => {
    const dir = mkdtempSync(join(tmpdir(), "graph-loader-test-"));
    const file = join(dir, "records.jsonl");
    const lines = [
      { type: "File", id: "file:src/App.java", path: "src/App.java" },
      { type: "Rel", rel: "CALLS", from: "sym:A", to: "sym:B" }
    ];
    writeFileSync(file, lines.map((line) => JSON.stringify(line)).join("\n"), "utf-8");

    const records = readGraphRecords(file);
    const outDir = join(dir, "csv");
    const { nodesPath, relsPath } = exportGraphToCsv(records, { outDir });

    expect(nodesPath).toContain("nodes.csv");
    expect(relsPath).toContain("relationships.csv");
  });

  it("HTTP リレーションのみでもプレースホルダーノードを生成する", async () => {
    const dir = mkdtempSync(join(tmpdir(), "graph-loader-test-"));
    const file = join(dir, "records.jsonl");
    const lines = [
      {
        type: "Rel",
        rel: "CALLS_HTTP",
        from: "file:src/app.ts",
        to: "http:a1b2",
        url: "/api/users",
        httpMethod: "GET"
      }
    ];
    writeFileSync(file, lines.map((line) => JSON.stringify(line)).join("\n"), "utf-8");

    const records = readGraphRecords(file);
    const metrics = await loadGraphToNeo4j(records, {
      uri: "bolt://localhost:7687",
      user: "neo4j",
      password: "test"
    });

    expect(metrics.nodesWritten).toBeGreaterThanOrEqual(2);

    const outDir = join(dir, "csv");
    const { nodesPath } = exportGraphToCsv(records, { outDir });
    const nodesCsv = readFileSync(nodesPath, "utf-8").trim().split("\n").slice(1);
    expect(nodesCsv.some((line) => line.includes("http:a1b2"))).toBe(true);
  });
});
