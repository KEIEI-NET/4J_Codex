# CASS-04 — LWT と通常書き込みの混在バッチ

## Context
アカウント設定の更新 API で、存在チェックを軽量トランザクション (LWT) で行った後に  
同じ `UNLOGGED BATCH` 内で通常の UPDATE を混在させていた。ワークロードが増えると LWT 待機が連鎖的に伸びた。

## Schema
```sql
CREATE TABLE ks.account_settings (
  tenant_id text,
  account_id text,
  version int,
  payload text,
  PRIMARY KEY ((tenant_id), account_id)
);
```

## Query
```cql
BEGIN UNLOGGED BATCH
  INSERT INTO ks.account_settings (tenant_id, account_id, version, payload)
  VALUES ('t-1', 'acc-42', 7, '...') IF version = 6;
  UPDATE ks.account_settings
  SET payload = '...', version = 7
  WHERE tenant_id = 't-1' AND account_id = 'acc-42';
APPLY BATCH;
```

## Validation Points
- LWT (IF 条件付き) と通常 UPDATE を同一 BATCH に入れており、内部的にシリアライズされ待機時間が増大。
- `MIXED_LWT_BATCH` などのルールで検知できるか確認したい。

## Remediation
- LWT を個別トランザクションに分離し、通常書き込みは別リクエストに切り出す。
- 競合リスクを下げるためにバージョン管理やイベントソーシングを導入する。
- UPDATE の冪等性を確認し、必要ならリトライポリシーを調整。

## Difficulty
medium
