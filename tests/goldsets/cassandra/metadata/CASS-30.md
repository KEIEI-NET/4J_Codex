# CASS-30 — サブクエリ風ロジックでの複数往復

## Context
サービス層がユーザごとにサブクエリを繰り返し実行し、ページサイズを指定せずに `SELECT` をループで実行している。大量の往復が発生し、N+1 クエリ問題の温床となっている。

## Schema
```sql
CREATE TABLE ks.user_activity (
  tenant_id text,
  user_id uuid,
  activity_ts timestamp,
  activity text,
  PRIMARY KEY ((tenant_id), activity_ts, user_id)
);
```

## Query
```java
ResultSet rs = session.execute(boundStatement);
// pageSize 未設定で既定の 5000 を引きずり、N+1 ループで全件取得
```

## Validation Points
- `ExecutionConfig.pageSize` が `null` となり、`NO_PAGING` ルールが警告を出す。

## Remediation
- 適切な `setPageSize` を指定し、アプリ側でループをバッチ化する。
- まとめて取得できる API/テーブルに切り替える。

## Difficulty
medium
