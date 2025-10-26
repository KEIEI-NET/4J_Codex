package com.codex.parsers.java.options;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

public final class ParserSettings {
    private final Path repoRoot;
    private final List<Path> sourceRoots;
    private final List<Path> classpath;

    private ParserSettings(Path repoRoot, List<Path> sourceRoots, List<Path> classpath) {
        this.repoRoot = repoRoot;
        this.sourceRoots = Collections.unmodifiableList(sourceRoots);
        this.classpath = Collections.unmodifiableList(classpath);
    }

    public Path repoRoot() {
        return repoRoot;
    }

    public List<Path> sourceRoots() {
        return sourceRoots;
    }

    public List<Path> classpath() {
        return classpath;
    }

    public static ParserSettings fromOptions(ParseOptions options) {
        Path explicitSourceRoot = options.sourceRoot();
        Path repoRoot = explicitSourceRoot != null ? explicitSourceRoot : options.output().getParent();
        if (options.rawOptions() != null) {
            Object root = options.rawOptions().get("repoRoot");
            if (root instanceof String path) {
                repoRoot = Path.of(path).toAbsolutePath().normalize();
            }
        }
        if (repoRoot == null) {
            repoRoot = Path.of(System.getProperty("user.dir")).toAbsolutePath();
        }

        List<Path> sourceRoots = new ArrayList<>();
        List<Path> classpath = new ArrayList<>();

        Map<String, Object> rawOptions = options.rawOptions();
        if (rawOptions != null) {
            extractPathList(rawOptions.get("sourceRoots"), sourceRoots);
            extractPathList(rawOptions.get("classpath"), classpath);
        }
        if (sourceRoots.isEmpty()) {
            if (explicitSourceRoot != null) {
                sourceRoots.add(explicitSourceRoot);
            } else if (repoRoot != null) {
                sourceRoots.add(repoRoot);
            }
        }

        if (explicitSourceRoot != null && !containsPath(sourceRoots, explicitSourceRoot)) {
            sourceRoots.add(explicitSourceRoot);
        }

        if (explicitSourceRoot == null && repoRoot != null && !containsPath(sourceRoots, repoRoot)) {
            sourceRoots.add(repoRoot);
        }

        return new ParserSettings(repoRoot, sourceRoots, classpath);
    }

    private static void extractPathList(Object value, List<Path> target) {
        if (value instanceof Iterable<?> iterable) {
            for (Object item : iterable) {
                if (item instanceof String path) {
                    target.add(Path.of(path).toAbsolutePath().normalize());
                }
            }
        }
    }

    private static boolean containsPath(List<Path> paths, Path candidate) {
        for (Path path : paths) {
            if (path.equals(candidate)) {
                return true;
            }
        }
        return false;
    }
}
