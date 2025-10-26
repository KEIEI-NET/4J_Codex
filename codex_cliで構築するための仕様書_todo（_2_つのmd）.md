# codex-project-spec.md

> **目的**：CODEX CLI を用いて「コード関係性グラフ化システム」を構築・運用するための**実装仕様**。対象は 35k ファイル規模、言語は Java / TypeScript(Angular) / Go / C#、DB は Neo4j（最優先は Cassandra 解析）、検索は OpenSearch。LLM 補助（GPT‑5 CODEX / Claude Sonnet 4.5）を任意で併用できる。

---

## 1. ゴール / 成果物
- 任意の **ファイル/シンボル** から **caller / callee / import / extends / implements / references** をグラフで探索。
- **DBバグ特化**（Cassandra 最優先）の静的検知と **影響範囲** 可視化。
- CI で **増分解析 → Neo4j 反映 → PR コメント**（リスク/影響テスト候補）。
- LLM 補助により **曖昧解決**・**CQL最適化提案**・**自然言語検索拡張**。

**受け入れ基準（MVP/L1）**
- 解析結果（File / Symbol / CALLS / IMPORTS）が Neo4j に取り込まれ、UI（Bloom/Cytoscape）で 2-hop 探索が 1 秒以内（サブグラフ100ノード以下）。
- Cassandra の **ALLOW FILTERING** / **PK欠落** / **LIMIT無し** / **Consistency不均衡** の検知が PR にコメントされる。

---

## 2. リポジトリ構成（提案）
```
repo/
├─ codex.yml                 # CODEX CLI のエントリ定義
├─ packages/
│  ├─ scanner/               # Repo Scanner（ignore, shard）
│  ├─ parsers/               # 言語別パーサ群（java/ts/go/csharp）
│  ├─ ir-normalizer/         # 中間表現(IR) 正規化
│  ├─ graph-loader/          # Neo4j ローダ（bulk/import, upsert）
│  ├─ search-indexer/        # OpenSearch 連携
│  ├─ rules-db/              # Cassandra ほか DB 検知ルール
│  ├─ ui/                    # Bloom プリセット or Cytoscape UI
│  └─ llm-adapter/           # LLM 呼び出し抽象化(GPT/Claude)
├─ tools/
│  ├─ scripts/               # one-shot ユーティリティ
│  └─ github-actions/        # ワークフローテンプレ
├─ specs/                    # 仕様・スキーマ
├─ tests/
│  ├─ goldsets/              # Cassandra 30ケース（JSONL）
│  └─ e2e/                   # 解析→Neo4j→検知のE2E
└─ docs/
   └─ howto/                 # 運用/トラブルシュート
```

---

## 3. CODEX CLI（想定）
**基本コマンド**
- `codex plan`：依存解決・タスク DAG 生成
- `codex run <target>`：ターゲット（例：`analyze`, `load`, `e2e`）実行
- `codex task new`：テンプレからスキャフォールド
- `codex check`：静的検査＋ルール検知サマリ
- `codex diff --since HEAD~1`：増分ファクト抽出
- `codex pr-comment`：PR に検出結果を投稿

**codex.yml（抜粋）**
```yaml
version: 1
vars:
  repo_root: "."
  out_dir: "./out"
  neo4j_uri: "bolt://neo4j:7687"
  neo4j_user: "neo4j"
  neo4j_db:   "neo4j"
  opensearch: "http://search:9200"

targets:
  analyze:
    steps:
      - run: scanner --root {{repo_root}} --out {{out_dir}}/files.jsonl
      - run: parsers --in @files.jsonl --out {{out_dir}}/facts.raw.jsonl
      - run: ir-normalizer --in @facts.raw.jsonl --out {{out_dir}}/facts.ir.jsonl
      - run: rules-db --in @facts.ir.jsonl --out {{out_dir}}/facts.tagged.jsonl
  load:
    needs: [analyze]
    steps:
      - run: graph-loader --in @facts.tagged.jsonl --neo4j {{neo4j_uri}} --db {{neo4j_db}}
      - run: search-indexer --in @facts.ir.jsonl --endpoint {{opensearch}}
  pr:
    needs: [analyze, load]
    steps:
      - run: codex check --in @facts.tagged.jsonl --gold tests/goldsets/cassandra.jsonl
      - run: codex pr-comment --in @facts.tagged.jsonl --rules high,critical
```

---

