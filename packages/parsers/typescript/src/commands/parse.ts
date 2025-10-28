import { Command } from "commander";
import { existsSync, readFileSync, writeFileSync, createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { resolve, relative } from "node:path";
import { createHash } from "node:crypto";
import {
  Project,
  SourceFile,
  Node,
  CallExpression,
  ObjectLiteralExpression,
  Expression,
  ParameterDeclaration,
  SyntaxKind
} from "ts-morph";

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
    facts.push(...extractAngularFacts(sourceFile, relativePath));
    facts.push(...extractCassandraFacts(sourceFile, relativePath));
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

    cls.getMethods().forEach((method) => {
      const methodName = method.getName();
      if (!methodName) {
        return;
      }
      const fqName = `${name}#${methodName}`;
      facts.push({
        type: "Symbol",
        language: "TypeScript" as LanguageTag,
        file: filePath,
        name: methodName,
        kind: "method",
        fqname: fqName,
        id: `sym:${fqName}`,
        exported: cls.isExported() || method.hasModifier(SyntaxKind.ExportKeyword),
        async: method.isAsync(),
        startLine: method.getNameNode()?.getStartLineNumber()
      });
    });
  });

  return facts;
}

const ANGULAR_CLASS_DECORATORS = new Set([
  "Component",
  "Directive",
  "Injectable",
  "Pipe",
  "NgModule"
]);

function extractAngularFacts(sourceFile: SourceFile, filePath: string): Fact[] {
  const facts: Fact[] = [];

  sourceFile.getClasses().forEach((cls) => {
    const className = cls.getName();
    if (!className) {
      return;
    }

    const decorators = cls.getDecorators();
    const decoratorNames = decorators.map((decorator) => decorator.getName());
    const hasAngularDecorator = decoratorNames.some((name) =>
      ANGULAR_CLASS_DECORATORS.has(name)
    );
    const httpClientProperties = new Set<string>();

    decorators.forEach((decorator) => {
      const decoratorName = decorator.getName();
      if (!ANGULAR_CLASS_DECORATORS.has(decoratorName)) {
        return;
      }

      const fact: Fact = {
        type: "AngularSymbol",
        language: "TypeScript" as LanguageTag,
        file: filePath,
        className,
        decorator: decoratorName,
        startLine: cls.getNameNode()?.getStartLineNumber() ?? null
      };

      const arg = decorator.getArguments()[0];
      if (arg && Node.isObjectLiteralExpression(arg)) {
        const selector = extractObjectPropertyText(arg, "selector");
        if (selector !== null) {
          (fact as any).selector = selector;
        }
        const providedIn = extractObjectPropertyText(arg, "providedIn");
        if (providedIn !== null) {
          (fact as any).providedIn = providedIn;
        }
        const standalone = extractBooleanProperty(arg, "standalone");
        if (standalone !== null) {
          (fact as any).standalone = standalone;
        }
        if (decoratorName === "Component" || decoratorName === "Directive") {
          const templateUrl = extractObjectPropertyText(arg, "templateUrl");
          if (templateUrl !== null) {
            (fact as any).templateUrl = templateUrl;
          }
        }
        if (decoratorName === "Pipe") {
          const pipeName = extractObjectPropertyText(arg, "name");
          if (pipeName !== null) {
            (fact as any).pipeName = pipeName;
          }
        }
        if (decoratorName === "NgModule") {
          const providers = extractObjectArrayText(arg, "providers");
          if (providers.length > 0) {
            (fact as any).providers = providers;
          }
          const declarations = extractObjectArrayText(arg, "declarations");
          if (declarations.length > 0) {
            (fact as any).declarations = declarations;
          }
          const imports = extractObjectArrayText(arg, "imports");
          if (imports.length > 0) {
            (fact as any).imports = imports;
          }
          const exportsValues = extractObjectArrayText(arg, "exports");
          if (exportsValues.length > 0) {
            (fact as any).exports = exportsValues;
          }
        }
      }

      facts.push(fact);
    });

    if (hasAngularDecorator) {
      cls.getConstructors().forEach((ctor) => {
        ctor.getParameters().forEach((param) => {
          const token = resolveInjectionToken(param);
          if (!token) {
            return;
          }
          const decoratorsNames = param.getDecorators().map((dec) => dec.getName());
          facts.push({
            type: "AngularInjection",
            language: "TypeScript" as LanguageTag,
            file: filePath,
            className,
            parameter: param.getName(),
            token,
            optional: param.hasQuestionToken() || param.hasInitializer(),
            decorators: decoratorsNames,
            startLine: param.getStartLineNumber()
          });
          if (isHttpClientToken(token)) {
            const propName = param.getName();
            if (propName) {
              httpClientProperties.add(propName);
            }
          }
        });
      });
    }

    if (httpClientProperties.size > 0) {
      facts.push(
        ...collectHttpClientCalls(cls, filePath, className, httpClientProperties)
      );
    }
  });

  facts.push(...collectRouterFacts(sourceFile, filePath));

  return facts;
}

