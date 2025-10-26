package com.codex.parsers.java.facts;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

public record SymbolFact(
        String id,
        String kind,
        String name,
        String fqName,
        String fileId,
        int startLine,
        int endLine,
        List<String> annotations,
        List<String> tags
) {
    public Map<String, Object> toMap() {
        Map<String, Object> map = new HashMap<>();
        map.put("type", "Symbol");
        map.put("id", id);
        map.put("kind", kind);
        map.put("name", name);
        map.put("fqname", fqName);
        map.put("fileId", fileId);
        map.put("start", startLine);
        map.put("end", endLine);
        map.put("annotations", annotations);
        map.put("tags", tags);
        return map;
    }
}

