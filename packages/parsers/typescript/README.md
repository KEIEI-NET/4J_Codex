# Codex TypeScript Parser (L1)

このワークスペースは Codex Scanner から TypeScript ソースコードを収集し、Facts を出力する解析パイプラインの土台です。現時点では CLI とテストの骨組みのみを提供しており、実際の AST 解析は後続イテレーションで実装します。

## コマンド

```bash
# ビルド
npm run -w packages/parsers-typescript build

# スタブ解析
node packages/parsers/typescript/dist/cli.js parse --in tmp/files.jsonl --out tmp/facts.raw.jsonl
```

`parse` コマンドは入力ファイルの存在チェックのみを行い、スタブレコードを出力します。

## 次のステップ

- ts-morph ベースの AST Walk 実装
- Facts エンコーディング (`DBQuery`, `Symbol`, `Call` 等)
- Vitest による L1 ユニットテスト
