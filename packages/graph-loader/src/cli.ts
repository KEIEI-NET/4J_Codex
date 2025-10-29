#!/usr/bin/env node
import minimist from "minimist";
import {
  exportGraphToCsv,
  loadGraphToNeo4j,
  readGraphRecords,
  summarizeGraphRecords,
  GraphLoaderError
} from "./loader.js";

interface CliArgs {
  _: string[];
  in?: string;
  pretty?: boolean;
  dryRun?: boolean;
  neo4jUri?: string;
  neo4jUser?: string;
  neo4jPassword?: string;
  neo4jDatabase?: string;
  batchSize?: number;
  outCsv?: string;
  [key: string]: unknown;
}

async function run(argv: string[]) {
  const args = minimist(argv, {
    string: ["in", "neo4j-uri", "neo4j-user", "neo4j-password", "neo4j-database", "out-csv"],
    boolean: ["dry-run", "pretty"],
    alias: {
      in: "i",
      pretty: "p",
      "dry-run": "dryRun",
      "neo4j-uri": "neo4jUri",
      "neo4j-user": "neo4jUser",
      "neo4j-password": "neo4jPassword",
      "neo4j-database": "neo4jDatabase"
    },
    default: {
      "dry-run": true
    }
  }) as CliArgs;

  if (!args.in) {
    console.error("[error] --in <path> を指定してください。");
    process.exitCode = 1;
    return;
  }

  try {
    const records = readGraphRecords(args.in);
    const summary = summarizeGraphRecords(records);
    console.log(
      `[info] ${summary.totalRecords} レコード (ノード ${summary.nodeRecords}, リレーション ${summary.relRecords}) を解析しました。`
    );
    if (args.pretty) {
      console.log(JSON.stringify(summary, null, 2));
    }

    if (typeof args["out-csv"] === "string") {
      const { nodesPath, relsPath } = exportGraphToCsv(records, {
        outDir: args["out-csv"],
        includeHeaders: true
      });
      console.log(`[info] CSV exported: ${nodesPath}, ${relsPath}`);
    }

    if (args["dry-run"] === false) {
      const metrics = await loadGraphToNeo4j(records, {
        uri: args.neo4jUri ?? "",
        user: args.neo4jUser ?? "",
        password: args.neo4jPassword ?? "",
        database: args.neo4jDatabase,
        batchSize: typeof args.batchSize === "number" ? args.batchSize : undefined
      });
      console.log(
        `[ok] Neo4j へのロードが完了しました (nodes=${metrics.nodesWritten}, rels=${metrics.relationshipsWritten})。`
      );
    } else {
      console.log("[info] ドライランのため Neo4j への書き込みは実施していません。");
    }
  } catch (error) {
    const message = error instanceof GraphLoaderError ? error.message : (error as Error).message;
    console.error(`[error] ${message}`);
    process.exitCode = 1;
  }
}

run(process.argv.slice(2));
