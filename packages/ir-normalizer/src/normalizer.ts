import { createHash } from "node:crypto";
import { normalizePath } from "./paths.js";
import { validateEntity, ValidationError } from "./validator.js";
import type { IrEntity, NormalizeOptions } from "./types.js";

export function normalizeEntity(
  input: unknown,
  options: NormalizeOptions = {},
): IrEntity {
  if (!input || typeof input !== "object") {
    throw new ValidationError("Input must be an object");
  }
  const entity = { ...(input as Record<string, unknown>) };

  if (entity.type === "HttpCall") {
    const transformed = transformHttpCall(entity);
    const validatedRel = validateEntity(transformed);
    if (options.strict) {
      enforceNamespace(validatedRel);
    }
    return validatedRel;
  }

  switch (entity.type) {
    case "File":
      prepareFile(entity);
      break;
    case "Symbol":
      prepareSymbol(entity);
      break;
    case "Rel":
      prepareRel(entity);
      break;
    case "DBQuery":
      prepareDbQuery(entity);
      break;
    default:
      break;
  }

  const validated = validateEntity(entity);
  if (options.strict) {
    enforceNamespace(validated);
  }
  return validated;
}

function prepareFile(entity: any) {
  if (entity.path) {
    entity.path = normalizePath(String(entity.path));
  }
  if (entity.id && !entity.id.startsWith("file:")) {
    entity.id = `file:${normalizePath(entity.path ?? entity.id)}`;
  }
  if (entity.lang) {
    entity.lang = String(entity.lang).toLowerCase();
  }
}

function prepareSymbol(entity: any) {
  if (entity.annotations && !Array.isArray(entity.annotations)) {
    entity.annotations = [String(entity.annotations)];
  }
  if (entity.tags && !Array.isArray(entity.tags)) {
    entity.tags = [String(entity.tags)];
  }
  if (entity.fileId && !entity.fileId.startsWith("file:")) {
    entity.fileId = `file:${entity.fileId}`;
  }
}

function prepareDbQuery(entity: any) {
  if (entity.raw) {
    entity.raw = String(entity.raw).trim();
  }
  if (entity.file) {
    entity.file = normalizePath(String(entity.file));
  }
  if (!entity.id) {
    entity.id = generateDbQueryId({
      raw: typeof entity.raw === "string" ? entity.raw : "",
      file: typeof entity.file === "string" ? entity.file : undefined,
      method: typeof entity.method === "string" ? entity.method : undefined,
      startLine: typeof entity.startLine === "number" ? entity.startLine : undefined
    });
  }
  if (entity.op) {
    entity.op = String(entity.op).toUpperCase();
  } else if (typeof entity.raw === "string") {
    const match = entity.raw.match(/^(\w+)/i);
    if (match) {
      entity.op = match[1].toUpperCase();
    }
  }
  if (typeof entity.prepared === "string") {
    entity.prepared = entity.prepared === "true";
  }
  if (typeof entity.batch === "string") {
    entity.batch = entity.batch === "true";
  }
}

function prepareRel(entity: any) {
  if (!entity.rel || !entity.from || !entity.to) {
    return;
  }
  if (!entity.id) {
    const seed = `${entity.rel}|${entity.from}|${entity.to}|${entity.httpMethod ?? ""}|${entity.url ?? ""}`;
    entity.id = `rel:${hashString(seed)}`;
  }
}

function transformHttpCall(entity: Record<string, unknown>): Record<string, unknown> {
  const filePath = typeof entity.file === "string" ? normalizePath(entity.file) : undefined;
  const className = typeof entity.className === "string" ? entity.className : undefined;
  const owner = typeof entity.owner === "string" ? entity.owner : undefined;
  const property = typeof entity.property === "string" ? entity.property : undefined;
  const methodCandidate =
    typeof entity.httpMethod === "string"
      ? entity.httpMethod
      : typeof entity.method === "string"
      ? entity.method
      : undefined;
  const httpMethod = methodCandidate ? methodCandidate.toUpperCase() : "REQUEST";
  const url = typeof entity.url === "string" && entity.url.length > 0 ? entity.url : undefined;
  const startLine = typeof entity.startLine === "number" ? entity.startLine : undefined;
  const sourceId = filePath
    ? `file:${filePath}`
    : className
    ? `sym:${className}${owner ? `#${owner}` : ""}`
    : `sym:http#unknown`;
  const targetSeed = [url ?? "", className ?? "", owner ?? "", property ?? "", httpMethod].join("|");
  const targetId = `http:${hashString(targetSeed)}`;

  const rel: Record<string, unknown> = {
    type: "Rel",
    rel: "CALLS_HTTP",
    from: sourceId,
    to: targetId,
    id: `rel:${hashString(`CALLS_HTTP|${sourceId}|${targetId}|${httpMethod}|${url ?? ""}`)}`,
    httpMethod,
    url,
    file: filePath,
    className,
    owner,
    property,
    startLine
  };
  return rel;
}

function generateDbQueryId(input: {
  raw: string;
  file?: string;
  method?: string;
  startLine?: number;
}): string {
  const hash = createHash("sha256");
  if (input.file) {
    hash.update(input.file);
  }
  hash.update("|");
  if (input.method) {
    hash.update(input.method);
  }
  hash.update("|");
  if (typeof input.startLine === "number") {
    hash.update(String(input.startLine));
  }
  hash.update("|");
  hash.update(input.raw ?? "");
  return `dbq:${hash.digest("hex").slice(0, 32)}`;
}

function hashString(value: string): string {
  const hash = createHash("sha256");
  hash.update(value);
  return hash.digest("hex").slice(0, 32);
}

function enforceNamespace(entity: IrEntity) {
  if (
    entity.type === "Symbol" &&
    entity.id.startsWith("sym:") &&
    !entity.id.includes("#")
  ) {
    throw new ValidationError("Symbol id must contain fqname with # separator");
  }
}
