# Codex Go Parser (L1)

Go 言語向け解析器の骨組みです。`cobra` ベースの CLI を用意し、`parse` コマンドで入力ファイルの存在確認とスタブ出力を行います。

```bash
go run ./cmd/parser parse --in tmp/files.jsonl --out tmp/facts.raw.jsonl
```

現段階では Facts 生成を行っていません。次フェーズで `go/packages` や SSA を利用したシンボル抽出ロジックを実装予定です。
