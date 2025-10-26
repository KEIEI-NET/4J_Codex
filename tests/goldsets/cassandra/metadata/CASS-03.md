# CASS-03 — 読み取り/書き込みのコンシステンシ不一致

## Context
監査ログの永続化処理で、耐障害性を重視した INSERT に対して読み出し側が強いコンシステンシを要求していた。  
結果として、クラスタ障害時に書き込み成功でも読み出しが常に失敗する状態が発生。

## Schema
```sql
CREATE TABLE ks.audit_events (
  tenant_id text,
  audit_id uuid,
  ts timestamp,
  payload text,
  PRIMARY KEY ((tenant_id), ts, audit_id)
);
```

## Query
```java
Statement stmt = QueryBuilder.select().all()
  .from("ks", "audit_events")
  .where(eq("tenant_id", tenantId))
  .setConsistencyLevel(ConsistencyLevel.ALL);

session.execute(stmt);
```
書き込みは `ConsistencyLevel.ONE` を利用していた。

## Validation Points
- 読み取りが `ALL`、書き込みが `ONE` で、耐障害性と可用性のバランスが崩れている。
- `CONSISTENCY_MISMATCH` を検出できるかを確認。

## Remediation
- 読み書きの Consistency Level を `LOCAL_QUORUM` など整合する値に揃える。
- 読み取り側もリージョン内で完結する設定に変更し、待機時間を削減。
- 運用要件に合わせ RF/CL のバランスを再設計。

## Difficulty
high
