package com.codex.parsers.java.facts;

import java.util.HashMap;
import java.util.Map;

public record DbQueryFact(
        String id,
        String raw,
        String op,
        boolean allowFiltering
) {
    public Map<String, Object> toMap() {
        Map<String, Object> map = new HashMap<>();
        map.put("type", "DBQuery");
        map.put("id", id);
        map.put("raw", raw);
        map.put("op", op);
        map.put("allowFiltering", allowFiltering);
        return map;
    }
}

