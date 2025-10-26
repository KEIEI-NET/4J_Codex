# CASS-17 — Read Repair 負荷（古い Consistency 設定）

## Context
旧来の設定を引き継いだジョブが、書き込みを `LOCAL_ONE` のまま、読み取りを `LOCAL_QUORUM` に設定している。  
さらにテーブルの `read_repair_chance` が 0.2 に残っており、リードリペアが頻発している。

## Schema
```sql
CREATE TABLE ks.user_cache (
  tenant_id text,
  user_id text,
  payload text,
  updated_at timestamp,
  PRIMARY KEY ((tenant_id), user_id)
) WITH read_repair_chance = 0.2;
```

## Query / Config
```java
Statement stmt = QueryBuilder.select().all()
  .from("ks", "user_cache")
  .where(eq("tenant_id", tenantId))
  .setConsistencyLevel(ConsistencyLevel.LOCAL_QUORUM);

session.execute(stmt); // 書き込みは LOCAL_ONE
```

## Validation Points
- 読み取り/書き込み Consistency が不一致で、read_repair_chance が高い。
- 期待する RuleHit: `READ_REPAIR_MISMATCH`

## Remediation
- 読み書き Consistency を揃える (`LOCAL_QUORUM` など)。
- `read_repair_chance` を 0 にして軽量化し、必要に応じて自動修復ジョブを別途実装。

## Difficulty
medium
