# CASS-24 — Prepare 漏れによる CPU 負荷

## Context
監査ログを保存するコードが `SimpleStatement` を動的生成し、1 リクエスト毎に同じ CQL を送信していた。トラフィック増加時にサーバ側のパース負荷が跳ね上がり、レイテンシが急増した。

## Schema
```sql
CREATE TABLE ks.audit_logs (
  tenant_id text,
  event_id uuid,
  payload text,
  created_at timestamp,
  PRIMARY KEY ((tenant_id), created_at)
);
```

## Query
```java
session.execute(
  SimpleStatement.builder("INSERT INTO ks.audit_logs (tenant_id, event_id, payload) VALUES (?, ?, ?)")
    .setConsistencyLevel(DefaultConsistencyLevel.LOCAL_QUORUM)
    .build()
);
```

## Validation Points
- `StatementUsage` の `usesPrepared=false` かつ `executions>=120` で `MISSING_PREPARE` が発火する。

## Remediation
- `prepare` + `BoundStatement` を利用してクエリプランを再利用する。
- 予め `Statement` を DI で共有し、リクエスト毎の生成を避ける。

## Difficulty
low