function extractObjectPropertyText(obj: ObjectLiteralExpression, name: string): string | null {
  const property = obj.getProperty(name);
  if (!property) {
    return null;
  }
  if (Node.isPropertyAssignment(property)) {
    const initializer = property.getInitializer();
    if (!initializer) {
      return null;
    }
    return extractExpressionText(initializer);
  }
  if (Node.isShorthandPropertyAssignment(property)) {
    return property.getName();
  }
  if (Node.isMethodDeclaration(property)) {
    return property.getName();
  }
  return null;
}

function extractBooleanProperty(obj: ObjectLiteralExpression, name: string): boolean | null {
  const text = extractObjectPropertyText(obj, name);
  if (text === "true") {
    return true;
  }
  if (text === "false") {
    return false;
  }
  return null;
}

function extractObjectArrayText(obj: ObjectLiteralExpression, name: string): string[] {
  const property = obj.getProperty(name);
  if (!property || !Node.isPropertyAssignment(property)) {
    return [];
  }
  const initializer = property.getInitializer();
  if (!initializer) {
    return [];
  }
  if (Node.isArrayLiteralExpression(initializer)) {
    return initializer
      .getElements()
      .map((element) => extractExpressionText(element))
      .filter((text): text is string => text !== null && text.length > 0);
  }
  return [];
}

function extractExpressionText(expression: Expression): string | null {
  if (Node.isStringLiteral(expression) || Node.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.getLiteralText();
  }
  if (Node.isIdentifier(expression) || Node.isPropertyAccessExpression(expression)) {
    return expression.getText();
  }
  if (Node.isArrowFunction(expression) || Node.isCallExpression(expression) || Node.isFunctionExpression(expression)) {
    return expression.getText();
  }
  return expression.getText();
}

function resolveInjectionToken(param: ParameterDeclaration): string | null {
  const injectDecorator = param.getDecorator("Inject");
  if (injectDecorator) {
    const arg = injectDecorator.getArguments()[0];
    if (arg) {
      const text = extractExpressionText(arg as Expression);
      if (text) {
        return text;
      }
    }
  }
  const typeNode = param.getTypeNode();
  if (typeNode) {
    const typeText = typeNode.getText();
    if (typeText) {
      return typeText;
    }
  }
  return null;
}

function isHttpClientToken(token: string): boolean {
  const normalized = token.trim();
  if (!normalized) {
    return false;
  }
  return (
    normalized === "HttpClient" ||
    normalized.endsWith(".HttpClient") ||
    normalized.startsWith("HttpClient<") ||
    normalized === "HttpTestingController"
  );
}

