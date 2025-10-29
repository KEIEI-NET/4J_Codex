# Sprint 運用メモ

- **トラッキング方法**: GitHub Projects (ボード名: `Codex Roadmap`) を利用。todo.md の各セクションをエピックとしてカード化し、Sprint 1〜4 のミレストーンを追加。
- **担当者アサイン (Sprint 1)**
  - 永続化と検索（Neo4j Loader, OpenSearch Indexer）: @alice
  - CI/CD・運用（PR ワークフロー拡張、Nightly 叩き台）: @bob
  - クロスサポート (docs/status, implementation_plan 更新): @carol
- **進行ルール**: カードは `Backlog → In Progress → Review → Done` のステータスを経由し、完了時に todo.md と implementation_plan.md を同期更新。
- **定例**: Sprint 1 中は週次進捗共有（火曜）。完了後にレトロを開催しロードマップをローリング更新する。Graph API/UI チームは必要に応じてボード上でタスクを分割。
