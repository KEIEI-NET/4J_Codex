# CASS-20 — 巨大パーティション + ORDER BY 逆順

## Context
監査ログのエクスポートが 1 つのテナントに 200 万件以上のレコードを保持しており、  
API で昇順指定 (`ORDER BY ts ASC`) を行うことでサーバ側の再ソートと巨大パーティション走査が同時に発生した。

## Schema
```sql
CREATE TABLE ks.audit_events (
  tenant_id text,
  ts timestamp,
  event_id timeuuid,
  payload text,
  PRIMARY KEY ((tenant_id), ts, event_id)
) WITH CLUSTERING ORDER BY (ts DESC, event_id DESC);
```

## Query
```sql
SELECT tenant_id, ts, event_id
FROM ks.audit_events
WHERE tenant_id = ?
ORDER BY ts ASC
LIMIT 500;
```

## Validation Points
- 巨大パーティションを検知 (`WIDE_PARTITION`) し、逆順 ORDER BY の危険性も併せて把握したい。
- 期待する RuleHit: `WIDE_PARTITION`, `ORDER_BY_SKEW`

## Remediation
- 時間バケット列を追加する、またはテナント別にテーブルを分割する。
- 昇順表示が必要な場合はアプリ側で反転する、もしくは派生テーブルを用意する。

## Difficulty
high
