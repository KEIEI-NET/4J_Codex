# CASS-01 — ALLOW FILTERING とパーティションキー欠如

## Context
社内監視サービスの `UserEventDao` で特定イベントを抽出するために全件読みを多用していた。  
`ALLOW FILTERING` を付与したまま、テナント境界となる `tenant_id` と `user_id` を指定せずに検索している。

## Schema
```sql
CREATE TABLE ks.events (
  tenant_id text,
  user_id text,
  kind text,
  ts timestamp,
  payload text,
  PRIMARY KEY ((tenant_id, user_id), kind, ts)
);
```

## Query
```sql
SELECT * FROM ks.events WHERE kind='login' ALLOW FILTERING;
```

## Validation Points
- パーティションキー未指定で全テナントをフルスキャンする。
- `ALLOW FILTERING` により coordinator ノードでのフィルタが発生し高負荷。
- 期待する RuleHit: `ALLOW_FILTERING`, `MISSING_PK`

## Remediation
- 個別テナントとユーザを明示的に指定 (`WHERE tenant_id=? AND user_id=?`).
- `ALLOW FILTERING` を除去し絞り込みをパーティションキーに合わせる。
- 返却件数を制御するため `LIMIT` を併用。

## Difficulty
medium
