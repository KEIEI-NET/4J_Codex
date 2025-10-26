package com.codex.parsers.java.options;

import java.nio.file.Path;
import java.util.Map;

public record ParseOptions(Path input,
                           Path output,
                           Path sourceRoot,
                           Map<String, Object> rawOptions,
                           Integer maxFiles) {
}
