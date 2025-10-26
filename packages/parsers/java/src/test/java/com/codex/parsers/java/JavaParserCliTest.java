package com.codex.parsers.java;

import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JavaParserCliTest {
    @Test
    void helpCommandReturnsZero() {
        JavaParserCli cli = new JavaParserCli();
        ByteArrayOutputStream stdout = new ByteArrayOutputStream();
        ByteArrayOutputStream stderr = new ByteArrayOutputStream();
        int code = cli.run(new String[]{"--help"}, new PrintStream(stdout), new PrintStream(stderr));
        assertEquals(0, code);
        assertTrue(stdout.toString().contains("Usage: parsers-java"));
    }
}
