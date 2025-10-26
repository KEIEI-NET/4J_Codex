# Codex C# Parser (L1)

`System.CommandLine` を利用した簡易 CLI を備えた C# 解析器の骨組みです。`parse` コマンドは入力ファイルの存在チェックとスタブ出力のみを行い、実際の Roslyn ベース解析は今後追加します。

```bash
dotnet run --project packages/parsers/csharp/src/Codex.CSharp.Parser -- parse --in tmp/files.jsonl --out tmp/facts.raw.jsonl
```

今後の予定:

- Roslyn Workspace 初期化
- DI / ServiceCollection 解析
- Facts JSONL (`DBQuery`, `Symbol`, etc.) の出力
