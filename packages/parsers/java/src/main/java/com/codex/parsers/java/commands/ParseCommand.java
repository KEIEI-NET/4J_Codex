package com.codex.parsers.java.commands;

import com.codex.parsers.java.io.FileEntry;
import com.codex.parsers.java.logging.StructuredLogger;
import com.codex.parsers.java.options.ParseOptions;
import com.codex.parsers.java.pipeline.JavaParsePipeline;
import com.codex.parsers.java.pipeline.PipelineSummary;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Stream;

final class ParseCommand implements PluginCommand {
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private final StructuredLogger logger = StructuredLogger.create();

    @Override
    public String name() {
        return "parse";
    }

    @Override
    public String description() {
        return "Parse Java source files and emit Codex Facts JSONL.";
    }

    @Override
    public int execute(String[] args) throws Exception {
        ParseOptions options = parseArgs(args);
        if (options == null) {
            return 0;
        }

        if (options.output() == null) {
            throw new IllegalArgumentException("Missing required argument --out");
        }

        if (options.input() == null && options.sourceRoot() == null) {
            throw new IllegalArgumentException("Either --in or --root must be specified");
        }

        if (options.input() != null && !Files.exists(options.input())) {
            throw new IllegalArgumentException("Input file does not exist: " + options.input());
        }

        Path parent = options.output().getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }

        Map<String, Object> startLog = new HashMap<>();
        startLog.put("output", options.output().toString());
        if (options.input() != null) {
            startLog.put("input", options.input().toString());
        }
        if (options.sourceRoot() != null) {
            startLog.put("root", options.sourceRoot().toString());
        }
        if (options.maxFiles() != null) {
            startLog.put("maxFiles", options.maxFiles());
        }
        logger.info("parse_command_start", startLog);

        List<FileEntry> directoryEntries = null;
        if (options.sourceRoot() != null) {
            directoryEntries = collectEntries(options.sourceRoot(), options.maxFiles());
            if (directoryEntries.isEmpty()) {
                logger.warn("parse_command_empty_root", Map.of(
                        "root", options.sourceRoot().toString()
                ));
            }
        }

        JavaParsePipeline pipeline = new JavaParsePipeline();
        PipelineSummary summary = pipeline.run(options, directoryEntries);

        Map<String, Object> completeLog = new HashMap<>();
        if (options.input() != null) {
            completeLog.put("input", options.input().toString());
        }
        if (options.sourceRoot() != null) {
            completeLog.put("root", options.sourceRoot().toString());
        }
        completeLog.put("output", options.output().toString());
        completeLog.put("files", summary.filesProcessed());
        completeLog.put("symbols", summary.symbolsEmitted());
        completeLog.put("queries", summary.queriesEmitted());
        if (options.maxFiles() != null) {
            completeLog.put("maxFiles", options.maxFiles());
        }

        logger.info("parse_command_complete", completeLog);

        return 0;
    }

    private ParseOptions parseArgs(String[] args) throws JsonProcessingException {
        Path input = null;
        Path output = null;
        Path sourceRoot = null;
        Map<String, Object> opts = Collections.emptyMap();
        Integer maxFiles = null;

        for (int i = 0; i < args.length; i++) {
            String arg = args[i];
            switch (arg) {
                case "--in":
                    i = expectValue(args, i);
                    input = Path.of(args[i]);
                    break;
                case "--out":
                    i = expectValue(args, i);
                    output = Path.of(args[i]);
                    break;
                case "--root":
                    i = expectValue(args, i);
                    sourceRoot = Path.of(args[i]);
                    break;
                case "--max-files":
                    i = expectValue(args, i);
                    maxFiles = parsePositiveInt(args[i]);
                    break;
                case "--opts":
                    i = expectValue(args, i);
                    String raw = args[i];
                    opts = parseOpts(raw);
                    break;
                case "--help":
                    printParseHelp();
                    return null;
                default:
                    throw new IllegalArgumentException("Unknown argument: " + arg);
            }
        }

        if (output == null) {
            throw new IllegalArgumentException("Missing required argument --out");
        }

        Path normalizedInput = input != null ? input.toAbsolutePath().normalize() : null;
        Path normalizedOutput = output.toAbsolutePath().normalize();
        Path normalizedRoot = sourceRoot != null ? sourceRoot.toAbsolutePath().normalize() : null;

        return new ParseOptions(normalizedInput, normalizedOutput, normalizedRoot, opts, maxFiles);
    }

    private int expectValue(String[] args, int index) {
        if (index + 1 >= args.length) {
            throw new IllegalArgumentException("Missing value for " + args[index]);
        }
        return index + 1;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseOpts(String raw) throws JsonProcessingException {
        if (raw == null || raw.isBlank()) {
            return Collections.emptyMap();
        }
        return OBJECT_MAPPER.readValue(raw, HashMap.class);
    }

    private void printParseHelp() {
        System.out.println("Usage: parsers-java parse (--in <files.jsonl> | --root <dir>) --out <facts.jsonl> [--max-files <n>] [--opts '{\"classpath\": [...]}']");
        System.out.println();
        System.out.println("Arguments:");
        System.out.println("  --in     JSONL file listing File entities (produced by scanner)");
        System.out.println("  --root   Source directory to scan recursively (java files only)");
        System.out.println("  --out    Output path for Facts JSONL");
        System.out.println("  --max-files <n>  Process at most N Java files (for smoke runs)");
        System.out.println("  --opts   JSON string with parser options (classpath, sourceRoots, etc.)");
    }

    private Integer parsePositiveInt(String value) {
        try {
            int parsed = Integer.parseInt(value);
            if (parsed <= 0) {
                throw new IllegalArgumentException("--max-files must be positive");
            }
            return parsed;
        } catch (NumberFormatException ex) {
            throw new IllegalArgumentException("--max-files expects a positive integer", ex);
        }
    }

    private List<FileEntry> collectEntries(Path root, Integer maxFiles) throws IOException {
        if (!Files.isDirectory(root)) {
            throw new IllegalArgumentException("Specified root is not a directory: " + root);
        }
        List<FileEntry> entries = new ArrayList<>();
        try (Stream<Path> stream = Files.walk(root)) {
            Stream<FileEntry> entryStream = stream.filter(Files::isRegularFile)
                    .map(path -> toEntry(root, path))
                    .filter(Objects::nonNull);
            if (maxFiles != null) {
                entryStream = entryStream.limit(maxFiles);
            }
            entryStream.forEach(entries::add);
        }
        return entries;
    }

    private FileEntry toEntry(Path root, Path file) {
        String lower = file.getFileName().toString().toLowerCase(Locale.ROOT);
        if (!lower.endsWith(".java")) {
            return null;
        }
        String relative = root.relativize(file).toString().replace('\\', '/');
        return new FileEntry("File", relative, "java");
    }
}
