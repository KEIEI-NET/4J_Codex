package com.codex.parsers.java.logging;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

final class JsonPrinter {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private JsonPrinter() {
    }

    static String print(Object value) {
        try {
            return MAPPER.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            return "{\"event\":\"logging_failure\",\"message\":\"" + e.getMessage() + "\"}";
        }
    }
}

