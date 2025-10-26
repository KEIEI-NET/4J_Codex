import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const schemaPath = path.resolve(
  fileURLToPath(new URL("../../../specs/ir-schema.json", import.meta.url)),
);

export const irSchema = JSON.parse(readFileSync(schemaPath, "utf8")) as Record<
  string,
  unknown
>;
