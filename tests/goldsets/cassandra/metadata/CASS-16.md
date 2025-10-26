# CASS-16 — Materialized View 未使用による疑似 JOIN

## Context
注文履歴のレポート API が、`orders` テーブルから状態別に絞り込むために巨大なパーティションを全走査し、  
アプリケーション側で JOIN 相当の処理を行っている。Materialized View を用意すれば 1 パーティションで済むが未整備。

## Schema
```sql
CREATE TABLE ks.orders (
  tenant_id text,
  order_id text,
  status text,
  updated_at timestamp,
  payload text,
  PRIMARY KEY ((tenant_id), order_id)
);
```

## Query
```sql
SELECT order_id, status, updated_at
FROM ks.orders
WHERE tenant_id = ?
  AND updated_at > ?
ALLOW FILTERING;
```

## Validation Points
- JOIN 風に大量レコードを取得しており、Materialized View を利用すべき。
- 期待する RuleHit: `MV_MISSING`

## Remediation
- `PRIMARY KEY ((tenant_id, status), updated_at)` の Materialized View を追加して絞り込みを最適化。
- または派生テーブルを作成し、状態別の参照を高速化。

## Difficulty
medium
