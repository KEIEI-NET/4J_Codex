# CASS-19 — TimeWindowCompaction とアクセスパターン不一致

## Context
`TimeWindowCompactionStrategy` を採用したログテーブルに対し、  
ランダムなポイントリードが頻発する API が存在し、古い SSTable が多数開かれてしまう。

## Schema
```sql
CREATE TABLE ks.device_logs (
  tenant_id text,
  device_id text,
  ts timestamp,
  payload text,
  PRIMARY KEY ((tenant_id, device_id), ts)
) WITH compaction = {
  'class': 'TimeWindowCompactionStrategy',
  'compaction_window_unit': 'HOURS',
  'compaction_window_size': '1'
};
```

## Query / Pattern
- API が特定デバイスの任意タイムスタンプをランダムに参照。
- 直近 24 時間より前のデータアクセスが 60% を占める。

## Validation Points
- TWCS（時間窓）とランダムアクセスのミスマッチを検知する。
- 期待する RuleHit: `TWCS_MISMATCH`

## Remediation
- サイズベースの LCS への変更や、アーカイブテーブルを分割する。
- 参照パターンを時間連続アクセスに合わせるか、事前集計を導入する。

## Difficulty
medium
