# CASS-21 — Driver 側タイムアウト未設定

## Context
夜間バッチで大量の Export キューを読み取る DAO が、ドライバの読み込みタイムアウトを明示せずに実行していた。高負荷時にハングし、キューが滞留する事象が多発している。

## Schema
```sql
CREATE TABLE ks.export_queue (
  tenant_id text,
  job_id uuid,
  payload text,
  created_at timestamp,
  PRIMARY KEY ((tenant_id), created_at)
);
```

## Query
```sql
SELECT * FROM ks.export_queue
WHERE tenant_id = ?;
```

## Validation Points
- `timeoutMillis` が `null` のまま実行され、`NO_TIMEOUT` ルールで検知される。

## Remediation
- `setReadTimeoutMillis` などを介して 5000ms 程度のタイムアウトを設定する。
- 適切な `LIMIT` / ページングを併用し、長時間のストリーム読み出しを避ける。

## Difficulty
low
