# CASS-22 — RetryPolicy 誤用による再試行ループ

## Context
`AggressiveRetryPolicy` を採用した設定クラスが、書き込みタイムアウトで自動再試行するように構成されていた。下位層の DAO は `INSERT` を `SimpleStatement` で発行し、`idempotent` を付与していない。

## Schema
```sql
CREATE TABLE ks.orders (
  order_id uuid,
  tenant_id text,
  status text,
  updated_at timestamp,
  PRIMARY KEY ((tenant_id), order_id)
);
```

## Query
```java
session.execute(orderInsertStatement);
// RetryPolicy#onWriteTimeout => RETRY
```

## Validation Points
- `onWriteTimeout=retry` かつ `idempotent=false` の Mutation が存在し、`WRITE_TIMEOUT_RETRY` が発火する。

## Remediation
- `setIdempotent(true)` を指定し、非冪等な UPDATE/INSERT では再試行を停止する。
- タイムアウト発生時は DLQ/手動リトライにフォールバックする。

## Difficulty
medium
