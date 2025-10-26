# CASS-05 — PreparedStatement 未利用の繰り返し実行

## Context
定期バッチでレポート用データを集計する際に、同じ CQL を日次で数十万回 `SimpleStatement` として生成していた。  
クエリ解析のオーバーヘッドが高く、サーバ側の `prepare` キャッシュミスも頻発していた。

## Schema
```sql
CREATE TABLE ks.daily_metrics (
  metric_date date,
  metric_id text,
  value double,
  PRIMARY KEY ((metric_date), metric_id)
);
```

## Query
```java
for (MetricRow row : rows) {
  SimpleStatement stmt = SimpleStatement.builder(
      "UPDATE ks.daily_metrics SET value = ? WHERE metric_date = ? AND metric_id = ?")
    .addPositionalValues(row.value(), row.metricDate(), row.metricId())
    .build();
  session.execute(stmt);
}
```

## Validation Points
- 同一クエリを都度 `SimpleStatement` として投げており、Prepare/Bind を活用していない。
- 期待する RuleHit: `MISSING_PREPARE`

## Remediation
- アプリ起動時に `PreparedStatement` を作成し、ループ内では `BoundStatement` を再利用する。
- バッチアップデートが必要な場合は `BatchStatementBuilder` と `PreparedStatement` を組み合わせる。

## Difficulty
low
