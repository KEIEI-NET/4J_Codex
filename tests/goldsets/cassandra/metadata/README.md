# Metadata Authoring Guide

Create one Markdown file per case (`CASS-01.md`, etc.) and capture:

1. **Context** — Summary of the code path or repo snippet that produced the case.
2. **Schema** — Relevant table/keyspace definitions or lightweight ERD pointers.
3. **Query** — The CQL or DAO fragment that triggers the rule hit.
4. **Validation Points** — What behaviour the rule under test should flag.
5. **Remediation** — Suggested fixes or best-practices.
6. **Difficulty** — Optional `low`/`medium`/`high` estimate for triage.

Keep snippets short and cite the upstream source if the sample was extracted from OSS.
