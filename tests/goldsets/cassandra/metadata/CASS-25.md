# CASS-25 — 手動キー生成による LWT 依存

## Context
登録トークンをクライアントが生成し、それを `INSERT ... IF NOT EXISTS` で検証している。ピーク時は LWT が 600+/s まで増え、クラスタ全体のスループットを圧迫している。

## Schema
```sql
CREATE TABLE ks.registration_tokens (
  tenant_id text,
  token text,
  created_at timestamp,
  PRIMARY KEY ((tenant_id), token)
);
```

## Query
```sql
INSERT INTO ks.registration_tokens (tenant_id, token, created_at)
VALUES (?, ?, ?)
IF NOT EXISTS;
```

## Validation Points
- `LwtUsage` の `lwtPerSecond` と `lwtToTotalRatio` が閾値を超え、`LWT_OVERUSE` ルールが発火する。

## Remediation
- UUIDv7 やサーバ生成キーを利用し、LWT を削減する。
- キュー化して非同期に検証し、ホットパスから LWT を排除する。

## Difficulty
high
