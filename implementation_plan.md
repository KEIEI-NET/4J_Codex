# コード関係性グラフ化システム — 実装計画

## 1. 目的と適用範囲

- 本計画は「コード関係性グラフ化システム\_詳細設計仕様書\_v_2.0」を基に、実装フェーズを工程別に具体化する。
- 対象は 35k ファイル規模・多言語（Java / TypeScript / Go / C#）リポジトリ解析、および Neo4j / OpenSearch を用いたグラフ可視化・ルール検知基盤。
- 初期リリース（L0〜L3）のロードマップを、製品レベルの SLO（サブグラフ p95<1s、増分解析 p95<3m）を満たす形で実装する。

## 2. 前提条件とリソース

- 開発チーム：解析器×2、グラフ基盤×1、UI×1、SRE×1 を想定（兼任可）。
- インフラ：Neo4j 5.x、OpenSearch 2.x、Docker Compose（Dev）、Kubernetes（Prod）。
- ビルド環境：Java 17、Node.js 20、Go 1.21、.NET 8、GitHub Actions / Codex CLI。
- 共通成果物：`repo/` 配下にパッケージ分割、JSONL スキーマ、Dockerfile、CI/CD。

## 3. フェーズ別ロードマップ

| フェーズ       | スコープ                                                                                                       | 主要完了条件                                                                              |
| -------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| L0 (基盤)      | Repo Scanner、Java 解析器、IR 正規化、Cassandra 3 ルール、Neo4j ロード、Graph API Minimal、PR 評価パイプライン | Java+Cassandra サンプルリポで E2E（解析→ルール→Neo4j→API）、SLO 計測、RuleHit PR コメント |
| L1 (多言語/UI) | TS/Go/C# 解析器、UI 初版、OpenSearch 連携、Fail Fast                                                           | 多言語差分解析、Cytoscape UI で 1Hop/2Hop 閲覧、検索インデックス動作                      |
| L2 (拡張)      | ES/Redis/SQL 分析、TIA、Owner 結合、OTel/SlowQuery 連携                                                        | DB 拡張エンティティとルール、OTel スパン重み付け、TIA 自動計算                            |
| L3 (高度化)    | LLM 補助タスク、Snapshot 差分、循環・ハブ可視化                                                                | LLM ワークフロー運用、Snapshot 比較 UI、中心性ダッシュボード                              |

## 4. コンポーネント別実装方針

### 4.1 リポジトリスキャナ

- Go or TypeScript で並列ファイル走査、`.gitignore` 適用、差分検出（`git diff --name-only` + ハッシュ）。
- 出力：対象ファイル一覧 JSONL、統計ログ（stderr JSON）。
- テスト：大規模モックリポの並列走査性能、差分検出の単体テスト。

### 4.2 言語解析器

- Java：JDT/Javaparser、Spring DI 解析、CQL/ES 呼び出し抽出。
- TypeScript：ts-morph、DI/Router/HttpClient 解析、Cassandra ドライバ。
- Go：go/packages、インタフェース解決、gocql クエリ抽出。
- C#：Roslyn、ServiceCollection 登録解析、DataStax ドライバ抽出。
- 共通：Facts JSONL（File/Symbol/Rel/DBQuery）、stderr メトリクス、AST パターンスナップショットテスト。

### 4.3 IR 正規化・ルールエンジン

- IR Normalizer：ID 命名規則、重複検出、未解決関係は `rel:"UNRESOLVED"` + hint。
- ルールエンジン：YAML ルールロード、Cassandra 主要ルール（ALLOW_FILTERING ほか）と LWT/BATCH 微分則を評価。
- 出力：RuleHit JSONL、severity 付き。ゴールドセット（CASS-01..30）基準で精度検証。

### 4.4 グラフローダ・検索インデクサ

- Neo4j：初回 CSV import、以降 APOC MERGE バッチ（1000〜5000/chunk）、制約/インデックス適用。
- OpenSearch：IR/RuleHit をマッピングに合わせて投入、差分更新（再インデックス戦略含む）。
- テスト：Neo4j インポート再現性、OpenSearch クエリ精度。

### 4.5 Graph API / UI

