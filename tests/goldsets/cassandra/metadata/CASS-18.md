# CASS-18 — Allow Filtering + Secondary Index + LIKE

## Context
サポートチーム向けの検索画面で、メッセージ本文を部分一致で検索するために  
二次インデックス付きテーブルへ `ALLOW FILTERING` と `LIKE` を組み合わせたクエリを発行している。

## Schema
```sql
CREATE TABLE ks.support_logs (
  tenant_id text,
  log_id timeuuid,
  message text,
  severity text,
  PRIMARY KEY ((tenant_id), severity, log_id)
);

CREATE INDEX support_logs_message_idx ON ks.support_logs (message);
```

## Query
```sql
SELECT * FROM ks.support_logs
WHERE tenant_id = ?
  AND message LIKE '%timeout%'
ALLOW FILTERING;
```

## Validation Points
- 三重悪手（ALLOW FILTERING + Secondary Index + LIKE）を検知したい。
- 期待する RuleHit: `TRIPLE_BAD_FILTER`

## Remediation
- OpenSearch など全文検索エンジンへ委譲、もしくは専用テーブルを用意。
- `ALLOW FILTERING` を廃止し、PK に合わせたスキーマ変更を行う。

## Difficulty
high
