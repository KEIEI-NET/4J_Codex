package com.codex.parsers.java.facts;

import java.util.HashMap;
import java.util.Map;

public record RelFact(String rel, String from, String to, Map<String, Object> attributes) {
    public Map<String, Object> toMap() {
        Map<String, Object> map = new HashMap<>();
        map.put("type", "Rel");
        map.put("rel", rel);
        map.put("from", from);
        map.put("to", to);
        if (attributes != null) {
            map.putAll(attributes);
        }
        return map;
    }
}

