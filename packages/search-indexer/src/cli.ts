#!/usr/bin/env node
import minimist from "minimist";
import {
  SearchIndexerError,
  indexDocuments,
  readIndexRecords,
  summarizeIndexRecords
} from "./indexer.js";

interface CliArgs {
  _: string[];
  in?: string;
  dryRun?: boolean;
  pretty?: boolean;
  endpoint?: string;
  username?: string;
  password?: string;
  indexPrefix?: string;
  refresh?: boolean;
  setupIndices?: boolean;
  [key: string]: unknown;
}

async function run(argv: string[]) {
  const args = minimist(argv, {
    string: ["in", "endpoint", "username", "password", "index-prefix"],
    boolean: ["dry-run", "pretty", "refresh", "setup-indices"],
    alias: {
      in: "i",
      endpoint: "e",
      username: "u",
      password: "p",
      "index-prefix": "indexPrefix",
      "dry-run": "dryRun",
      "setup-indices": "setupIndices"
    },
    default: {
      "dry-run": true,
      refresh: true,
      "setup-indices": true
    }
  }) as CliArgs;

  if (!args.in) {
    console.error("[error] --in <path> を指定してください。");
    process.exitCode = 1;
    return;
  }

  try {
    const records = readIndexRecords(args.in);
    const summary = summarizeIndexRecords(records);
    console.log(`[info] ${summary.totalRecords} 件のドキュメントを解析しました。`);
    if (args.pretty) {
      console.log(JSON.stringify(summary, null, 2));
    }

    if (args["dry-run"] === false) {
      const metrics = await indexDocuments(records, {
        endpoint: args.endpoint ?? "",
        username: args.username,
        password: args.password,
        indexPrefix: args.indexPrefix,
        refresh: args.refresh,
        setupIndices: args.setupIndices
      });
      console.log(
        `[ok] OpenSearch へのインデクシングが完了しました (docs=${metrics.documentsWritten}, indices=${metrics.indicesTouched}, created=${metrics.indicesCreated})。`
      );
    } else {
      console.log("[info] ドライランのため OpenSearch への書き込みは実施していません。");
    }
  } catch (error) {
    const message = error instanceof SearchIndexerError ? error.message : (error as Error).message;
    console.error(`[error] ${message}`);
    process.exitCode = 1;
  }
}

run(process.argv.slice(2));
