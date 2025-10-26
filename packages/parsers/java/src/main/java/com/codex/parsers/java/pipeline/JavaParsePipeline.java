package com.codex.parsers.java.pipeline;

import com.codex.parsers.java.io.FactWriter;
import com.codex.parsers.java.io.FileEntry;
import com.codex.parsers.java.io.FileListReader;
import com.codex.parsers.java.logging.StructuredLogger;
import com.codex.parsers.java.options.ParseOptions;
import com.codex.parsers.java.options.ParserSettings;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public final class JavaParsePipeline {
    private final StructuredLogger logger = StructuredLogger.create();

    private static final class Counters {
        int files;
        int symbols;
        int queries;
    }

    public PipelineSummary run(ParseOptions options, List<FileEntry> initialEntries) throws IOException {
        ParserSettings settings = ParserSettings.fromOptions(options);
        JavaFileAnalyzer analyzer = new JavaFileAnalyzer(settings, logger);
        FileListReader reader = new FileListReader();

        Counters counters = new Counters();
        Integer maxFiles = options.maxFiles();

        try (FactWriter writer = new FactWriter(options.output())) {
            if (initialEntries != null) {
                for (FileEntry entry : initialEntries) {
                    if (maxFiles != null && counters.files >= maxFiles) {
                        break;
                    }
                    processEntry(entry, settings, analyzer, writer, counters);
                    if (maxFiles != null && counters.files >= maxFiles) {
                        break;
                    }
                }
            } else if (options.input() != null) {
                reader.forEach(options.input(), entry -> {
                    if (maxFiles != null && counters.files >= maxFiles) {
                        return Boolean.FALSE;
                    }
                    processEntry(entry, settings, analyzer, writer, counters);
                    if (maxFiles != null && counters.files >= maxFiles) {
                        return Boolean.FALSE;
                    }
                    return Boolean.TRUE;
                });
            } else {
                logger.warn("no_input_entries", Map.of(
                        "message", "No input file or directory entries provided"
                ));
            }
        }

        return new PipelineSummary(counters.files, counters.symbols, counters.queries);
    }

    private void processEntry(FileEntry entry,
                              ParserSettings settings,
                              JavaFileAnalyzer analyzer,
                              FactWriter writer,
                              Counters counters) {
        if (!isJavaFile(entry)) {
            return;
        }
        Path absolute = resolvePath(settings.repoRoot(), entry.path());
        if (!Files.exists(absolute)) {
            logger.warn("file_missing", Map.of(
                    "path", entry.path()
            ));
            return;
        }
        try {
            AnalysisResult result = analyzer.analyze(absolute);
            counters.files++;
            for (var symbol : result.symbols()) {
                writer.write(symbol.toMap());
                counters.symbols++;
            }
            for (var query : result.queries()) {
                writer.write(query.toMap());
                counters.queries++;
            }
            for (var rel : result.relations()) {
                writer.write(rel.toMap());
            }
            for (var esIndex : result.esIndexes()) {
                writer.write(esIndex.toMap());
            }
        } catch (Exception ex) {
            logger.warn("analysis_failed", Map.of(
                    "path", entry.path(),
                    "message", ex.getMessage()
            ));
        }
    }

    private boolean isJavaFile(FileEntry entry) {
        if (entry.lang() != null && !entry.lang().equalsIgnoreCase("java")) {
            return false;
        }
        return entry.path().toLowerCase(Locale.ROOT).endsWith(".java");
    }

    private Path resolvePath(Path root, String relative) {
        return root.resolve(relative).normalize();
    }
}
