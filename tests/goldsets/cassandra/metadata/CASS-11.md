# CASS-11 — ホットパーティション (広範な書き込み集中)

## Context
リアルタイム指標を `(tenant_id, metric_id)` のパーティションに集約しており、特定テナントの更新が 1 分あたり数万件に達していた。  
クラスタは水平スケールしているものの、単一パーティションに書き込みが集中した結果、ホットスポット化してスロットリングが発生。

## Schema
```sql
CREATE TABLE ks.metric_values (
  tenant_id text,
  metric_id text,
  bucket timestamp,
  value double,
  PRIMARY KEY ((tenant_id, metric_id), bucket)
);
```

## Metrics
- 直近 10 分間で `tenant_id = 't-critical'` の partition が 600k レコード追加。
- 1 秒あたりの書き込みがクラスタ全体の 65% を占有。

## Validation Points
- 単一パーティションへの書き込みの連続集中を検知したい。
- 期待する RuleHit: `HOT_PARTITION`

## Remediation
- 時間軸でバケットを追加 (`PRIMARY KEY ((tenant_id, metric_id, day), bucket)` など)。
- 書き込みを複数パーティションに分散させるためのハッシュキーを導入。
- TTL やラウンドロビン書き込みで負荷均衡を図る。

## Difficulty
high
