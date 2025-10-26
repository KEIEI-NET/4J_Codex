# CASS-06 — Secondary Index + ALLOW FILTERING + LIKE

## Context
監査レポート生成機能で、任意キーワード検索を実現するために二次インデックスを作成し、  
`ALLOW FILTERING` と `LIKE` を組み合わせたクエリを API から発行している。  
本番データ量では coordinator ノードに負荷が集中し、レイテンシが跳ね上がった。

## Schema
```sql
CREATE TABLE ks.audit_logs (
  tenant_id text,
  log_id timeuuid,
  category text,
  message text,
  PRIMARY KEY ((tenant_id), log_id)
);

CREATE INDEX audit_logs_message_idx ON ks.audit_logs (message);
```

## Query
```sql
SELECT * FROM ks.audit_logs
WHERE tenant_id = ?
  AND message LIKE '%failed%'
ALLOW FILTERING;
```

## Validation Points
- 二次インデックス＋`LIKE` ワイルドカードが重なっておりフルスキャンに近い動作になる。
- `ALLOW FILTERING` を併用しているため coordinator フィルタリングが発生。
- 期待する RuleHit: `SECONDARY_INDEX_LIKE`, `ALLOW_FILTERING`

## Remediation
- LIKE 検索用途のための専用テーブルまたはサーチエンジン（OpenSearch など）を利用する。
- `ALLOW FILTERING` を廃止し、キー設計を検索パターンに合わせて再考する。
- 検索窓口に対するレスポンス SLA を守るため、結果件数を `LIMIT` で制限する。

## Difficulty
high
