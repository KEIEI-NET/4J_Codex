# AGENT ハンドブック

このリポジトリで作業するエージェント向けの行動指針とテクニカルチェックリストをまとめています。  
対象コンポーネントは Scanner / Java Parser / IR Normalizer を中心とした L0 実装フェーズです。

---

## 1. 役割と目的

- **Scanner (`packages/scanner`)**  
  リポジトリ配下を `.gitignore` 基準で列挙し、JSONL（File エンティティ）を生成する CLI。差分・ハッシュ対応済み。

- **Java Parser (`packages/parsers/java`)**  
  Java ソースを AST パースして Symbol / DBQuery を抽出。Spring DI タグや Cassandra CQL を検出し、Facts JSONL を出力。

- **IR Normalizer (`packages/ir-normalizer`)**  
  Facts JSONL を IR スキーマに従って正規化。ID/パス整形、JSON Schema 検証、strict モードを提供。

目的は「解析 → 正規化 → グラフロード」の前段までを自動化すること。構成と手順の詳細は `README.md` と `docs/howto/java_parser_usage.md` を参照。

---

## 2. 作業基本原則

1. **必ずテストを回す**  
   - TypeScript パッケージ: `npm run -w <pkg> test`  
   - Java Parser: `mvn -f packages/parsers/java/pom.xml test`
2. **差分最小・意図明確**  
   - 既存フォーマットを尊重し、変更範囲を限定する。  
   - ログ出力（stderr JSON）は JSON 形式を崩さない。
3. **ドキュメント更新の徹底**  
   - 機能を追加・変更したら README / docs / todo を同期。  
   - 実行例や制限事項を明文化。
4. **CI 相当のハンドラン**  
   - `npm install` / `mvn package` など依存生成を手元で保証。  
   - 生成物 (`target/`, `dist/`) をそのままコミットしない。

---

## 3. ディレクトリ別チェックリスト

### 3.1 Scanner
- TypeScript (ESM) / Vitest。`tsconfig.base.json` を共有。
- CLI は `bin/scanner` → `dist/cli.js` を実行。新オプション追加時はヘルプ出力を更新。
- JSONL 出力は `{"type":"File", ...}` 形式で固定。ハッシュ計算はオプション扱い。
- テスト (`src/scanner.test.ts`) にケースを足し、`npm run -w packages/scanner test` で確認。

### 3.2 Java Parser
- Maven プロジェクト。`pom.xml` の依存は JDK 17 前提。
- CLI 契約: `parsers-java parse --in <jsonl> --out <jsonl>` または `--root`（`--max-files` 等）。
- Spring DI / Cassandra / Elasticsearch (スタブ) の検出は `packages/parsers/java/src/main/java/com/codex/parsers/java/detect/` 配下に集約。
- 単体テストは JUnit (`src/test/java/...`) で追加。フルテストは `mvn ... test`。
- Jar 実行時は `dependency:copy-dependencies` でクラスパスを整える。

### 3.3 IR Normalizer
- TypeScript CLI。Ajv で `specs/ir-schema.json` を検証。
- strict モードは `sym:...#...` 形式などをチェックするため、違反が多い場合は Facts 出力側を見直す。
- テスト `src/normalizer.test.ts` を更新し、`npm run -w packages/ir-normalizer test` を通す。

---

## 4. 実行コマンドまとめ

| フェーズ | コマンド例 |
| --- | --- |
| セットアップ | `npm install` / `mvn -f packages/parsers/java/pom.xml package` |
| Scanner 実行 | `packages/scanner/bin/scanner scan --root ./proj --out ./tmp/files.jsonl --include-hash` |
| Java 解析 | `packages/parsers/java/bin/parsers-java parse --in ./tmp/files.jsonl --out ./tmp/facts.jsonl --max-files 100 --opts '{"repoRoot":"./proj"}'` |
| IR 正規化 | `packages/ir-normalizer/bin/ir-normalizer normalize --in ./tmp/facts.jsonl --out ./tmp/ir.jsonl --strict` |
| テスト | `npm run -w packages/scanner test`, `mvn -f packages/parsers/java/pom.xml test`, `npm run -w packages/ir-normalizer test` |

---

## 5. コーディング規約 / ログ

- Java: 4 スペースインデント（`.editorconfig` 参照）。`StructuredLogger` で JSON ログ出力。
- TypeScript: ESM / strict モード。Prettier で整形（`npm exec prettier --write`）。
- ログは `event` / `level` を含む JSON 形式。解析失敗・DI 検出などイベント名を明示。

---

## 6. バージョン管理ルール

1. 生成物（`target/`, `dist/`, `node_modules/` 他）はコミットしない。
2. 変更が複数領域にまたがる場合もコミットは論理単位で分割。
3. 大規模変更時は `implementation_plan.md` / `todo.md` を更新。

---

## 7. 既知の制約と TODO

- Spring DI テストは最小限。スタブを増やし、ゴールドセット化する必要あり。
- Elasticsearch 検出は現状ログに記録するのみ。IR 出力形式は未設計。
- Neo4j / OpenSearch ローダ、Rules Engine など後続フェーズは未実装。
- Strict モードに伴う ID 変換ルール（`sym:...#...`）は今後の検討課題。

最新の TODO は `todo.md`、スプリント方針は `implementation_plan.md` を参照。

---

## 8. サポート / ナレッジ共有

- 手順・コマンド例：`docs/howto/java_parser_usage.md`
- 実装状況サマリ：`docs/status.md`
- 実装計画：`implementation_plan.md`
- 仕様書：`コード関係性グラフ化システム_詳細設計仕様書_v_2.md`
- 不明点はログ (`stderr` JSON) を確認し、再現手順とともに記録。

本ガイドに沿って作業し、必要に応じて内容を更新してください。
