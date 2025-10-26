# CASS-15 — LWT の過剰利用

## Context
ユースケース上で整合性を保つために `IF NOT EXISTS` を多用しているが、  
1 秒あたり 2,000 件以上の LWT が発生し、クラスタ全体の待機時間が大きく増加した。  
LWT を伴わない書き込みでも `BoundStatement#setIdempotent(true)` を設定していない。

## Schema
```sql
CREATE TABLE ks.user_profile (
  tenant_id text,
  user_id text,
  version int,
  payload text,
  PRIMARY KEY ((tenant_id), user_id)
);
```

## Query
```cql
INSERT INTO ks.user_profile (tenant_id, user_id, version, payload)
VALUES (?, ?, ?, ?)
IF version = ?;
```

## Validation Points
- 高頻度経路で LWT を連発していることを検知したい。
- 期待する RuleHit: `LWT_OVERUSE`

## Remediation
- LWT を利用するケースを明示的に分析し、別経路に切り分ける。
- 事前に ID を割り当てたり、Event Sourcing で整合性を担保する。
- どうしても必要な場合でも、1 パーティション当たりの更新頻度を抑える。

## Difficulty
high
