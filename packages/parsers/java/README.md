# Codex Java Parser Plugin (Skeleton)

This module provides the CLI entry point for the Java language parser in the Codex analysis pipeline. The current L0 scaffold sets up:

- Maven build targeting Java 17 with dependencies for JavaParser (symbol solver), Eclipse JDT, Jackson, and SLF4J.
- Plugin-style CLI (`parsers-java <command>`) with the `parse` command stub conforming to the Codex plugin contract.
- Structured logging helpers for JSONL-friendly stderr output.

## Build

```
mvn -f pom.xml package
```

The resulting executable jar will be located at `target/parsers-java-0.0.1-SNAPSHOT.jar`. Use the wrapper script `bin/parsers-java` to run commands after packaging.

## Usage

スキャナ経由の JSONL を入力に使う場合:

```
bin/parsers-java parse --in ./files.jsonl --out ./facts.jsonl --max-files 100
```

ソースディレクトリを直接解析する場合（再帰的に `.java` を探索）:

```
bin/parsers-java parse --root ./app/src --out ./facts.jsonl --max-files 10
```

必要に応じて `--opts '{"repoRoot": "..."}'` でクラスパスやルートを指定できます。
`--max-files` を指定すると解析対象の Java ファイル数に上限を設けられます。

## Next Steps

- Implement Fact extraction pipeline (File → CompilationUnit → Facts JSONL).
- Integrate Spring DI metadata and Cassandra CQL detection.
- Add integration tests driven by goldset fixtures.
