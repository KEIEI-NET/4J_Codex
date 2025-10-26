# Codex IR Normalizer (Skeleton)

This package consumes raw facts JSONL (emitted by language parsers) and normalizes them against the shared IR schema.

Capabilities in this L0 scaffold:

- JSON Schema validation using Ajv (`specs/ir-schema.json`).
- Namespace and path normalization (`file:*`, forward-slash paths, DB op casing).
- CLI contract: `ir-normalizer normalize --in facts.raw.jsonl --out ir.jsonl [--strict]`.
- Vitest unit coverage for representative normalization rules.

Next steps include enriching normalization (UNRESOLVED rel handling, fan-in/out metrics synthesis) and adding golden IR fixtures.

