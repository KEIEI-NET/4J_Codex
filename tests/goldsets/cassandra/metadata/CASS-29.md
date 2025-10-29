# CASS-29 — 疑似集約による全件スキャン

## Context
利用量レポートを生成するバッチが、`ks.events` から全件読み出してアプリ側で集約している。`LIMIT` を指定しておらず、ピーク時はすべてのパーティションを読み切るため遅延が顕著になる。

## Schema
```sql
CREATE TABLE ks.events (
  tenant_id text,
  user_id uuid,
  ts timestamp,
  payload text,
  PRIMARY KEY ((tenant_id, user_id), ts)
);
```

## Query
```sql
SELECT tenant_id, user_id, ts, payload
FROM ks.events
WHERE tenant_id = ?;
```

## Validation Points
- `limit=null` のため `NO_LIMIT` ルールが発火し、全件読み出しを警告する。

## Remediation
- 事前集約テーブルを用意し、必要な一部のみを取得する。
- `LIMIT` / ページングを導入して段階的に処理する。

## Difficulty
medium
