# 実装ステータスサマリ（2025-10-26 時点）

## 完了済み
- **スキャナ（packages/scanner）**
  - `.gitignore` 尊重のファイル列挙、SHA256 計算、Git 差分フィルタ。
  - CLI オプション：`--root` / `--include-hash` / `--changed-from` / `--ignore`。
  - Vitest による主要ユースケースの単体テスト。

- **Java 解析器（packages/parsers/java）**
  - AST パース（Javaparser）と Symbol 出力（クラス / インターフェース / enum / メソッド / コンストラクタ / DI フィールド）。
  - Spring DI アノテーション検出（`@Autowired`, `@Inject`, `@Qualifier`, `@Primary`, `@Resource` 等）とタグ付け。
  - Cassandra CQL 抽出（文字列リテラル / QueryBuilder）と `DBQuery` 出力。
  - Elasticsearch 呼び出し検出：`QUERIES_ES` Rel と `ESIndex` エンティティ生成（`search`, `index`, `update` など主要 API をサポート）。
  - CLI オプション：`--in` / `--root` / `--max-files` / `--opts`（`repoRoot`, `classpath`, `sourceRoots`）。
  - JUnit テストで DI / CQL / Elasticsearch のケースを検証。

- **IR ノーマライザ（packages/ir-normalizer）**
  - IR JSON Schema を基に Facts を検証・正規化。
  - `File` / `Symbol` / `Rel` / `DBQuery` / `ESIndex` / `RuleHit` をサポート。
  - strict モードによる ID 検証（`sym:...#...` など）。
  - Vitest による基本的な挙動テスト。

- **ドキュメント**
  - 詳細 README（リポジトリ構成・セットアップ・クイックスタート・現状・ロードマップ）。
  - `docs/howto/java_parser_usage.md` に CLI の具体的な実行例と IR 出力の注意点。
  - `implementation_plan.md` にスプリント計画と進捗表。
  - `AGENT.md` に運用ルール・コマンド・テスト手順。
  - `todo.md` に残タスクとチェック状況を反映。
- **TypeScript / Go / C# 解析器（L1）**
  - `packages/parsers/typescript`: ts-morph による `File` / `Import` / `Symbol` / `Call` Facts 抽出と Vitest テストを追加。
  - `packages/parsers/go`: `go/parser` + AST で import・関数・呼び出しを検出し JSONL を出力する CLI を実装。
  - `packages/parsers/csharp`: Roslyn (Microsoft.CodeAnalysis) で型・メソッド・呼び出しを解析し、`System.CommandLine` CLI から Facts を生成。
- **ローカルスタック (Docker Compose)**
  - `docker-compose.yml` で Neo4j / OpenSearch / API / UI / Worker を定義し、profiles で必要なサービスを選択起動。
  - `.env.example` による認証・メモリ設定のテンプレートを追加。

## 進行中 / 未完了
- **Elasticsearch 検出の精度向上**
  - Index 推定のカバレッジ拡大（複数 index 指定、ビルド時に組み立てるケースなど）。
  - `Rel` の属性拡張（リクエストオプション、HTTP メソッド等）。

- **ゴールドセット・回帰テスト**
  - Cassandra / Elasticsearch の実リポジトリから抽出したサンプルセットを整備し、CI で検証できるようにする。

- **Graph Loader / OpenSearch Indexer**
  - Neo4j へのロードスクリプト、OpenSearch インデクサの初期実装。
  - CI/CD パイプラインと連動した実行手順。

- **ルールエンジン・UI など L1 以降の機能**
  - TypeScript / Go / C# 解析器は L1（記号抽出・呼び出し検出）まで実装済み。今後は DI / DB クエリなど領域固有の Facts 拡張が必要。
  - UI、Graph API などは未実装。

## 参考リソース
- `README.md` — セットアップとクイックスタート。
- `docs/howto/java_parser_usage.md` — CLI 実行例。
- `implementation_plan.md` — フェーズ別ロードマップとスプリント計画。
- `todo.md` — タスク一覧（チェックリスト）。
- `AGENT.md` — エージェント向けガイドライン。