## 4. 解析パイプライン
1) **Scanner**：.gitignore / ビルド生成物を除外、メタ収集。
2) **Parsers**：
   - Java: JDT/Javaparser + Spring アノテーション
   - TS: tsserver/ts-morph + Angular デコレータ/Router
   - Go: go/packages, gopls
   - C#: Roslyn
3) **IR 正規化**：`File`, `Symbol`, `Module`, `Endpoint`, `DBTable`, `DBQuery`, `RELs`（CALLS/IMPORTS/…）。
4) **DB 解析**（Cassandra 最優先）：CQL 抽出（Prepared/Builder/直書）／BINDS 逆解決／PK/CK 条件判定／ルール打刻。
5) **Load**：Neo4j へバルク/アップサート、OpenSearch へ全文索引。
6) **CI**：`codex diff` → 変更分のみ再解析 → `codex pr-comment`。

---

## 5. Neo4j スキーマ（抜粋）
```cypher
CREATE INDEX file_path IF NOT EXISTS FOR (f:File) ON (f.path);
CREATE INDEX symbol_fq IF NOT EXISTS FOR (s:Symbol) ON (s.fqname);
CREATE INDEX table_key IF NOT EXISTS FOR (t:DBTable) ON (t.keyspace, t.name);
```
**Rels**：`CONTAINS`, `CALLS`, `IMPORTS`, `EXTENDS`, `IMPLEMENTS`, `READS`, `WRITES`, `BINDS`, `IN_KEYSPACE` …

---

## 6. ルール検知（Cassandra 例）
- `ALLOW_FILTERING`, `MISSING_PK`, `NO_LIMIT`, `CONSISTENCY_MISMATCH`, `LOGGED_BATCH_GT50`, `LWT_OVERUSE` …
- 出力例（JSONL）：`{"symbol":"...","rule":"ALLOW_FILTERING","cql":"...","severity":"critical","suggest":"..."}`

---

## 7. LLM 補助（任意）
- **タスク**：`resolve_dynamic_call | optimize_cql | summarize_impact | expand_query | review_diff`
- **入出力**：19章の JSON スキーマに準拠（本仕様では省略）。
- **自動採用閾値**：`confidence >= 0.6` で候補表示、採用は人手承認。

---

## 8. セットアップ
- **Dev**：Docker Compose（neo4j, opensearch, kibana, api, ui）
- `.env`：`NEO4J_URI/USER/PASS`, `OS_ENDPOINT`, LLM キー（任意）。
- `make dev` → 解析器ホットリロード、`make seed` → サンプル投入。

---

## 9. GitHub Actions（例）
```yaml
name: codex-pipeline
on: [pull_request]
jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci && npm -w packages/* ci
      - run: codex diff --since origin/main | codex run analyze
      - run: codex run load
      - run: codex check --gold tests/goldsets/cassandra.jsonl --fail-on critical
      - run: codex pr-comment --rules high,critical
```

---

## 10. 運用 / 監視
- **メトリクス**：解析時間、未解決参照率、ルール命中率、PR Fail 率。
- **アラート**：`ALLOW FILTERING 新規導入`、`NO_LIMIT` の導入、Consistency 不整合。
- **スナップショット**：夜間にグラフをエクスポートし時系列比較を保存。

---

## 11. リスクと回避
- 言語差異 → IR 抽象化 & LSP/コンパイラ優先。
- 多態/DI → 候補集合 + LLM 補助（弱結合）。
- 解析コスト → 差分ビルド & シャーディング。

---

# codex-todos.md

> **管理方針**：Milestone（L0〜L3）× ワークストリーム（解析 / グラフ / ルール / UI / CI / LLM）でタスクを分解。各タスクは `ID / 内容 / Owner / 依存 / 見積 / 状態 / 期限` を持つ。

## 0. ステータス凡例
- `🟢 Ready` `🟡 WIP` `🟣 Review` `🔴 Blocked` `✅ Done`

---

