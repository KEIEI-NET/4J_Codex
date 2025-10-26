package com.codex.parsers.java.detect;

import com.codex.parsers.java.facts.DbQueryFact;
import com.codex.parsers.java.util.HashUtil;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.expr.StringLiteralExpr;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public final class CqlQueryExtractor {
    private CqlQueryExtractor() {
    }

    public static List<DbQueryFact> extract(CompilationUnit cu) {
        List<DbQueryFact> facts = new ArrayList<>();
        List<StringLiteralExpr> literals = cu.findAll(StringLiteralExpr.class);
        for (StringLiteralExpr literal : literals) {
            String value = literal.getValue();
            if (isLikelyCql(value)) {
                String op = inferOperation(value);
                boolean allowFiltering = value.toUpperCase(Locale.ROOT).contains("ALLOW FILTERING");
                facts.add(new DbQueryFact("dbq:" + HashUtil.sha256(value), value, op, allowFiltering));
            }
        }
        return facts;
    }

    private static boolean isLikelyCql(String value) {
        String upper = value.toUpperCase(Locale.ROOT);
        return upper.contains("SELECT") || upper.contains("INSERT INTO") || upper.contains("UPDATE") || upper.contains("DELETE FROM");
    }

    private static String inferOperation(String value) {
        String trimmed = value.trim().toUpperCase(Locale.ROOT);
        if (trimmed.startsWith("SELECT")) {
            return "SELECT";
        }
        if (trimmed.startsWith("INSERT")) {
            return "INSERT";
        }
        if (trimmed.startsWith("UPDATE")) {
            return "UPDATE";
        }
        if (trimmed.startsWith("DELETE")) {
            return "DELETE";
        }
        return "UNKNOWN";
    }
}

