package com.codex.parsers.java.detect;

import com.codex.parsers.java.facts.DbQueryFact;
import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Locale;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CqlQueryExtractorTest {

    @Test
    void extractsOperationAndAllowFilteringFromLiteral() {
        CompilationUnit unit = StaticJavaParser.parse("""
                package com.example;
                class Sample {
                    void run() {
                        String cql = \"SELECT * FROM ks.events WHERE tenant_id=? ALLOW FILTERING\";
                    }
                }
                """);

        List<DbQueryFact> facts = CqlQueryExtractor.extract(unit);

        assertEquals(1, facts.size());
        DbQueryFact fact = facts.get(0);
        assertEquals("SELECT * FROM ks.events WHERE tenant_id=? ALLOW FILTERING", fact.raw());
        assertEquals("SELECT", fact.op());
        assertTrue(fact.allowFiltering());
    }

    @Test
    void extractsConcatenatedQueryString() {
        CompilationUnit unit = StaticJavaParser.parse("""
                package com.example;
                class Sample {
                    void run() {
                        String cql = \"SELECT * FROM \" + \"ks.events\" +
                                \" WHERE tenant_id=?\";
                    }
                }
                """);

        List<DbQueryFact> facts = CqlQueryExtractor.extract(unit);

        assertEquals(1, facts.size());
        DbQueryFact fact = facts.get(0);
        assertEquals("SELECT * FROM ks.events WHERE tenant_id=?", fact.raw());
        assertEquals("SELECT", fact.op());
    }

    @Test
    void extractsInsertStatement() {
        CompilationUnit unit = StaticJavaParser.parse("""
                package com.example;
                class Sample {
                    void run() {
                        String cql = \"INSERT INTO ks.events(id, payload) VALUES (?, ?)\";
                    }
                }
                """);

        List<DbQueryFact> facts = CqlQueryExtractor.extract(unit);

        assertEquals(1, facts.size());
        DbQueryFact fact = facts.get(0);
        assertEquals("INSERT INTO ks.events(id, payload) VALUES (?, ?)", fact.raw());
        assertEquals("INSERT", fact.op());
        assertFalse(fact.allowFiltering());
    }

    @Test
    void extractsQueryBuilderLiteralArgument() {
        CompilationUnit unit = StaticJavaParser.parse("""
                package com.example;
                class Sample {
                    void run() {
                        var statement = com.datastax.oss.driver.api.querybuilder.QueryBuilder
                                .raw(\"SELECT * FROM ks.audit_log WHERE tenant_id=?\");
                    }
                }
                """);

        List<DbQueryFact> facts = CqlQueryExtractor.extract(unit);

        assertEquals(1, facts.size());
        DbQueryFact fact = facts.get(0);
        assertTrue(fact.raw().toUpperCase(Locale.ROOT).contains("SELECT * FROM KS.AUDIT_LOG"));
    }

    @Test
    void extractsQueryBuilderChainExpression() {
        CompilationUnit unit = StaticJavaParser.parse("""
                package com.example;
                class Sample {
                    void run() {
                        var stmt = QueryBuilder.selectFrom("ks", "users")
                                .column("id")
                                .whereColumn("tenant_id").isEqualTo(QueryBuilder.bindMarker("tenant"))
                                .build();
                    }
                }
                """);

        List<DbQueryFact> facts = CqlQueryExtractor.extract(unit);

        assertEquals(1, facts.size());
        DbQueryFact fact = facts.get(0);
        assertTrue(fact.raw().contains("QueryBuilder.selectFrom"));
        assertEquals("SELECT", fact.op());
        assertFalse(fact.allowFiltering());
    }

    @Test
    void extractsStaticImportQueryBuilderChainWithAllowFiltering() {
        CompilationUnit unit = StaticJavaParser.parse("""
                package com.example;
                import static com.datastax.oss.driver.api.querybuilder.QueryBuilder.selectFrom;
                import static com.datastax.oss.driver.api.querybuilder.QueryBuilder.literal;

                class Sample {
                    void run() {
                        var stmt = selectFrom("ks", "orders")
                                .all()
                                .whereColumn("tenant_id").isEqualTo(literal("acme"))
                                .allowFiltering();
                    }
                }
                """);

        List<DbQueryFact> facts = CqlQueryExtractor.extract(unit);

        assertEquals(1, facts.size());
        DbQueryFact fact = facts.get(0);
        assertTrue(fact.raw().startsWith("selectFrom"));
        assertEquals("SELECT", fact.op());
        assertTrue(fact.allowFiltering());
    }
}
