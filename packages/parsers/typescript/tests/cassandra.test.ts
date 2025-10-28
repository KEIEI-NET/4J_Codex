import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";

import { buildCli } from "../src/cli";

let workdir: string;

beforeEach(() => {
  workdir = join(tmpdir(), `codex-ts-parser-cassandra-${Date.now()}`);
  mkdirSync(workdir, { recursive: true });
});

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true });
});

test("extracts cassandra-driver DBQuery facts", async () => {
  const repoPath = join(workdir, "user.repo.ts");
  writeFileSync(
    repoPath,
    [
      "import { Client } from 'cassandra-driver';",
      "",
      "export class UserRepository {",
      "  constructor(private client: Client) {}",
      "",
      "  async listUser(id: string) {",
      "    return this.client.execute('SELECT * FROM users WHERE id = ?', [id], { prepare: true });",
      "  }",
      "",
      "  async saveAll(events: Array<{ id: string }>) {",
      "    return this.client.batch(",
      "      events.map((event) => ({",
      "        query: 'INSERT INTO events (id) VALUES (?)',",
      "        params: [event.id]",
      "      })),",
      "      { prepare: true }",
      "    );",
      "  }",
      "}",
      "",
      "export async function runStandalone() {",
      "  const client = new Client({});",
      "  await client.execute('SELECT now() FROM system.local');",
      "}",
      ""
    ].join("\n"),
    "utf-8"
  );

  const inPath = join(workdir, "files.jsonl");
  const outPath = join(workdir, "facts.jsonl");
  writeFileSync(inPath, `${JSON.stringify({ path: repoPath })}\n`, "utf-8");

  const cli = buildCli();
  await cli.parseAsync(["parse", "--in", inPath, "--out", outPath], { from: "user" });

  const facts = readFileSync(outPath, "utf-8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));

  const queries = facts.filter((fact) => fact.type === "DBQuery");
  expect(queries.length).toBeGreaterThanOrEqual(2);

  const selectQuery = queries.find((fact) => fact.method === "execute" && fact.raw?.includes("SELECT * FROM users"));
  expect(selectQuery).toMatchObject({
    driver: "cassandra",
    op: "SELECT",
    prepared: true,
    batch: false
  });

  const batchQuery = queries.find((fact) => fact.method === "batch");
  expect(batchQuery).toBeDefined();
  expect(batchQuery?.prepared).toBe(true);
  expect(batchQuery?.batch).toBe(true);
  expect(batchQuery?.raw).toContain("INSERT INTO events");

  const standaloneQuery = queries.find((fact) => fact.raw === "SELECT now() FROM system.local");
  expect(standaloneQuery).toBeDefined();

  const rels = facts.filter((fact) => fact.type === "Rel" && fact.rel === "EXECUTES_DB_QUERY");
  expect(rels.length).toBeGreaterThanOrEqual(2);
  expect(rels.every((rel) => typeof rel.from === "string" && typeof rel.to === "string")).toBe(true);
});
