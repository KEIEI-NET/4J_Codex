# L1 解析器 Facts サマリ

TypeScript / Go / C# の各 L1 解析器が出力する Facts を整理し、共通化・拡張の観点をまとめる。

## 共通カテゴリ

| Fact Type | 共通フィールド                 | 説明                                   |
| --------- | ------------------------------ | -------------------------------------- |
| `File`    | `language`, `path`             | 入力ファイルの正規化パス。            |
| `Import`  | `language`, `file`, 参照情報   | 依存モジュール / 名前空間 / パッケージの参照。 |
| `Symbol`  | `language`, `file`, `name`, `kind`, `startLine` | 宣言シンボル。関数 / クラス / メソッド等。 |
| `Call`    | `language`, `file`, `callee`, `arguments`, `startLine` | 関数・メソッド呼び出し。             |

各言語の固有フィールドは以下。

## TypeScript (`packages/parsers/typescript`)

### `File`
- `path`: プロジェクトルートからの相対パス（存在しない場合は絶対パス）。

### `Import`
- `module`: `from` 句のモジュール名。
- `namedBindings`: 名前付き import の配列。
- `defaultImport`: デフォルト import の識別子。存在しない場合は `null`。

### `Symbol`
- `kind`: `function` / `class`。
- `exported`: `true` / `false`。
- `async`: 関数が `async` の場合に `true`（クラスには付与されない）。

### `Call`
- `callee`: 呼び出し式全体（例：`console.log` や関数名）。
- `receiver`: プロパティアクセスのレシーバー（例：`console`）。単純識別子の場合は `null`。
- `arguments`: 引数の文字列表現

## Go (`packages/parsers/go`)

### `File`
- `path`: プロジェクトルートからの相対パス（失敗時は絶対パス）。`/` で正規化。

### `Import`
- `path`: import 先パッケージ。

### `Symbol`
- `kind`: 現状は `function` のみ（メソッド / receiver 付き関数も含む）。
- `receiver`: メソッドのレシーバ型。関数の場合は空文字列。
- `exported`: 識別子が大文字で始まる場合に `true`。

### `Call`
- `callee`: 呼び出し識別子（例：`fmt.Println` / `doSomething`）。
- `receiver`: プロパティアクセスのレシーバ。単純呼び出しの場合は空文字列。
- `arguments`: 引数の文字列表現配列。

## C# (`packages/parsers/csharp`)

### `File`
- `path`: プロジェクトルートからの相対パス（失敗時は絶対パス）。`/` で正規化。

### `Import`
- `namespace`: `using` 対象の名前空間。

### `Symbol`
- `kind`: `class` / `struct` / `record` / `record struct` / `interface` / `method` / `constructor`。
- `returnType`: メソッドの戻り値型（メソッドのみ）。
- `async`: メソッドが `async` の場合に `true`。

### `Call`
- `callee`: 呼び出し式文字列（例：`Console.WriteLine`）。
- `arguments`: 引数の文字列表現配列。

## 共通化と次の着手点

1. **フィールド命名の統一**
   - `callee` / `receiver` の扱いを TypeScript/Go/C# で統一（空文字列・`null` の使い分けを整理）。
   - `Import` の `module` / `path` / `namespace` を統合し、`source` 等の共通キーに正規化。

2. **メタ情報の拡張**
   - `Symbol` の `kind` を列挙化し、クラス／関数／メソッド／構造体などを共通カテゴリへマッピング。
   - `Call` に `receiverKind` や `module` を付与し DB/HTTP 呼び出し判定に活用。

3. **ドメイン固有 Facts**
   - DI / ServiceCollection 解析、DB クエリ抽出など、ルールエンジンと連携するための Facts を追加予定。
   - Cassandra / HTTP クライアントなどの抽出は `Call` 解析にフックする形を想定。

   | 言語 | 優先追加 Facts | 想定ルール連携 |
   | ---- | -------------- | -------------- |
   | TypeScript | Angular DI (`@Injectable`, constructor injection)、HttpClient 呼び出し (`CALLS_HTTP`)、cassandra-driver (`DBQuery`) | UI/API ルール、Cassandra ルール |
   | Go | `gocql` クエリ抽出 (`DBQuery`)、`http.Client` 呼び出し (`CALLS_HTTP`)、Wire/FX など DI コンテナ登録 | Cassandra ルール、HTTP ガバナンス |
   | C# | ASP.NET / ServiceCollection 登録 (`DIRegister` Fact)、DataStax C# Driver (`DBQuery`)、`HttpClient` 呼び出し (`CALLS_HTTP`) | DI/DB ルール、API レート制御 |

4. **検証**
   - 各ワークスペースにスナップテストを追加し、生成 Facts のスキーマをゴールドセットと比較できるようにする。
   - TypeScript: Vitest に追加ケース（DI/HTTP、cassandra-driver モック）を並列化。
   - Go: `go test` で AST → Facts の Golden snapshot（`testdata`）を保持。
   - C#: xUnit もしくは `dotnet test` 互換の支援ライブラリ導入を検討。

本ドキュメントは実装変更に合わせて更新し、Facts フォーマットの共通仕様化に活用する。
