# Cassandra Goldset Fixtures

This directory hosts the Cassandra-specific goldset used by the rules-engine regression suite.

- `fixtures/` contains JSONL fixtures produced by the scanner/normalizer pipeline.
  - `<case-id>_facts.jsonl` captures pre-normalized Facts.
  - `<case-id>_rulehits.jsonl` lists the expected RuleHit records.
  - `<case-id>_ir.jsonl` is optional and stores normalized IR output when comparison is required.
- `schemas/` contains JSON Schema documents for validating the JSONL records.
- `metadata/` holds Markdown case descriptions (query context, schema, validation notes, remediation ideas).

Each JSONL record must include a `caseId` (e.g. `CASS-01`) to support targeted test runs.

## Seed Cases

- `CASS-01` — `ALLOW FILTERING` による全件スキャンとパーティションキー欠如
- `CASS-02` — `LIMIT`/Paging 未設定
- `CASS-03` — 読み書き Consistency Level の不整合
- `CASS-04` — LWT と通常書き込みが混在するバッチ
- `CASS-05` — PreparedStatement 未利用の繰り返し実行
- `CASS-06` — Secondary Index + `ALLOW FILTERING` + `LIKE` の複合悪手
- `CASS-07` — 大規模 DELETE による Tombstone 嵐
- `CASS-08` — クラスタリング順序と逆向き `ORDER BY`
- `CASS-09` — WriteTimeout を無制限リトライするカスタム RetryPolicy
- `CASS-10` — Driver タイムアウト未設定によるハング
- `CASS-11` — 単一パーティションに書き込みが集中するホットスポット
- `CASS-12` — `IN` 句に大量の値を指定しファンアウト発生
- `CASS-13` — QueryBuilder での `allowFiltering()` 乱用
- `CASS-14` — 二次索引を用いたクエリで LIMIT/Paging を欠落
- `CASS-15` — LWT を高頻度で連続実行するホットパス
- `CASS-16` — Materialized View 未整備による疑似 JOIN
- `CASS-17` — Read Repair 負荷を招く古い Consistency 設定
- `CASS-18` — `ALLOW FILTERING` + 二次索引 + `LIKE` の三重悪手
- `CASS-19` — TWCS とランダムアクセスのミスマッチ
- `CASS-20` — 巨大パーティションでの逆順 `ORDER BY`

メタデータは `metadata/`、Facts/RuleHit は `fixtures/` 下の JSONL で管理している。
