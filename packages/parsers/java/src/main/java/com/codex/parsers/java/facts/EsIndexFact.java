package com.codex.parsers.java.facts;

import java.util.HashMap;
import java.util.Map;

public record EsIndexFact(String id, String name) {
    public Map<String, Object> toMap() {
        Map<String, Object> map = new HashMap<>();
        map.put("type", "ESIndex");
        map.put("id", id);
        map.put("name", name);
        return map;
    }
}

