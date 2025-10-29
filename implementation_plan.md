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

## 8. 実装ロードマップ（todo.md 連動）

### Sprint 1（週間 1–2）: パイプライン完成度の底上げ
- 担当: 永続化/検索 @alice, CI/CD @bob, 計画更新 @carol
- **永続化と検索**（todo#4）
  - Neo4j Loader を Bolt 書き込み対応済みの CLI からサービス化、MERGE 最適化と CSV Import ユーティリティの設計。
  - OpenSearch Indexer を本運用対応、エラー処理と index 管理コマンドを整備。
- **CI/CD・運用**（todo#8）
  - GitHub Actions ワークフローを `codex diff → analyze → load → rules` に拡張、アーティファクトとして Cassandra レポートを保存。
  - Nightly 解析ジョブの叩き台（手動トリガ）を codex.yml と docs に追記。
- 出力物: Loader/Indexer サービス README、CI 実行ログ、更新された `todo.md` 状態。

> 進捗メモ: Loader/Indexer の CLI 機能拡張（CSV 書き出し・インデックス作成）および CI パイプライン (`ci:verify` + `ci:pipeline`) を実装済み。

### Sprint 2（週間 3–4）: 言語解析とルールエンジン強化
- 担当: 言語解析 @david, ルール/ゴールドセット @alice, ドキュメント @carol
- **言語解析器**（todo#2）
  - Java Spring DI 解析の本実装と AST パターンテスト追加。
  - TypeScript / Go / C# で DI・HTTP・CQL を検出する最初のルールを実装、テストケースを追加。
- **ルールエンジン・ゴールドセット**（todo#3）
  - YAML ルールローダを導入し、主要ルール（ALLOW_FILTERING, MISSING_PK, NO_LIMIT）を YAML 定義へ移行。
  - LWT/BATCH 系ルール実装とゴールドセットの追従、`npm run report:cassandra` のダッシュボード連携。
- 出力物: 新規ルール YAML、追加テスト、仕様変更に伴うドキュメント更新。

### Sprint 3（週間 5–6）: Graph API と UI の初版
- 担当: API @erin, UI @frank, 可観測性 @bob
- **Graph API**（todo#5）
  - Express/FastAPI 雛形を作成し、`/symbol`・`/graph/symbol/{id}`・`/rulehits` を read-only で提供。
  - Neo4j/Index サービスとの接続層を整備し、簡易 RBAC を導入。
- **UI**（todo#6）
  - Next.js + Cytoscape.js の土台構築、シンボル探索→グラフ表示までの MVP を実装。
  - Playwright による smoke テストを追加（CI パイプラインから `npm run -w @codex/ui test:e2e` を実行）。
- **可観測性**（todo#7）
  - Prometheus メトリクスエンドポイントと構造化ログを Graph Loader/API に組み込み。
- 出力物: API/UI 起動手順、CI での smoke 実行ログ。

> 進捗メモ: Fastify Graph API (`/api/symbol`, `/api/graph/symbol/:id`) と Vite + Cytoscape.js UI を実装し、検索・描画のスタブを確認済み。

### Sprint 4（週間 7–8）: 運用・性能・受け入れ
- 担当: CI/運用 @bob, 性能検証 @alice, 可観測性/LLM @david
- **CI/CD・運用**（todo#8）
  - Nightly フル解析ジョブの自動化、Snapshot 復元ドキュメント整備。
  - Docker/K8s マニフェストのドラフトと RBAC ダッシュボード雛形。
- **性能・受け入れ試験**（todo#9）
  - サブグラフ API p95 < 1s、Neo4j 書き込み負荷テスト、UI ベンチ結果の記録。
  - 受け入れ基準（Precision/Recall ≥0.9）報告テンプレート作成。
- **可観測性・LLM 連携**（todo#7）
  - OTLP Ingestor の PoC と `OBSERVES` 関係生成の初期実装。
- 出力物: 性能測定レポート、運用 Runbook、残課題リスト。

### ロードマップの運用ルール
- 各 Sprint 完了時に `todo.md` の該当チェックと備考を更新し、Implementation Plan の本章を再掲する。
- 依存関係の変更が発生した場合は `docs/status.md` に反映して関係者へ共有する。
- 緊急タスクは Sprint バッファ（各 10%）で吸収し、不可の場合はロードマップを再計画する。
