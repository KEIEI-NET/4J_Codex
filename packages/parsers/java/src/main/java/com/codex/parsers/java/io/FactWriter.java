package com.codex.parsers.java.io;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.BufferedWriter;
import java.io.Closeable;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

public final class FactWriter implements Closeable {
    private final ObjectMapper mapper = new ObjectMapper();
    private final BufferedWriter writer;

    public FactWriter(Path output) throws IOException {
        this.writer = Files.newBufferedWriter(output);
    }

    public synchronized void write(Object value) throws IOException {
        writer.write(mapper.writeValueAsString(value));
        writer.newLine();
    }

    @Override
    public void close() throws IOException {
        writer.flush();
        writer.close();
    }
}