function collectHttpClientCalls(
  cls: import("ts-morph").ClassDeclaration,
  filePath: string,
  className: string,
  httpClientProperties: Set<string>
): Fact[] {
  const httpFacts: Fact[] = [];
  if (httpClientProperties.size === 0) {
    return httpFacts;
  }

  const httpMethods = new Set([
    "get",
    "post",
    "put",
    "patch",
    "delete",
    "head",
    "options",
    "request"
  ]);

  cls.forEachDescendant((node) => {
    if (!Node.isCallExpression(node)) {
      return;
    }
    const expression = node.getExpression();
    if (!Node.isPropertyAccessExpression(expression)) {
      return;
    }
    const methodName = expression.getName();
    if (!httpMethods.has(methodName)) {
      return;
    }

    const accessExpr = expression.getExpression();
    let propertyName: string | null = null;
    if (Node.isPropertyAccessExpression(accessExpr)) {
      const inner = accessExpr.getExpression();
      if (Node.isThisExpression(inner)) {
        propertyName = accessExpr.getName();
      }
    } else if (Node.isIdentifier(accessExpr)) {
      propertyName = accessExpr.getText();
    }

    if (!propertyName || !httpClientProperties.has(propertyName)) {
      return;
    }

    const urlArg = node.getArguments()[0] as Expression | undefined;
    const url = urlArg ? extractExpressionText(urlArg) : null;
    const ownerMethod = node.getFirstAncestorByKind(SyntaxKind.MethodDeclaration);
    const ownerName = ownerMethod?.getName() ?? null;

    httpFacts.push({
      type: "HttpCall",
      language: "TypeScript" as LanguageTag,
      file: filePath,
      className,
      property: propertyName,
      httpMethod: methodName.toUpperCase(),
      url,
      owner: ownerName,
      rel: "CALLS_HTTP",
      startLine: node.getStartLineNumber()
    });
  });

  return httpFacts;
}

const CASSANDRA_METHODS = new Set(["execute", "batch", "eachRow", "stream", "prepare"]);

interface CassandraImportInfo {
  hasImport: boolean;
  namespaceAliases: Set<string>;
  clientIdentifiers: Set<string>;
}

