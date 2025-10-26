# コード関係性グラフ化システム — L0 実装メモ

マルチリポ・多言語プロジェクトのコード関係をグラフ化し、DB クエリやルール違反を可視化するための解析基盤です。本リポジトリでは L0 フェーズとして、スキャナ／Java 解析器／IR 正規化器を中心に最小構成を実装中です。

---

## 1. リポジトリ構成

```
repo/
├─ packages/
│  ├─ scanner/           # リポジトリ走査 CLI (TypeScript)
│  ├─ parsers/java/      # Java 解析器 (Maven)
│  └─ ir-normalizer/     # IR 正規化 CLI (TypeScript)
├─ specs/                # IR JSON Schema など
├─ tests/                # 共通テスト（今後追加予定）
└─ docs/howto/           # 手順ドキュメント
```

主要コンポーネント | 機能 | 備考
---|---|---
`packages/scanner` | `.gitignore` 尊重のファイル列挙、差分フィルタ、SHA256 計算 | `npm run -w packages/scanner build`
`packages/parsers/java` | Java AST 解析、Spring DI タグ付け、Cassandra CQL 抽出 | `mvn -f packages/parsers/java/pom.xml package`
`packages/ir-normalizer` | IR スキーマ検証・正規化、strict チェック | `npm run -w packages/ir-normalizer build`

---

## 2. 前提条件

- Node.js 20+
- npm / npx
- Java 17 (Maven 3.8+)
- (任意) jq, Neo4j, OpenSearch など後続検証用ツール

初回セットアップ:

```bash
npm install          # ルート依存関係
mvn -f packages/parsers/java/pom.xml package
```

---

## 3. Docker Compose ローカルスタック

- `docker-compose.yml` で Neo4j / OpenSearch を常時起動し、API・UI・Worker 用のコンテナは profiles（`app`, `ui`, `worker`）で必要時のみ立ち上げます。
- 初回は `.env.example` を `.env` にコピーし、`NEO4J_PASSWORD` やメモリサイズを調整してください。未設定でもデフォルト値で起動します。
- コア依存だけを起動: `docker compose up -d neo4j opensearch`
- 解析ジョブや API を同一ネットワークで動かす場合: `docker compose --profile app --profile worker up`
- データは Named Volume（`neo4j_data` / `opensearch_data`）に永続化されるため、リセットしたい場合は `docker compose down -v` を利用します。
- WSL / マシン再起動後は `docker compose up -d neo4j opensearch` を再実行し、`docker compose ps` で稼働状況を確認してから API／Worker を起動してください。

## 4. クイックスタート

### 4.1 ファイル走査 → Java 解析 → IR 正規化

```bash
# 1) ファイル走査
packages/scanner/bin/scanner scan \
  --root ./sample-project \
  --out ./tmp/files.jsonl \
  --include-hash

# 2) Java 解析（JSONL 入力）
packages/parsers/java/bin/parsers-java parse \
  --in ./tmp/files.jsonl \
  --out ./tmp/facts.raw.jsonl \
  --max-files 100 \
  --opts '{"repoRoot": "./sample-project"}'

# 3) IR 正規化
packages/ir-normalizer/bin/ir-normalizer normalize \
  --in ./tmp/facts.raw.jsonl \
  --out ./tmp/ir.jsonl
```

`docs/howto/java_parser_usage.md` に細かなオプション（`--root` 解析、`--strict`、`--changed-from` 等）のまとめがあります。実装状況は `docs/status.md` を参照してください。

### 4.2 Maven 直実行

依存ライブラリを含めて解析したい場合は、Jar + 依存を生成した後に `java -cp` で CLI を呼び出すことも可能です。

```bash
mvn -f packages/parsers/java/pom.xml package dependency:copy-dependencies
java -cp "packages/parsers/java/target/parsers-java-0.0.1-SNAPSHOT.jar:packages/parsers/java/target/dependency/*" \
  com.codex.parsers.java.JavaParserCli parse --root ./src --out ./tmp/facts.jsonl --max-files 50
```

---

## 5. 現在の実装状況

- ✅ Scanner: ファイル列挙、Git 差分対応、単体テスト済み。
- ✅ Java Parser: クラス/メソッド/コンストラクタ/フィールドの Symbol 抽出、Spring DI タグ付け、Cassandra CQL 抽出、Elasticsearch 呼び出しログ検出（今後拡張）。
- ✅ IR Normalizer: JSON Schema 検証、ID & パス正規化、strict モード（Symbol ID チェック）。
- ✅ ドキュメント: `docs/howto/java_parser_usage.md`、`implementation_plan.md`、`todo.md` 更新。
- ⛏️ 着手予定: Elasticsearch クライアント検出、Spring DI テスト拡充、ゴールドセット整備、Neo4j ローダ。

---

## 6. テストコマンド

```bash
# Scanner 単体テスト
npm run -w packages/scanner test

# IR Normalizer 単体テスト
npm run -w packages/ir-normalizer test

# Java Parser テスト
mvn -f packages/parsers/java/pom.xml test
```

---

## 7. 次ステップ（抜粋）

1. Java 解析の精度向上（Spring DI テスト充実、Elasticsearch 呼び出し検出）。
2. ゴールドセット＆Neo4j ローダを用いた E2E 検証、OpenSearch 連携の実装。
3. UI / Graph API / ルールエンジンの本格実装と CI/CD 自動化。

詳細なマイルストーンは `implementation_plan.md` と `todo.md` を参照してください。
