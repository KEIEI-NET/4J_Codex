# CASS-28 — 大量 DELETE による Tombstone 嵐

## Context
セッションテーブルを毎日削除するジョブが、5000 件ずつの大きなバッチで `DELETE` を投げている。TTL を使わず直接削除するため、tombstone が急増して GC 負荷が跳ね上がった。

## Schema
```sql
CREATE TABLE ks.user_sessions (
  tenant_id text,
  user_id uuid,
  session_id uuid,
  last_seen timestamp,
  PRIMARY KEY ((tenant_id, user_id), session_id)
);
```

## Query
```sql
DELETE FROM ks.user_sessions
WHERE tenant_id = ?
  AND user_id = ?;
```

## Validation Points
- `tombstoneRisk="high"` の DELETE と大規模バッチ設定が揃うことで `BULK_DELETE_TOMBSTONES` が発火する。

## Remediation
- TTL を設定し自然消滅させる、もしくは小さなバッチに分割する。
- Guardrail として tombstone 生成量のメトリクスを監視する。

## Difficulty
medium
