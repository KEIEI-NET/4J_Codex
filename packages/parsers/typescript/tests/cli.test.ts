import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { buildCli } from "../src/cli";

let workdir: string;

beforeEach(() => {
  workdir = join(tmpdir(), `codex-ts-parser-${Date.now()}`);
  mkdirSync(workdir, { recursive: true });
});

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true });
});

test("parse command emits symbol facts", async () => {
  const inPath = join(workdir, "files.jsonl");
  const outPath = join(workdir, "facts.jsonl");
  const tsPath = join(workdir, "sample.ts");
  writeFileSync(
    tsPath,
    "import { helper } from './sample';\nexport function greet(name: string) {\n  console.log(helper(name));\n  return `Hello ${name}`;\n}\n",
    "utf-8"
  );
  writeFileSync(inPath, `${JSON.stringify({ path: tsPath })}\n`, "utf-8");

  const program = buildCli();
  await program.parseAsync(["parse", "--in", inPath, "--out", outPath], {
    from: "user"
  });

  const lines = readFileSync(outPath, "utf-8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));

  const fileFact = lines.find((fact) => fact.type === "File");
  const importFact = lines.find((fact) => fact.type === "Import");
  const symbolFact = lines.find((fact) => fact.type === "Symbol");
  const callFact = lines.find((fact) => fact.type === "Call");

  expect(fileFact?.language).toBe("TypeScript");
  expect(importFact).toMatchObject({
    module: "./sample"
  });
  expect(symbolFact).toMatchObject({
    type: "Symbol",
    language: "TypeScript",
    name: "greet",
    kind: "function",
    exported: true
  });
  expect(callFact).toMatchObject({
    type: "Call",
    callee: "console.log"
  });
});
