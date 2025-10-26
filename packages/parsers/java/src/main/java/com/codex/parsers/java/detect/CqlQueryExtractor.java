package com.codex.parsers.java.detect;

import com.codex.parsers.java.facts.DbQueryFact;
import com.codex.parsers.java.util.HashUtil;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.expr.BinaryExpr;
import com.github.javaparser.ast.expr.CharLiteralExpr;
import com.github.javaparser.ast.expr.EnclosedExpr;
import com.github.javaparser.ast.expr.Expression;
import com.github.javaparser.ast.expr.MethodCallExpr;
import com.github.javaparser.ast.expr.StringLiteralExpr;
import com.github.javaparser.ast.expr.TextBlockLiteralExpr;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;

public final class CqlQueryExtractor {
    private CqlQueryExtractor() {
    }

    public static List<DbQueryFact> extract(CompilationUnit cu) {
        List<DbQueryFact> facts = new ArrayList<>();
        List<StringLiteralExpr> literals = cu.findAll(StringLiteralExpr.class);
        List<BinaryExpr> concatenations = cu.findAll(BinaryExpr.class);
        List<TextBlockLiteralExpr> textBlocks = cu.findAll(TextBlockLiteralExpr.class);
        List<MethodCallExpr> methodCalls = cu.findAll(MethodCallExpr.class);
        HashSet<String> seen = new HashSet<>();

        concatenations.stream()
                .filter(expr -> expr.getOperator() == BinaryExpr.Operator.PLUS)
                .filter(expr -> !expr.getParentNode().map(parent -> parent instanceof BinaryExpr).orElse(false))
                .map(CqlQueryExtractor::evaluateStringExpression)
                .flatMap(Optional::stream)
                .forEach(value -> maybeAddFact(facts, seen, value));

        literals.stream()
                .filter(literal -> !literal.getParentNode().map(parent -> parent instanceof BinaryExpr).orElse(false))
                .map(StringLiteralExpr::getValue)
                .forEach(value -> maybeAddFact(facts, seen, value));

        textBlocks.stream()
                .map(TextBlockLiteralExpr::getValue)
                .forEach(value -> maybeAddFact(facts, seen, value));

        methodCalls.stream()
                .filter(method -> !method.getParentNode().map(node -> node instanceof MethodCallExpr).orElse(false))
                .filter(CqlQueryExtractor::isQueryBuilderChain)
                .map(MethodCallExpr::toString)
                .forEach(value -> maybeAddFact(facts, seen, value));

        return facts;
    }

    private static boolean isQueryBuilderChain(MethodCallExpr method) {
        MethodCallExpr root = method;
        while (root.getScope().filter(Expression::isMethodCallExpr).isPresent()) {
            root = root.getScope().get().asMethodCallExpr();
        }

        Optional<Expression> maybeScope = root.getScope();
        if (maybeScope.isPresent()) {
            Expression scope = maybeScope.get();
            String scopeText = scope.toString();
            if (scopeText.endsWith("QueryBuilder") || scopeText.contains("QueryBuilder.")) {
                return !isLiteralRawCall(root);
            }
            if (scope.isNameExpr() && "QueryBuilder".equals(scope.asNameExpr().getNameAsString())) {
                return !isLiteralRawCall(root);
            }
        }

        String rootName = root.getNameAsString();
        if (isLiteralRawCall(root)) {
            return false;
        }
        return QUERY_BUILDER_ENTRY_POINTS.contains(rootName);
    }

    private static boolean isLiteralRawCall(MethodCallExpr root) {
        if (!"raw".equals(root.getNameAsString())) {
            return false;
        }
        return root.getArguments().stream().anyMatch(Expression::isStringLiteralExpr);
    }

    private static void maybeAddFact(List<DbQueryFact> sink, HashSet<String> seen, String value) {
        if (value == null) {
            return;
        }
        if (!seen.add(value)) {
            return;
        }
        if (!isLikelyCql(value)) {
            return;
        }
        String op = inferOperation(value);
        String valueUpper = value.toUpperCase(Locale.ROOT);
        boolean allowFiltering = valueUpper.contains("ALLOW FILTERING") || valueUpper.contains("ALLOWFILTERING");
        sink.add(new DbQueryFact("dbq:" + HashUtil.sha256(value), value, op, allowFiltering));
    }

    private static Optional<String> evaluateStringExpression(Expression expression) {
        if (expression == null) {
            return Optional.empty();
        }
        if (expression instanceof StringLiteralExpr literal) {
            return Optional.ofNullable(literal.getValue());
        }
        if (expression instanceof TextBlockLiteralExpr literal) {
            return Optional.ofNullable(literal.getValue());
        }
        if (expression instanceof CharLiteralExpr literal) {
            return Optional.of(String.valueOf(literal.getValue()));
        }
        if (expression instanceof EnclosedExpr enclosed) {
            return evaluateStringExpression(enclosed.getInner());
        }
        if (expression instanceof BinaryExpr binary && binary.getOperator() == BinaryExpr.Operator.PLUS) {
            Optional<String> left = evaluateStringExpression(binary.getLeft());
            Optional<String> right = evaluateStringExpression(binary.getRight());
            if (left.isPresent() && right.isPresent()) {
                return Optional.of(left.get() + right.get());
            }
        }
        return Optional.empty();
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
        if (trimmed.startsWith("QUERYBUILDER.SELECTFROM") || trimmed.startsWith("SELECTFROM") || trimmed.contains("QUERYBUILDER.SELECTFROM")) {
            return "SELECT";
        }
        if (trimmed.startsWith("QUERYBUILDER.INSERTINTO") || trimmed.startsWith("INSERTINTO") || trimmed.contains("QUERYBUILDER.INSERTINTO")) {
            return "INSERT";
        }
        if (trimmed.startsWith("QUERYBUILDER.UPDATE") || trimmed.contains("QUERYBUILDER.UPDATE")) {
            return "UPDATE";
        }
        if (trimmed.startsWith("QUERYBUILDER.DELETEFROM") || trimmed.startsWith("DELETEFROM") || trimmed.contains("QUERYBUILDER.DELETEFROM")) {
            return "DELETE";
        }
        return "UNKNOWN";
    }

    private static final Set<String> QUERY_BUILDER_ENTRY_POINTS = Set.of(
            "selectFrom",
            "insertInto",
            "update",
            "deleteFrom",
            "raw",
            "simpleStatement",
            "select",
            "insert",
            "delete"
    );
}
