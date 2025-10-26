# CASS-08 — クラスタ順序と ORDER BY の逆順指定

## Context
トランザクション履歴一覧 API で最新順のテーブルに対して昇順並び替えを要求し、  
`ORDER BY ts ASC` を指定した結果、サーバ側でメモリソートが発生してしまった。

## Schema
```sql
CREATE TABLE ks.transactions (
  account_id text,
  ts timestamp,
  amount decimal,
  note text,
  PRIMARY KEY ((account_id), ts)
)
WITH CLUSTERING ORDER BY (ts DESC);
```

## Query
```sql
SELECT account_id, ts, amount
FROM ks.transactions
WHERE account_id = ?
ORDER BY ts ASC
LIMIT 500;
```

## Validation Points
- クラスタリングキーが `DESC` なのに対し、`ORDER BY ts ASC` を指定している。
- Cassandra は逆順ソートをサポートするが、メモリに積み替えるため大規模レンジでは危険。
- 期待する RuleHit: `ORDER_BY_SKEW`

## Remediation
- アプリ側で結果を反転する、または別テーブルを用意して昇順で保持する。
- 必要なら `DESC` を維持し、範囲を小さくするかページングを導入する。
- 集計用途ならば Spark など外部処理に移譲する。

## Difficulty
low