## 1. Milestone L0（PoC, 1〜2週）
- [ ] **T-001** PoC 対象サービス選定（Cassandra×Java） Owner:PM  Est:0.5d  Dep:-  Status:🟢
- [ ] **T-002** Cassandra ゴールドセット 10 例抽出（実プロジェクト） Owner:DBE  Est:1d Dep:T-001  Status:🟢
- [ ] **T-003** Scanner 実装（ignore/シャード） Owner:Core  Est:1d  Dep:-  Status:🟢
- [ ] **T-004** Java 解析器（DataStax/Spring）最小実装 Owner:Jav  Est:3d Dep:T-003  Status:🟢
- [ ] **T-005** IR 正規化（File/Symbol/DBQuery） Owner:IR  Est:2d Dep:T-004  Status:🟢
- [ ] **T-006** Neo4j ローダ（MERGE/Index） Owner:Graph Est:2d Dep:T-005 Status:🟢
- [ ] **T-007** ルール：ALLOW FILTERING / PK欠落 / LIMIT無し Owner:Rules Est:2d Dep:T-005 Status:🟢
- [ ] **T-008** E2E: 500 ファイル → グラフ → 検知 Owner:QA Est:2d Dep:T-006,T-007 Status:🟢
- [ ] **T-009** PR コメント雛形 Owner:DevEx Est:0.5d Dep:T-007 Status:🟢

**Exit 条件**：Neo4j で 2-hop 可視化、3 ルールが PR に出力、誤検知 < 10%。

---

## 2. Milestone L1（MVP, +2〜4週）
- [ ] **T-101** TS/Angular 解析器  Owner:TS  Est:4d Dep:T-003  Status:🟢
- [ ] **T-102** Go 解析器  Owner:Go  Est:3d Dep:T-003  Status:🟢
- [ ] **T-103** C# 解析器  Owner:CS  Est:4d Dep:T-003  Status:🟢
- [ ] **T-104** OpenSearch インデクサ  Owner:Search Est:2d Dep:T-005 Status:🟢
- [ ] **T-105** UI（Cytoscape）一次版 Owner:UI Est:4d Dep:T-006 Status:🟢
- [ ] **T-106** CI（増分解析+Fail Fast） Owner:DevEx Est:2d Dep:T-007 Status:🟢

**Exit 条件**：多言語混在のコール/依存が UI に表示、Fail Fast が運用ON。

---

## 3. Milestone L2（実用, +4〜6週）
- [ ] **T-201** DB 拡張（ES/Redis/MySQL/SQLServer） Owner:DBE Est:6d Dep:T-007 Status:🟢
- [ ] **T-202** ルール拡張（BATCH, LWT, Consistency, Tombstone） Owner:Rules Est:4d Dep:T-201 Status:🟢
- [ ] **T-203** Owner/モジュールメタの結合 Owner:Core Est:2d Dep:T-006 Status:🟢
- [ ] **T-204** テスト影響分析（TIA） Owner:QA Est:3d Dep:T-006 Status:🟢
- [ ] **T-205** ランタイム ingest（Slow Query/OTel） Owner:Obs Est:5d Dep:T-006 Status:🟢

**Exit 条件**：DB 診断モード、TIA 推奨、Slow Query の可視化が機能。

---

## 4. Milestone L3（高度, +6〜10週）
- [ ] **T-301** LLM 補助：動的呼出解決 Owner:AI Est:4d Dep:T-006 Status:🟢
- [ ] **T-302** LLM 補助：CQL最適化提案 Owner:AI Est:3d Dep:T-201 Status:🟢
- [ ] **T-303** 時系列スナップショット比較 Owner:Core Est:3d Dep:T-006 Status:🟢
- [ ] **T-304** 循環依存/ハブ検出ダッシュボード Owner:UI Est:3d Dep:T-105 Status:🟢

**Exit 条件**：LLM 補助の Precision/Recall を週次で可視化、意思決定の品質向上が確認できる。

---

## 5. クロスカット（随時）
- [ ] **C-001** セキュリティ：秘密情報のマスキング  Owner:Sec Est:1d Status:🟢
- [ ] **C-002** 監査ログ/プロンプトログ（redact） Owner:Sec Est:1d Status:🟢
- [ ] **C-003** パフォーマンス計測（解析時間・グラフサイズ） Owner:Ops Est:1d Status:🟢

---

## 6. リスク / 決定ログ
- **RISK-01** 型解決の不一致 → LSP/コンパイラ優先＆フォールバック規則
- **RISK-02** 多態/DI の爆発 → 候補集合 + LLM 補助 + 信頼度閾値
- **DEC-01** Neo4j & OpenSearch を正とし、LLMは補助

---

## 7. レポート（週次）
- 主要 KPI：解析成功率 / 誤検知率 / PR Fail 率 / 平均解析時間 / LLM コスト
- サマリ：今週の重大検出（Top5）、Hot partition、循環依存 Top5

