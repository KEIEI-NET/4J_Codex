# CASS-09 — RetryPolicy で WriteTimeout を無制限リトライ

## Context
バッチ書き込みの信頼性を高めるためにカスタム `RetryPolicy` を導入したが、  
`onWriteTimeout` で常に `RetryDecision.retry(null, ConsistencyLevel.ONE)` を返す設定にしてしまった。  
非 idempotent な更新が重複実行され、データ不整合が発生した。

## Schema
```sql
CREATE TABLE ks.user_balance (
  tenant_id text,
  user_id text,
  balance decimal,
  updated_at timestamp,
  PRIMARY KEY ((tenant_id), user_id)
);
```

## Query / Code
```java
class AggressiveRetryPolicy implements RetryPolicy {
  @Override
  public RetryDecision onWriteTimeout(Statement stmt, ConsistencyLevel cl,
      WriteType type, int requiredAcks, int receivedAcks, int retryCount) {
    return RetryDecision.retry(cl); // 常に再試行
  }
}

clusterBuilder.withRetryPolicy(new AggressiveRetryPolicy());
```

## Validation Points
- WriteTimeout をリトライし続けるため、冪等でない更新が重複する。
- 期待する RuleHit: `WRITE_TIMEOUT_RETRY`

## Remediation
- 非冪等更新では Retry を避け、アプリケーションレベルで補正処理を行う。
- idempotent 指定 (`setIdempotent(true)`) と組み合わせた安全なポリシーにする。
- ドライバ標準の `DefaultRetryPolicy` や `IdempotenceAwareRetryPolicy` を検討する。

## Difficulty
high