function extractCassandraFacts(sourceFile: SourceFile, filePath: string): Fact[] {
  const importInfo = gatherCassandraImportInfo(sourceFile);
  if (!importInfo.hasImport) {
    return [];
  }

  const clientVariables = new Set<string>();
  const propertyClientNames = new Set<string>();
  const normalizedFilePath = normalizeFsPath(filePath);
  const fileId = `file:${normalizedFilePath}`;

  sourceFile.getVariableDeclarations().forEach((decl) => {
    const initializer = decl.getInitializer();
    if (!initializer || !Node.isNewExpression(initializer)) {
      return;
    }
    if (isCassandraClientConstruction(initializer, importInfo)) {
      clientVariables.add(decl.getName());
    }
  });

  sourceFile.forEachDescendant((node) => {
    if (!Node.isBinaryExpression(node)) {
      return;
    }
    if (node.getOperatorToken().getText() !== "=") {
      return;
    }
    const left = node.getLeft();
    const right = node.getRight();
    if (!Node.isPropertyAccessExpression(left) || !Node.isNewExpression(right)) {
      return;
    }
    const leftObject = left.getExpression();
    if (!Node.isThisExpression(leftObject)) {
      return;
    }
    const expr = right.getExpression();
    if (isCassandraClientConstruction(right, importInfo)) {
      propertyClientNames.add(left.getName());
    }
  });

  sourceFile.getClasses().forEach((cls) => {
    cls.getConstructors().forEach((ctor) => {
      ctor.getParameters().forEach((param) => {
        const typeNode = param.getTypeNode();
        if (!typeNode) {
          return;
        }
        const typeText = typeNode.getText();
        if (!isCassandraClientType(typeText, importInfo)) {
          return;
        }
        if (param.isParameterProperty()) {
          propertyClientNames.add(param.getName());
        }
      });
    });
  });

  const facts: Fact[] = [];

  sourceFile.forEachDescendant((node) => {
    if (!Node.isCallExpression(node)) {
      return;
    }
    const expression = node.getExpression();
    if (!Node.isPropertyAccessExpression(expression)) {
      return;
    }
    const method = expression.getName();
    if (!CASSANDRA_METHODS.has(method)) {
      return;
    }

    const receiver = expression.getExpression();
    let matches = false;
    if (Node.isIdentifier(receiver)) {
      const identifierName = receiver.getText();
      matches = clientVariables.has(identifierName);
      if (!matches && isCassandraClientIdentifier(receiver, importInfo)) {
        matches = true;
        clientVariables.add(identifierName);
      }
    } else if (Node.isPropertyAccessExpression(receiver)) {
      const inner = receiver.getExpression();
      if (Node.isThisExpression(inner)) {
        matches = propertyClientNames.has(receiver.getName());
      } else if (Node.isIdentifier(inner) && importInfo.namespaceAliases.has(inner.getText())) {
        // e.g., cassandraClient.Client
        matches = receiver.getName() === "Client";
      }
    }
    if (!matches) {
      return;
    }

    const firstArg = node.getArguments()[0];
    let raw: string | null = null;
    if (method === "batch" && firstArg && Node.isArrayLiteralExpression(firstArg)) {
      const collected = firstArg
        .getElements()
        .map((element) => {
          if (Node.isObjectLiteralExpression(element)) {
            return extractObjectPropertyText(element, "query");
          }
          return extractExpressionText(element as Expression);
        })
        .filter((text): text is string => Boolean(text));
      if (collected.length > 0) {
        raw = collected.join("; ");
      }
    } else if (firstArg) {
      raw = extractExpressionText(firstArg as Expression);
    }

    let op: string | null = null;
    if (raw) {
      const match = raw.trim().match(/^(\w+)/i);
      if (match) {
        op = match[1].toUpperCase();
      }
    }

    let prepared = false;
    for (const arg of node.getArguments()) {
      if (!Node.isObjectLiteralExpression(arg)) {
        continue;
      }
      const prepareValue = extractObjectPropertyText(arg, "prepare");
      if (prepareValue === "true") {
        prepared = true;
        break;
      }
    }

    const dbqId = buildDbQueryId({
      raw,
      filePath: normalizedFilePath,
      method,
      startLine: node.getStartLineNumber()
    });

    facts.push({
      type: "DBQuery",
      id: dbqId,
      language: "TypeScript" as LanguageTag,
      file: normalizedFilePath,
      driver: "cassandra",
      method,
      raw,
      op,
      prepared,
      batch: method === "batch",
      startLine: node.getStartLineNumber()
    });

    facts.push({
      type: "Rel",
      rel: "EXECUTES_DB_QUERY",
      from: fileId,
      to: dbqId,
      file: normalizedFilePath,
      method,
      driver: "cassandra",
      startLine: node.getStartLineNumber()
    });
  });

  return facts;
}

function gatherCassandraImportInfo(sourceFile: SourceFile): CassandraImportInfo {
  const namespaceAliases = new Set<string>();
  const clientIdentifiers = new Set<string>();
  let hasImport = false;

  sourceFile.getImportDeclarations().forEach((decl) => {
    if (decl.getModuleSpecifierValue() !== "cassandra-driver") {
      return;
    }
    hasImport = true;
    const namespace = decl.getNamespaceImport();
    if (namespace) {
      namespaceAliases.add(namespace.getText());
    }
    const defaultImport = decl.getDefaultImport();
    if (defaultImport) {
      namespaceAliases.add(defaultImport.getText());
    }
    decl.getNamedImports().forEach((named) => {
      const imported = named.getName();
      const local = named.getAliasNode()?.getText() ?? imported;
      if (imported === "Client") {
        clientIdentifiers.add(local);
      }
    });
  });

  return { hasImport, namespaceAliases, clientIdentifiers };
}

function isCassandraClientType(typeText: string, info: CassandraImportInfo): boolean {
  if (info.clientIdentifiers.has(typeText)) {
    return true;
  }
  if (info.namespaceAliases.size > 0) {
    for (const alias of info.namespaceAliases) {
      if (typeText === `${alias}.Client`) {
        return true;
      }
    }
  }
  return false;
}

