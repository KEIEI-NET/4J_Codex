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

  switch (entity.type) {
    case "File":
      prepareFile(entity);
      break;
    case "Symbol":
      prepareSymbol(entity);
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
  if (entity.op) {
    entity.op = entity.op.toUpperCase();
  }
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
