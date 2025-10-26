# Java Parser / IR Normalizer 使用手順

Codex の L0 パイプラインで Java ソースを解析し、IR JSONL を生成するまでの手動手順をまとめます。リポジトリルートをカレントディレクトリと仮定しています。

---

## 1. リポジトリスキャン（ファイル一覧の取得）

```bash
# 例: src/ 配下のファイルをスキャンして JSONL に出力
packages/scanner/bin/scanner scan \
  --root ./sample-project \
  --out ./tmp/files.jsonl \
  --include-hash
```

- `--root`: 解析対象のリポジトリ/ディレクトリ。
- `--out`: ファイル一覧を JSONL で保存する先。
- `--include-hash`: SHA256 ハッシュを出力に含める（差分検知に利用）。
- 差分解析を行いたい場合は `--changed-from` で Git リファレンスを指定すると、変更ファイルのみに絞った JSONL が生成されます。

---

## 2. Java 解析（Facts JSONL 生成）

### 2.1 JSONL 入力を使う場合

```bash
# scanner が生成したファイルを入力に Java Facts を生成
packages/parsers/java/bin/parsers-java parse \
  --in ./tmp/files.jsonl \
  --out ./tmp/facts.raw.jsonl \
  --max-files 100 \
  --opts '{"repoRoot": "./sample-project", "classpath": ["./lib/deps.jar"]}'
```

- `--in`: スキャナが出力した File エンティティ JSONL。
- `--out`: Symbol / DBQuery などの Facts JSONL。
- `--opts`: JSON 文字列で追加設定。`repoRoot` や `classpath`、`sourceRoots` を配列で渡せます。

### 2.2 ディレクトリを直接解析する場合

```bash
# JSONL を介さずにフォルダ指定で解析
packages/parsers/java/bin/parsers-java parse \
  --root ./sample-project \
  --out ./tmp/facts.raw.jsonl \
  --max-files 50
```

- `--root`: 再帰的に `.java` ファイルを探索し解析します。
- `--opts` を併用してクラスパス等を渡すことも可能です。

---

## 3. IR 正規化

```bash
packages/ir-normalizer/bin/ir-normalizer normalize \
  --in ./tmp/facts.raw.jsonl \
  --out ./tmp/ir.jsonl \
  --strict
```

- `--in`: Java Parser などが出力した Facts JSONL。
- `--out`: IR スキーマ準拠の JSONL。Neo4j ローダやルールエンジンで利用可能。
- `--strict`: Symbol ID に `sym:...#...` が含まれているか等、追加チェックを有効化。
- Java Parser で Elasticsearch 呼び出しが検出された場合、`type: "Rel", rel: "QUERIES_ES"` が追加され、`to` に `esi:<index>` ID、`op` に操作種別が入ります。

---

## 4. ワンライナー例

以下は `sample-project/` を解析し、IR を得るまでの簡単なチェーン例です。

```bash
packages/scanner/bin/scanner scan \
  --root ./sample-project \
  --out ./tmp/files.jsonl && \
packages/parsers/java/bin/parsers-java parse \
  --in ./tmp/files.jsonl \
  --out ./tmp/facts.raw.jsonl \
  --opts '{"repoRoot": "./sample-project"}' && \
packages/ir-normalizer/bin/ir-normalizer normalize \
  --in ./tmp/facts.raw.jsonl \
  --out ./tmp/ir.jsonl
```

---

## 5. よく使うオプション一覧

| コマンド | オプション | 説明 |
|----------|------------|------|
| scanner  | `--root`         | 解析対象ディレクトリ |
|          | `--out`          | 出力 JSONL (File エンティティ) |
|          | `--changed-from` | 指定リファレンスからの変更ファイルのみに限定 |
| parser   | `--in`           | scanner 生成ファイル |
|          | `--root`         | ディレクトリ解析モード |
|          | `--max-files`    | 解析するファイル数の上限（スモーク用途） |
|          | `--opts`         | `repoRoot` / `classpath` / `sourceRoots` など |
| normalizer | `--in`         | Facts JSONL |
|            | `--out`        | IR JSONL |
|            | `--strict`     | 厳格バリデーション |

---

## 6. 既知の注意点

- Java Parser は現在 L0 スケルトン実装です。Spring DI や Cassandra CQL 抽出の詳細は順次強化予定です。
- `--opts` で指定するパスは CLI 実行位置からの相対/絶対を問わずサポートしていますが、正規化されていることを前提にしてください。
- スキャン結果や IR は JSONL なので、`jq` での加工や差分比較が容易です。

---

## 7. トラブルシュート

- Maven Jar が存在しないエラー: `mvn -f packages/parsers/java/pom.xml package` を再実行し、`target/` に jar が生成されているか確認してください。
- `--root` 利用時に `file_missing` ログが出る: `repoRoot` と `sourceRoots` のパスが正しく解析対象にマッピングされているか確認してください。
