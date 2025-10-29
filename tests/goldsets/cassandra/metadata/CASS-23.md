# CASS-23 — Idempotent 未指定での自動リトライ

## Context
ユーザプロフィール更新を行う DAO が、RetryPolicy に任せて書き込みを自動再試行していた。更新は `UPDATE` 文で実行され、`idempotent=false` のまま。複数回実行されると二重反映が発生する。

## Schema
```sql
CREATE TABLE ks.user_profile (
  tenant_id text,
  user_id uuid,
  display_name text,
  updated_at timestamp,
  PRIMARY KEY ((tenant_id), user_id)
);
```

## Query
```java
session.execute(updateProfileStatement);
// DefaultRetryPolicy#onWriteTimeout => RETRY
```

## Validation Points
- RetryPolicy が `retry` を返し、対象 Mutation の `idempotent` が `false` であるため `WRITE_TIMEOUT_RETRY` が発火する。

## Remediation
- 書き込みが冪等でない場合は `RetryDecision.rethrow()` を選び、ワークフロー側で再試行を制御する。
- もしくは `UPDATE` を冪等化し `setIdempotent(true)` を明示する。

## Difficulty
medium
