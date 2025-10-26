# コード関係性グラフ化システム TODO（詳細）

## 0. セットアップ

- [x] リポジトリ初期化（`packages/`, `tests/`, `specs/`, `docs/howto/` を生成）
- [x] `codex.yml` 雛形作成（プラグインマッピング、SLO 設定）
- [x] Docker Compose（Neo4j / OpenSearch / API / UI / Worker）初期構成
- [ ] GitHub Actions / Codex CLI ワークフロー雛形追加

## 1. 基盤層

- [x] Repo Scanner 実装（並列走査、`.gitignore` 適用、差分検出）
- [x] Scanner 単体テスト（大規模モック、変更検知ケース）
- [x] IR スキーマ JSON Schema 公開 (`specs/ir-schema.json`)
- [x] IR Normalizer 実装（ID 生成、Rel 解決、UNRESOLVED 付与）
- [x] Normalizer 単体テスト（重複/未解決検証）

## 2. 言語解析器

### Java (L0)

- [x] JDT/Javaparser 導入と AST パイプライン構築
- [ ] Spring DI 解析（Autowired/Qualifier/Primary）
- [x] Cassandra CQL 抽出（リテラル・QueryBuilder）
- [x] Elasticsearch 呼び出し検出（QUERIES_ES Rel 出力）
- [x] Facts JSONL 出力（stderr メトリクス整備は今後）
- [ ] AST パターン単体テスト（呼び出し/CQL/DI）
  - [x] Spring DI パターンの単体テスト整備
  - [ ] Cassandra CQL 抽出ケース拡充

### TypeScript (L1)

- [ ] ts-morph ベースの AST 解析器骨組み
- [ ] Angular DI・Router 解析
- [ ] HttpClient 呼び出し→`CALLS_HTTP` 生成
- [ ] cassandra-driver クエリ抽出
- [ ] テスト（DI/HTTP/CQL ケース）

### Go (L1)

- [ ] go/packages 解析パイプライン
- [ ] インタフェース実装解決ロジック
- [ ] gocql クエリ抽出・Consistency/PageSize 解析
- [ ] テスト（CallExpr 展開、CQL ケース）

### C# (L1)

- [ ] Roslyn ワークスペース設定
- [ ] ServiceCollection / DI 解析
- [ ] DataStax C# Driver 呼び出し抽出
- [ ] テスト（DI、CQL ライブラリケース）

## 3. ルールエンジン・ゴールドセット

- [ ] YAML ルールローダ実装
- [ ] Cassandra 主要ルール（ALLOW_FILTERING, MISSING_PK, NO_LIMIT）実装
- [ ] LWT/BATCH 微分則（LWT-R1〜R3, BAT-R1〜R4）実装
- [ ] RuleHit JSONL 出力テスト
- [ ] ゴールドセット（CASS-01..30）整備と自動回帰テスト

## 4. 永続化と検索

- [ ] Neo4j CSV Export/Import ユーティリティ整備
- [ ] APOC MERGE バッチロジック実装（chunk サイズ調整）
- [ ] 制約/インデックス 適用スクリプト
- [ ] OpenSearch インデクサ実装（IR/RuleHit 対応）
- [ ] OpenSearch クエリユニットテスト（Severity / tables / path 検索）

## 5. Graph API

- [ ] FastAPI or Express プロジェクト雛形
- [ ] `/symbol` エンドポイント（検索＋ページング）
- [ ] `/graph/symbol/{id}` depth≤2 サブグラフ取得
- [ ] `/impact` 影響範囲計算（ranked paths）
- [ ] `/db/table/{keyspace}/{table}/consumers` 実装
- [ ] `/rulehits` フィルタ/ソート対応
- [ ] RBAC / 認証ミドルウェア
- [ ] API 単体/E2E テスト

## 6. UI (Next.js + Cytoscape.js)

- [ ] Next.js プロジェクト初期化・Cytoscape.js 組込み
- [ ] レイヤ切替タブ（File / Symbol / Module / Endpoint / DB）
- [ ] サブグラフ描画（200 ノード制限、ホップ展開）
- [ ] ノード/エッジ スタイル（Severity カラー、Badge）
- [ ] 右ペイン（メタ情報・ソース抜粋・IDE Deeplink）
- [ ] 検索バー／Mini-map／矩形選択
- [ ] UI パフォーマンス最適化（WebGL、throttle）
- [ ] Playwright E2E テスト

## 7. 可観測性・LLM 連携

- [ ] 共通ログ／メトリクスライブラリ整備（Prometheus exporter）
- [ ] OTLP Ingestor→Kafka→Transformer→GraphLoader パイプライン構築
- [ ] `OBSERVES` 関係生成と `DBQuery.metrics` 更新実装
- [ ] LLM プラグイン契約 (`resolve_dynamic_call`, `optimize_cql` ほか) 実装
- [ ] 信頼度閾値ロジックと UI 連携
- [ ] 監査ログ・レダクション実装

## 8. CI/CD・運用

- [ ] PR ワークフロー（`codex diff`→`codex run analyze`→`codex run load`→`codex check`→コメント）
- [ ] Nightly フル解析ジョブ＋Snapshot 保存（S3/Blob）
- [ ] Snapshot 復元手順 (`neo4j-admin load`) 自動化
- [ ] Docker/K8s マニフェスト作成（Prod 用）
- [ ] RBAC 設定・`codex-ignore` 監査ダッシュボード
- [ ] 運用ドキュメント（HowTo、Runbook）作成

## 9. パフォーマンス・受け入れ試験

- [ ] サブグラフ API p95 < 1s テストスイート
- [ ] 増分解析（100 ファイル）p95 < 3m 計測
- [ ] Neo4j 書き込み/読み出し負荷テスト
- [ ] UI レンダリングベンチマーク（200+ ノード）
- [ ] 受け入れ基準（Precision/Recall ≥0.9）検証報告作成