- API（FastAPI or Express）：`/symbol`, `/graph/symbol/{id}`, `/impact`, `/db/table/...`, `/rulehits` を提供。認証/RBAC/ページングを実装。
- UI（Next.js + Cytoscape.js）：レイヤタブ、200 ノード制限、ホップ展開、CQL バッジ、Severity カラーリング。
- E2E：代表 500 ファイルでグラフ描画検証、ブラウザテスト（Playwright）。

### 4.6 可観測性・LLM

- Prometheus メトリクス（解析時間、失敗率、Neo4j クエリ時間等）、構造化ログ。
- OTLP Ingestor → GraphLoader で `OBSERVES` 関係と `DBQuery.metrics` を更新。
- LLM プラグイン：`resolve_dynamic_call` ほか、信頼度閾値に従うワークフロー、監査ログ。

## 5. 品質保証計画

- Unit：解析パターン、IR 正規化、YAML ルール評価、API ハンドラ。
- Integration：IR→Neo4j→API、IR→OpenSearch 美合性テスト、OTel インジェスト。
- 回帰：ゴールドセット自動走査、PR で `codex run analyze/load/check` 実行。
- 性能：SLO 計測スイート、Neo4j 書き込み/読み出し負荷テスト、UI レンダリングベンチ。

## 6. CI/CD・運用

- GitHub Actions：PR ワークフロー（lint/test/analyze/load/check→PR コメント）、Nightly フル再解析と Snapshot 保存。
- リリース管理：Docker イメージビルド、SemVer タグ、K8s マニフェスト更新。
- RBAC/監査：プロジェクト単位の権限、`codex-ignore` タグ監査ログ、LLM 送信時のレダクション。
- 障害対応：Snapshot からの Neo4j 復元手順、未解決参照増加時のリトライ/キャッシュ制御。

## 7. リスクと軽減策

- 解析精度劣化：ゴールドセット強化、誤検知報告ループ、ルール抑止タグ運用。
- Neo4j 書き込みボトルネック：CSV import fallback、バッチチューニング、水平スケール検討。
- UI パフォーマンス：WebGL レンダラ、ノード制限、クラスタ折り畳み戦略。
- セキュリティ：機密ファイル除外、秘密情報マスク、監査証跡整備。

## 8. 次アクション

1. コアリポジトリ初期化（ディレクトリ構成、`codex.yml`, Docker Compose 叩き台、CI 雛形）。
2. ゴールドセット定義とサンプルリポ準備。
3. L0 スプリント計画：Java 解析器と Neo4j 連携の E2E スコープ確定。
4. リソース割り当てとスケジュール合意（週次マイルストーン設定）。

### 8.1 L0.1 Java Parser 強化スプリント（残タスク計画）
| ID   | 内容                                                                 | 完了条件                                               | 優先度 | ステータス |
|------|----------------------------------------------------------------------|--------------------------------------------------------|--------|------------|
| JP-01 | Spring DI アノテーション検出を拡張（`@Autowired/@Inject/@Qualifier`）し、Symbol タグへ反映 | `SpringAnnotationInspector` に DI タグ追加、関連テスト作成 | High   | ✅ 完了 |
| JP-02 | Cassandra CQL 抽出のテストケース拡充                               | 単体テストで典型的な QueryBuilder/文字列結合を検証       | High   | ✅ 完了 |
| JP-03 | Elasticsearch クライアント呼び出し検出の実装                       | `QUERIES_ES` Rel と `ESIndex` 出力、単体テスト整備       | Medium | ✅ 完了 |
| JP-04 | ドキュメント/TODO 更新                                             | `todo.md`, `docs/howto/java_parser_usage.md` を最新化   | Medium | ✅ 完了 |
| JP-05 | ゴールドセット / 回帰テスト整備                                    | Cassandra & Elasticsearch ゴールドサンプルと CI 反映     | High   | ⛏️ 計画中 |

推奨順序：JP-01 → JP-02 → JP-03 → JP-04。JP-01/JP-02 で検出精度とテスト基盤を整え、JP-03 で検出範囲を広げた後、JP-04 でステータスと使用ドキュメントを更新する。
