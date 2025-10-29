# CASS-26 — `token()` での ALLOW FILTERING 悪用

## Context
一部の検索 API が `token(user_id)` を利用したレンジスキャンで `ALLOW FILTERING` を有効化し、`tenant_id` 条件を付けずに横断検索していた。結果としてクラスタ全体のフルスキャンが走っている。

## Schema
```sql
CREATE TABLE ks.users (
  tenant_id text,
  user_id uuid,
  email text,
  status int,
  PRIMARY KEY ((tenant_id), user_id)
);
```

## Query
```sql
SELECT * FROM ks.users
WHERE token(user_id) > token(?)
ALLOW FILTERING;
```

## Validation Points
- `allowFiltering=true` かつ PK 条件が欠落しているため、`ALLOW_FILTERING` ルールが critical として発火する。

## Remediation
- `tenant_id` 等のパーティションキーを必須にし、`ALLOW FILTERING` を廃止する。
- レンジ検索が必要な場合は専用テーブル/セカンダリインデックスではなく Elastic 等に移す。

## Difficulty
medium