function isCassandraClientConstruction(
  newExpression: import("ts-morph").NewExpression,
  info: CassandraImportInfo
): boolean {
  const expression = newExpression.getExpression();
  if (Node.isIdentifier(expression) && info.clientIdentifiers.has(expression.getText())) {
    return true;
  }
  if (Node.isPropertyAccessExpression(expression)) {
    const qualifier = expression.getExpression().getText();
    if (info.namespaceAliases.has(qualifier) && expression.getName() === "Client") {
      return true;
    }
  }
  return false;
}

function isCassandraClientIdentifier(
  identifier: import("ts-morph").Identifier,
  info: CassandraImportInfo
): boolean {
  const symbol = identifier.getSymbol();
  if (!symbol) {
    return false;
  }
  const declarations = symbol.getDeclarations();
  for (const decl of declarations ?? []) {
    if (Node.isVariableDeclaration(decl)) {
      const initializer = decl.getInitializer();
      if (initializer && Node.isNewExpression(initializer) && isCassandraClientConstruction(initializer, info)) {
        return true;
      }
    }
    if (Node.isParameterDeclaration(decl)) {
      const typeNode = decl.getTypeNode();
      if (typeNode && isCassandraClientType(typeNode.getText(), info)) {
        return true;
      }
    }
  }
  return false;
}

function buildDbQueryId(input: {
  raw: string | null;
  filePath: string;
  method: string;
  startLine: number;
}): string {
  const hash = createHash("sha256");
  hash.update(input.filePath);
  hash.update("|");
  hash.update(input.method);
  hash.update("|");
  hash.update(String(input.startLine ?? ""));
  hash.update("|");
  hash.update(input.raw ?? "");
  return `dbq:${hash.digest("hex").slice(0, 32)}`;
}

function normalizeFsPath(value: string): string {
  return value.replace(/\\/g, "/");
}

function collectRouterFacts(sourceFile: SourceFile, filePath: string): Fact[] {
  const routeFacts: Fact[] = [];

  sourceFile.forEachDescendant((node) => {
    if (!Node.isCallExpression(node)) {
      return;
    }
    const expression = node.getExpression();
    if (!Node.isPropertyAccessExpression(expression)) {
      return;
    }
    const method = expression.getName();
    if (method !== "forRoot" && method !== "forChild") {
      return;
    }
    const receiver = expression.getExpression().getText();
    if (receiver !== "RouterModule") {
      return;
    }
    const routesArg = node.getArguments()[0];
    if (!routesArg) {
      return;
    }
    const routeObjects = resolveRouteObjects(routesArg as Expression, sourceFile);
    routeObjects.forEach((routeObj) => {
      const path = extractObjectPropertyText(routeObj, "path");
      const component = extractObjectPropertyText(routeObj, "component");
      const loadChildren = extractObjectPropertyText(routeObj, "loadChildren");
      const redirectTo = extractObjectPropertyText(routeObj, "redirectTo");
      const outlet = extractObjectPropertyText(routeObj, "outlet");
      const pathMatch = extractObjectPropertyText(routeObj, "pathMatch");

      routeFacts.push({
        type: "AngularRoute",
        language: "TypeScript" as LanguageTag,
        file: filePath,
        method,
        path,
        component,
        loadChildren,
        redirectTo,
        outlet,
        pathMatch,
        startLine: routeObj.getStartLineNumber()
      });
    });
  });

  return routeFacts;
}

function resolveRouteObjects(expression: Expression, sourceFile: SourceFile): ObjectLiteralExpression[] {
  if (Node.isArrayLiteralExpression(expression)) {
    return expression
      .getElements()
      .filter((element): element is ObjectLiteralExpression => Node.isObjectLiteralExpression(element));
  }

  if (Node.isIdentifier(expression)) {
    const symbol = expression.getSymbol();
    const declarations = symbol?.getDeclarations() ?? [];
    const objects: ObjectLiteralExpression[] = [];
    declarations.forEach((decl) => {
      if (Node.isVariableDeclaration(decl)) {
        const initializer = decl.getInitializer();
        if (initializer) {
          objects.push(...resolveRouteObjects(initializer as Expression, sourceFile));
        }
      }
    });
    if (objects.length > 0) {
      return objects;
    }
  }

  return [];
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
