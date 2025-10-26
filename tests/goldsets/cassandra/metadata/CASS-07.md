# CASS-07 — Tombstone 大量発生（大規模 DELETE）

## Context
バッチ処理で過去 90 日以前のイベントを一括削除する運用を採用し、  
毎晩 `DELETE` を複数パーティションに対して連続発行している。  
Tombstone が大量に生成され、Read 修復や compaction が追いつかなくなった。

## Schema
```sql
CREATE TABLE ks.event_history (
  tenant_id text,
  bucket int,
  ts timestamp,
  payload text,
  PRIMARY KEY ((tenant_id, bucket), ts)
);
```

## Query
```sql
DELETE FROM ks.event_history
WHERE tenant_id = ?
  AND bucket IN (0, 1, 2, 3)
  AND ts < minTimeuuid(?);
```

## Validation Points
- DELETE を大規模に実行しており tombstone が一気に生成される。
- TTL や時間分割テーブルを採用しておらず、GC が追いつかない設計。
- 期待する RuleHit: `BULK_DELETE_TOMBSTONES`

## Remediation
- 時間で区切ったテーブル戦略、または TTL を活用して自然消滅させる。
- 削除対象を小さなレンジに分割し、バックグラウンドで段階的に削除する。
- ユースケースによってはアーカイブテーブルへ移動してから削除する。

## Difficulty
medium
