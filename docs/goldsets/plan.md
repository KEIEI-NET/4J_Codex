# Cassandra ゴールドセット整備計画

## 1. フィクスチャ構造

- ベースディレクトリ: `tests/goldsets/cassandra/`
  - `fixtures/` — 入力に相当する JSONL 群を格納。
    - `<case-id>_facts.jsonl` : Normalizer 直前の Facts（`File`/`Symbol`/`DBQuery` 等）を 1 行 1 レコードで保存。
    - `<case-id>_rulehits.jsonl` : 期待する RuleHit（`type:"RuleHit"`, `ruleId`, `severity`, `evidence` を含む）を 1 行 1 レコードで保存。
  - `schemas/` — フィクスチャ検証用 JSON Schema。
    - `facts.schema.json`
    - `rulehits.schema.json`
  - `metadata/` — ケース定義を Markdown で保持。
    - `<case-id>.md` に CQL・テーブル定義・検証観点・修正案・難易度を記載。
- 正規化済み IR を比較する場合は `fixtures/<case-id>_ir.jsonl` を任意で追加（`ir-normalizer` の出力をそのまま格納）。

### JSONL 共通ルール
- 文字コードは UTF-8、改行は LF。
- 各レコードに `caseId` を付与してテストラン中のフィルタを容易にする。
- 生成スクリプトは後続で `packages/rules-engine/scripts/` 配下に配置予定。

## 2. サンプルソースの収集方針

- **最小リポジトリ**: `tests/goldsets/cassandra/sample-repos/` に複製。
  - `case-XX/` ごとに `src/` と `schema/` を持つ簡易プロジェクトを用意し、Facts 生成の再現を担保。
  - 取り込み済みリポのライセンスは README に追記し、OSS の場合はライセンスファイルを同梱。
- **スタンドアロン断片**: QueryBuilder や DAO メソッドだけで十分な場合は `.java` / `.cql` を `snippets/` に配置し、`scanner` → `parsers` → `normalizer` のスモールランで Facts を出力。
- **ケースの優先度**: 設計仕様書 v2 の CASS-01..30 を順守し、まずは CASS-01..10 を MVP 範囲として整備。
- **生成手順**: `docs/goldsets/README.md`（後続追加）に Facts 生成ワークフローをまとめ、再現性を確保。

## 3. JP-05 WBS（ドラフト）

| タスク | 内容 | 見積 (d) | 出力 |
| ------ | ---- | -------- | ---- |
| G1 | フィクスチャ scaffold 作成 (`tests/goldsets/cassandra/` 階層・Schema 雛形) | 0.5 | ディレクトリ & 空ファイル群 |
| G2 | CASS-01..05 の Facts / RuleHit 生成 & メタ記述 | 1.5 | JSONL + メタ Markdown |
| G3 | `packages/rules-engine` にゴールドセット検証スクリプト追加 | 1.0 | `npm run goldset:cassandra` (仮) |
| G4 | CI 連携 (GitHub Actions / Codex CLI ワークフロー更新) | 1.0 | `ci/goldset.yml` |
| G5 | 残り CASS-06..30 の追加 (バッチ方式) | 3.0 | 追加 JSONL + ドキュメント |
| G6 | Precision/Recall 計測スクリプトとレポート雛形 | 1.0 | `reports/goldset-summary.md` |

※ 見積は 1 人日単位の概算。タスク G2/G5 は複数メンバーで並列可能。G4 は G3 完了後に着手。

### 進捗メモ（2025-10-27）
- G1 完了: Cassandra ディレクトリ構成と Schema 雛形を配置済み。
- G2 完了: CASS-01..10 の Facts/RuleHit JSONL とメタドキュメントを登録済み。
- G3 進行: ルールエンジンで CASS-01..15 を判定し、`vitest` による回帰テストと CLI (`rules-engine cassandra --facts ...`) を整備。
- G5 進行中: CASS-11..15 を追加済み。次は CASS-16..20（Wide Partition, IN 多値再構築、MV 未使用、Read Repair, TimeWindowCompaction 等）のサンプル化に着手予定。

### 次のケース候補（CASS-16..20 概要）
- **CASS-16** Materialized View 未使用の巨大JOIN風取得 — `MV_MISSING` ルール想定。
- **CASS-17** Read Repair 負荷（古い CL 設定） — `READ_REPAIR_MISMATCH`。
- **CASS-18** Allow Filtering + Secondary Index + LIKE 併用 — `TRIPLE_BAD_FILTER`。
- **CASS-19** TimeWindowCompaction とアクセスパターン不一致 — `TWCS_MISMATCH`。
- **CASS-20** 巨大パーティション + ORDER BY 逆指定（追加ケース/スナップショット）。

---

最終的な運用ドキュメント (`docs/goldsets/README.md`) とスクリプト整備は JP-05 実装時に補完する。
