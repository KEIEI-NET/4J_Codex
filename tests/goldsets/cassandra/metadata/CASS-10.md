# CASS-10 — Driver タイムアウト未設定

## Context
夜間バッチで長時間実行される照会を実装したが、ドライバ側の read timeout を明示的に設定していない。  
トラフィックが集中した際に、待機中のリクエストが延々ハングし、投入側ジョブが停止しない問題が発生した。

## Schema
```sql
CREATE TABLE ks.job_logs (
  job_id text,
  step text,
  started_at timestamp,
  finished_at timestamp,
  status text,
  PRIMARY KEY ((job_id), step)
);
```

## Query / Code
```java
Statement stmt = QueryBuilder.select().all()
  .from("ks", "job_logs")
  .where(eq("job_id", jobId));

// タイムアウトやページサイズの設定が無いまま実行
session.execute(stmt);
```

## Validation Points
- `Statement#setReadTimeoutMillis` や Driver 設定でタイムアウトを設定していない。
- 長時間ブロッキングによりアプリケーション全体のスループットが落ちる。
- 期待する RuleHit: `NO_TIMEOUT`

## Remediation
- Driver 設定 (`withReadTimeoutMillis`) や per-statement 設定でタイムアウトを明示する。
- タイムアウト時のリトライ方針を決めて、監視アラートを整備する。
- バッチ処理の粒度を小さくし、フェイルセーフにリカバリできる構成にする。

## Difficulty
medium
