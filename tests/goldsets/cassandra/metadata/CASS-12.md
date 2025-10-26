# CASS-12 — `IN` 多値の過剰利用

## Context
アドホックレポートで最大 500 件のユーザ ID を `IN` 句に列挙して参照している。  
呼び出し元は複数画面の一括取得処理で、クライアント側から受け取った ID 群をそのままバインドしていた。

## Schema
```sql
CREATE TABLE ks.user_events (
  tenant_id text,
  user_id text,
  ts timestamp,
  payload text,
  PRIMARY KEY ((tenant_id, user_id), ts)
);
```

## Query
```sql
SELECT * FROM ks.user_events
WHERE tenant_id = ?
  AND user_id IN (?, ?, ..., ? -- 200 件以上);
```

## Validation Points
- `IN` 句に大量の値を設定すると、クライアント側で複数クエリに分割されてしまう。
- 期待する RuleHit: `IN_LIST_FANOUT`

## Remediation
- ユーザ ID を一時テーブルやバッチに登録し、JOIN で取得する。
- クエリ数を制限するため、ID をバッチ単位 (例: 20 件) に分割する。
- そもそも必要なユーザ集合を再評価し、別テーブルに転写する。

## Difficulty
medium
