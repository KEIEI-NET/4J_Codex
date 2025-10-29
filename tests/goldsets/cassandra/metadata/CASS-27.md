# CASS-27 — マルチテナント境界の取り違え

## Context
マルチテナント環境で、ユーザ監査テーブル `ks.events` を参照する際に `tenant_id` 条件を付け忘れていた。結果、別テナントのイベントが混入しデータリークの危険がある。

## Schema
```sql
CREATE TABLE ks.events (
  tenant_id text,
  user_id uuid,
  ts timestamp,
  kind text,
  payload text,
  PRIMARY KEY ((tenant_id, user_id), ts)
);
```

## Query
```sql
SELECT * FROM ks.events
WHERE user_id = ?
  AND ts > ?;
```

## Validation Points
- `tenant_id` が WHERE 句に存在せず、`MISSING_PK` ルールが critical で発火する。

## Remediation
- DAO 層で `tenant_id` を必須パラメータにし、API で検証する。
- 併せて `ALLOW FILTERING` を防ぐため、PK 条件をユニットテストでチェックする。

## Difficulty
low
