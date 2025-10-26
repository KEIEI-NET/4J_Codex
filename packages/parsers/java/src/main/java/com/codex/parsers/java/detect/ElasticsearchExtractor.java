package com.codex.parsers.java.detect;

import com.codex.parsers.java.facts.RelFact;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.VariableDeclarator;
import com.github.javaparser.ast.expr.Expression;
import com.github.javaparser.ast.expr.MethodCallExpr;
import com.github.javaparser.ast.expr.ObjectCreationExpr;
import com.github.javaparser.ast.expr.StringLiteralExpr;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

public final class ElasticsearchExtractor {
    private static final Set<String> SUPPORTED_METHODS = Set.of(
            "search",
            "index",
            "update",
            "updateByQuery",
            "delete",
            "bulk",
            "get",
            "count"
    );

    private static final Set<String> REQUEST_TYPES = Set.of(
            "SearchRequest",
            "IndexRequest",
            "DeleteRequest",
            "UpdateRequest",
            "UpdateByQueryRequest",
            "BulkRequest",
            "CountRequest"
    );

    private ElasticsearchExtractor() {
    }

    public static List<RelFact> detectRelations(MethodDeclaration method, String symbolId, Set<String> indexCollector) {
        List<RelFact> relations = new ArrayList<>();
        method.findAll(MethodCallExpr.class).forEach(call -> {
            if (!isElasticsearchCall(call)) {
                return;
            }
            String operation = call.getNameAsString();
            if (!SUPPORTED_METHODS.contains(operation)) {
                return;
            }
            String index = extractIndex(call, method).orElse("unknown");
            if (!"unknown".equals(index)) {
                indexCollector.add(index);
            }
            String to = "esi:" + index;
            relations.add(new RelFact(
                    "QUERIES_ES",
                    symbolId,
                    to,
                    Map.of("op", operation)
            ));
        });
        return relations;
    }

    private static boolean isElasticsearchCall(MethodCallExpr call) {
        Optional<Expression> scope = call.getScope();
        if (scope.isEmpty()) {
            return false;
        }
        String text = scope.get().toString().toLowerCase(Locale.ROOT);
        if (text.contains("resthighlevelclient") || text.contains("elasticsearchclient")) {
            return true;
        }
        return text.contains("client") || text.contains("es");
    }

    private static Optional<String> extractIndex(MethodCallExpr call, MethodDeclaration method) {
        for (Expression arg : call.getArguments()) {
            Optional<String> fromLiteral = extractFromExpression(arg, method);
            if (fromLiteral.isPresent()) {
                return fromLiteral;
            }
        }
        return Optional.empty();
    }

    private static Optional<String> extractFromExpression(Expression expression, MethodDeclaration method) {
        if (expression instanceof StringLiteralExpr literal) {
            return Optional.of(literal.getValue());
        }
        if (expression instanceof ObjectCreationExpr creation) {
            String typeName = creation.getType().getNameAsString();
            if (!REQUEST_TYPES.contains(typeName)) {
                return Optional.empty();
            }
            for (Expression arg : creation.getArguments()) {
                Optional<String> nested = extractFromExpression(arg, method);
                if (nested.isPresent()) {
                    return nested;
                }
            }
        }
        if (expression instanceof MethodCallExpr chained) {
            String name = chained.getNameAsString();
            if ("indices".equals(name) && !chained.getArguments().isEmpty()) {
                Optional<String> nested = extractFromExpression(chained.getArgument(0), method);
                if (nested.isPresent()) {
                    return nested;
                }
            }
            if (chained.getScope().isPresent()) {
                Optional<String> scopeResult = extractFromExpression(chained.getScope().get(), method);
                if (scopeResult.isPresent()) {
                    return scopeResult;
                }
            }
        }
        if (expression.isNameExpr()) {
            String variableName = expression.asNameExpr().getNameAsString();
            Optional<VariableDeclarator> declaration = method.findAll(VariableDeclarator.class).stream()
                    .filter(var -> var.getNameAsString().equals(variableName))
                    .findFirst();
            if (declaration.isPresent() && declaration.get().getInitializer().isPresent()) {
                return extractFromExpression(declaration.get().getInitializer().get(), method);
            }
        }
        return Optional.empty();
    }
}
