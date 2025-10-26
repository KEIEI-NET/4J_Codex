package com.codex.parsers.java.pipeline;

import com.codex.parsers.java.facts.DbQueryFact;
import com.codex.parsers.java.facts.EsIndexFact;
import com.codex.parsers.java.facts.RelFact;
import com.codex.parsers.java.facts.SymbolFact;

import java.util.List;

public record AnalysisResult(List<SymbolFact> symbols,
                             List<DbQueryFact> queries,
                             List<RelFact> relations,
                             List<EsIndexFact> esIndexes) {
}
