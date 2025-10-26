import { Command } from "commander";
import { existsSync, readFileSync, writeFileSync, createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { resolve, relative } from "node:path";
import { Project, SourceFile, Node, CallExpression } from "ts-morph";

interface InputRecord {
  path: string;
  contents?: string;
}

type LanguageTag = "TypeScript";

interface Fact {
  type: string;
  language: LanguageTag;
  [key: string]: unknown;
}

interface ParseOptions {
  in: string;
  out: string;
  opts?: string;
}

export function createParseCommand(): Command {
  const command = new Command("parse");
  command
    .description("Parse TypeScript sources into Codex Facts (L1 skeleton)")
    .requiredOption("--in <path>", "Path to JSONL file describing input files")
    .requiredOption("--out <path>", "Output path for raw facts JSONL")
    .option("--opts <json>", "Additional options as JSON string")
    .action(async (opts: ParseOptions) => {
      const inputPath = resolve(opts.in);
      const outputPath = resolve(opts.out);

      if (!existsSync(inputPath)) {
        throw new Error(`Input file not found: ${inputPath}`);
      }

      const records = await loadInputRecords(inputPath);
      const facts = analyzeRecords(records);

      const serialized = facts.map((fact) => JSON.stringify(fact)).join("\n");
      writeFileSync(outputPath, `${serialized}\n`, "utf-8");
    });

  return command;
}

async function loadInputRecords(inputPath: string): Promise<InputRecord[]> {
  const records: InputRecord[] = [];
  const rl = createInterface({
    input: createReadStream(inputPath),
    crlfDelay: Number.POSITIVE_INFINITY
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    try {
      const parsed = JSON.parse(trimmed) as InputRecord;
      if (typeof parsed.path === "string") {
        records.push(parsed);
      }
    } catch (error) {
      throw new Error(`Failed to parse JSONL record: ${(error as Error).message}`);
    }
  }

  return records;
}

function analyzeRecords(records: InputRecord[]): Fact[] {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      target: 99, // ES2022
      module: 99
    }
  });

  const facts: Fact[] = [];
  const seenFiles = new Set<string>();

  records.forEach((record) => {
    const absolutePath = resolve(record.path);
    if (seenFiles.has(absolutePath)) {
      return;
    }
    seenFiles.add(absolutePath);

    const sourceText = record.contents ?? readFileSync(absolutePath, "utf-8");
    const sourceFile = project.createSourceFile(absolutePath, sourceText, { overwrite: true });
    const relativePath = relative(process.cwd(), absolutePath) || absolutePath;

    facts.push({
      type: "File",
      language: "TypeScript",
      path: relativePath
    });

    facts.push(...extractImports(sourceFile, relativePath));
    facts.push(...extractSymbols(sourceFile, relativePath));
    facts.push(...extractCalls(sourceFile, relativePath));
  });

  return facts;
}

function extractImports(sourceFile: SourceFile, filePath: string): Fact[] {
  return sourceFile.getImportDeclarations().map((decl) => ({
    type: "Import",
    language: "TypeScript" as LanguageTag,
    file: filePath,
    module: decl.getModuleSpecifierValue(),
    namedBindings: decl.getNamedImports().map((imp) => imp.getName()),
    defaultImport: decl.getDefaultImport()?.getText() ?? null
  }));
}

function extractSymbols(sourceFile: SourceFile, filePath: string): Fact[] {
  const facts: Fact[] = [];

  sourceFile.getFunctions().forEach((fn) => {
    const name = fn.getName();
    if (!name) {
      return;
    }
    facts.push({
      type: "Symbol",
      language: "TypeScript" as LanguageTag,
      file: filePath,
      name,
      kind: "function",
      exported: fn.isExported(),
      async: fn.isAsync(),
      startLine: fn.getNameNode()?.getStartLineNumber()
    });
  });

  sourceFile.getClasses().forEach((cls) => {
    const name = cls.getName();
    if (!name) {
      return;
    }
    facts.push({
      type: "Symbol",
      language: "TypeScript" as LanguageTag,
      file: filePath,
      name,
      kind: "class",
      exported: cls.isExported(),
      startLine: cls.getNameNode()?.getStartLineNumber()
    });
  });

  return facts;
}

function extractCalls(sourceFile: SourceFile, filePath: string): Fact[] {
  const facts: Fact[] = [];

  sourceFile.forEachDescendant((node) => {
    if (Node.isCallExpression(node)) {
      const callFact = toCallFact(node, filePath);
      if (callFact) {
        facts.push(callFact);
      }
    }
  });

  return facts;
}

function toCallFact(node: CallExpression, filePath: string): Fact | null {
  const expression = node.getExpression();
  let callee: string | null = null;
  let receiver: string | null = null;

  if (Node.isIdentifier(expression)) {
    callee = expression.getText();
  } else if (Node.isPropertyAccessExpression(expression)) {
    callee = expression.getText();
    receiver = expression.getExpression().getText();
  } else {
    callee = expression.getText();
  }

  if (!callee) {
    return null;
  }

  const args = node.getArguments().map((arg) => arg.getText());
  return {
    type: "Call",
    language: "TypeScript" as LanguageTag,
    file: filePath,
    callee,
    receiver,
    arguments: args,
    startLine: node.getStartLineNumber()
  };
}
