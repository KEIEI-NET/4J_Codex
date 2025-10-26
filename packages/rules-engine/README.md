# Rules Engine Utilities

このパッケージにはルールエンジン向けの補助スクリプトを配置します。

## Cassandra ゴールドセット検証

```bash
npm run -w packages/rules-engine validate:cassandra
```

- `tests/goldsets/cassandra/fixtures/*.jsonl` の形式・`caseId`・Schema を検証します。
- `schemas/` に Schema ファイルが存在しない場合はスキップします（IR など任意ファイルを想定）。

## ルール評価 CLI

`npm run -w packages/rules-engine build` で `dist/` を生成した後、CLI から Facts を解析できます。

```bash
node packages/rules-engine/bin/rules-engine cassandra --facts tests/goldsets/cassandra/fixtures
```

- 解析結果は `RuleHit` JSON の配列で標準出力に出力されます。`--output <path>` を併用するとファイル保存も可能です。
- 判定ロジックは `src/rules/cassandra.ts` の各 Rule Definition に集約しています。
- `npm run -w packages/rules-engine test` で CASS-01..10 フィクスチャとの照合テストを実行できます。
- `validate:cassandra` は内部で `npm run build` を実行してから `dist/scripts/validate-cassandra.js` を動かすため、開発時に追加の loader 警告は発生しません。
