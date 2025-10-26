# CASS-14 — Secondary Index + LIMIT/Paging 欠落

## Context
監査レポートのサマリ取得で二次インデックス (`category`) を利用しているが、  
`LIMIT` とページサイズ設定を入れていないため、ヒット件数が多い状況で全件取得に近い負荷となった。

## Schema
```sql
CREATE TABLE ks.audit_summary (
  tenant_id text,
  category text,
  summary text,
  PRIMARY KEY ((tenant_id), category)
);

CREATE INDEX audit_summary_category_idx ON ks.audit_summary (category);
```

## Query
```sql
SELECT * FROM ks.audit_summary
WHERE tenant_id = ?
  AND category = ?; -- LIMIT も paging も無し
```

## Validation Points
- 二次インデックスを利用しているのに `LIMIT`/Paging が設定されていない。
- 期待する RuleHit: `SECONDARY_INDEX_LIMIT`

## Remediation
- 件数を制限するため `LIMIT` を導入する。
- Driver で `setPageSize` を設定し、必要に応じてページング UI を用意する。
- 頻出カテゴリに対しては別テーブル（Materialized View）を検討する。

## Difficulty
medium
