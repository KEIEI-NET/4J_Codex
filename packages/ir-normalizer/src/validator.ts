import Ajv, { ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import { irSchema } from "./schema.js";
import type { IrEntity } from "./types.js";

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const validateFn = ajv.compile<IrEntity>(irSchema as any);

export class ValidationError extends Error {
  constructor(
    message: string,
    readonly errors: ErrorObject[] = [],
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

export function validateEntity(entity: unknown): IrEntity {
  if (validateFn(entity)) {
    return entity;
  }
  throw new ValidationError(
    "IR entity failed validation",
    validateFn.errors ?? [],
  );
}
