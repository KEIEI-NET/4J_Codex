package com.codex.parsers.java.detect;

import com.github.javaparser.ast.NodeList;
import com.github.javaparser.ast.expr.AnnotationExpr;
import com.github.javaparser.ast.expr.Expression;
import com.github.javaparser.ast.expr.MemberValuePair;
import com.github.javaparser.ast.expr.NameExpr;
import com.github.javaparser.ast.expr.NormalAnnotationExpr;
import com.github.javaparser.ast.expr.SingleMemberAnnotationExpr;
import com.github.javaparser.ast.nodeTypes.NodeWithAnnotations;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

public final class SpringAnnotationInspector {
    private static final Set<String> COMPONENT_ANNOTATIONS = Set.of(
            "Component",
            "Service",
            "Repository",
            "Controller",
            "RestController",
            "Configuration"
    );

    private static final Set<String> INJECTION_ANNOTATIONS = Set.of(
            "Autowired",
            "Inject",
            "Value",
            "Resource"
    );

    private static final Set<String> QUALIFIER_ANNOTATIONS = Set.of(
            "Qualifier",
            "Named"
    );

    private static final Set<String> PRIMARY_ANNOTATIONS = Set.of(
            "Primary"
    );

    private SpringAnnotationInspector() {
    }

    public static List<String> tags(NodeWithAnnotations<?> node) {
        List<String> tags = new ArrayList<>();
        NodeList<AnnotationExpr> annotations = node.getAnnotations();
        Set<String> seen = new LinkedHashSet<>();
        for (AnnotationExpr annotation : annotations) {
            String simpleName = annotation.getName().getIdentifier();
            String normalized = simpleName.toLowerCase(Locale.ROOT);
            if (COMPONENT_ANNOTATIONS.contains(simpleName)) {
                addIfAbsent(seen, tags, "spring:component:" + normalized);
            }
            if (INJECTION_ANNOTATIONS.contains(simpleName)) {
                addIfAbsent(seen, tags, "spring:injection:" + normalized);
            }
            if (QUALIFIER_ANNOTATIONS.contains(simpleName)) {
                String qualifier = extractQualifierValue(annotation);
                if (qualifier != null && !qualifier.isBlank()) {
                    addIfAbsent(seen, tags, "spring:qualifier:" + qualifier);
                }
            }
            if (PRIMARY_ANNOTATIONS.contains(simpleName)) {
                addIfAbsent(seen, tags, "spring:injection:primary");
            }
        }
        return tags;
    }

    private static void addIfAbsent(Set<String> seen, List<String> tags, String tag) {
        if (seen.add(tag)) {
            tags.add(tag);
        }
    }

    private static String extractQualifierValue(AnnotationExpr annotation) {
        if (annotation instanceof SingleMemberAnnotationExpr single) {
            return cleanse(single.getMemberValue());
        }
        if (annotation instanceof NormalAnnotationExpr normal) {
            for (MemberValuePair pair : normal.getPairs()) {
                if ("value".equals(pair.getNameAsString()) || pair.getNameAsString().isEmpty()) {
                    return cleanse(pair.getValue());
                }
            }
        }
        return null;
    }

    private static String cleanse(Expression expr) {
        if (expr.isStringLiteralExpr()) {
            return expr.asStringLiteralExpr().getValue();
        }
        if (expr.isNameExpr()) {
            NameExpr nameExpr = expr.asNameExpr();
            return nameExpr.getNameAsString();
        }
        return expr.toString();
    }
}

