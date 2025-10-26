package com.codex.parsers.java.logging;

import java.io.PrintStream;
import java.time.Instant;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class StructuredLogger {
    private final PrintStream out;

    private StructuredLogger(PrintStream out) {
        this.out = out;
    }

    public static StructuredLogger create() {
        return new StructuredLogger(System.err);
    }

    public void info(String event, Map<String, ?> fields) {
        emit("info", event, fields, null);
    }

    public void warn(String event, Map<String, ?> fields) {
        emit("warn", event, fields, null);
    }

    public void error(String event, String command, Throwable throwable) {
        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("command", command);
        fields.put("message", throwable.getMessage());
        emit("error", event, fields, throwable);
    }

    private void emit(String level, String event, Map<String, ?> fields, Throwable throwable) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("timestamp", Instant.now().toString());
        payload.put("level", level);
        payload.put("event", event);
        if (fields != null) {
            payload.putAll(fields);
        }
        if (throwable != null) {
            payload.put("exception", throwable.getClass().getName());
            payload.put("exceptionMessage", throwable.getMessage());
            List<String> stackTrace = Arrays.stream(throwable.getStackTrace())
                    .map(StackTraceElement::toString)
                    .toList();
            payload.put("stackTrace", stackTrace);
        }
        out.println(JsonPrinter.print(payload));
    }
}
