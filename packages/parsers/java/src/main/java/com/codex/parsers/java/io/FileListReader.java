package com.codex.parsers.java.io;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.BufferedReader;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.function.Function;

public final class FileListReader {
    private final ObjectMapper mapper = new ObjectMapper();

    public void forEach(Path input, Function<FileEntry, Boolean> consumer) throws IOException {
        try (BufferedReader reader = Files.newBufferedReader(input)) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isBlank()) {
                    continue;
                }
                JsonNode node = mapper.readTree(line);
                String type = node.path("type").asText("");
                if (!"File".equals(type)) {
                    continue;
                }
                String path = node.path("path").asText(null);
                if (path == null) {
                    continue;
                }
                String lang = node.path("lang").asText(null);
                Boolean shouldContinue = consumer.apply(new FileEntry(type, path, lang));
                if (Boolean.FALSE.equals(shouldContinue)) {
                    break;
                }
            }
        }
    }
}
