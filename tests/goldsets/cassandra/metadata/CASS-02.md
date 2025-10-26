# CASS-02 — LIMIT/Paging 未設定によるフルスキャン

## Context
モバイル通知履歴の参照 API が利用者ごとの最新イベントを一覧表示する想定だったが、  
過去全期間を上限無しで読み出しており、実環境で大量のページネーション負荷が発生した。

## Schema
```sql
CREATE TABLE ks.events (
  tenant_id text,
  user_id text,
  ts timestamp,
  payload text,
  PRIMARY KEY ((tenant_id, user_id), ts)
)
WITH CLUSTERING ORDER BY (ts DESC);
```

## Query
```sql
SELECT * FROM ks.events WHERE tenant_id=? AND user_id=? AND ts > ?;
```

## Validation Points
- `LIMIT` が無いため該当期間の全レコードを取得してしまう。
- Driver 側の `setPageSize` も設定されておらず自動ページングで重い往復が発生。
- 期待する RuleHit: `NO_LIMIT`, `NO_PAGING`

## Remediation
- 取得件数を業務要件に合わせて `LIMIT` 指定。
- Java Driver から実行する際に `Statement#setPageSize` を設定し過剰フェッチを防止。
- 必要に応じて結果を段階的に取得する UI/UX を組み合わせる。

## Difficulty
medium
