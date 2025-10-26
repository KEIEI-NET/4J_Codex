# CASS-13 — QueryBuilder 由来の ALLOW FILTERING

## Context
サービス層で DataStax Java Driver の `QueryBuilder` を利用しており、  
フィルタ条件を動的に組み立てる過程で `allowFiltering()` 呼び出しが残ってしまった。  
PK を完全には押さえておらず、本番環境で `ALLOW FILTERING` が実行されている。

## Schema
```sql
CREATE TABLE ks.orders (
  tenant_id text,
  order_id text,
  status text,
  created_at timestamp,
  PRIMARY KEY ((tenant_id), status, order_id)
);
```

## Code
```java
Select select = QueryBuilder.select().all()
  .from("ks", "orders")
  .where(eq("tenant_id", tenantId))
  .and(eq("status", status))
  .allowFiltering(); // ← 本番で除去し忘れ
```

## Validation Points
- QueryBuilder 経由で `allowFiltering()` を呼び出した場合に警告を出したい。
- 期待する RuleHit: `ALLOW_FILTERING_BUILDER`

## Remediation
- QueryBuilder で `allowFiltering()` を使わず、PK を満たす設計に変更。
- どうしても必要な場合はテーブルを再設計し、専用の検索テーブルを追加。

## Difficulty
low
