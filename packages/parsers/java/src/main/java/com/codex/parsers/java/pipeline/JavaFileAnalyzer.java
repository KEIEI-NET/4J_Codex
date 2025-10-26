package com.codex.parsers.java.pipeline;

import com.codex.parsers.java.detect.CqlQueryExtractor;
import com.codex.parsers.java.detect.ElasticsearchExtractor;
import com.codex.parsers.java.detect.SpringAnnotationInspector;
import com.codex.parsers.java.facts.DbQueryFact;
import com.codex.parsers.java.facts.EsIndexFact;
import com.codex.parsers.java.facts.RelFact;
import com.codex.parsers.java.facts.SymbolFact;
import com.codex.parsers.java.logging.StructuredLogger;
import com.codex.parsers.java.options.ParserSettings;
import com.github.javaparser.JavaParser;
import com.github.javaparser.ParseResult;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.ConstructorDeclaration;
import com.github.javaparser.ast.body.EnumDeclaration;
import com.github.javaparser.ast.body.FieldDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.VariableDeclarator;

import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

public final class JavaFileAnalyzer {
    private final ParserSettings settings;
    private final StructuredLogger logger;
    private final JavaParser javaParser;

    public JavaFileAnalyzer(ParserSettings settings, StructuredLogger logger) {
        this.settings = settings;
        this.logger = logger;
        this.javaParser = new JavaParser();
    }

    public AnalysisResult analyze(Path absolutePath) throws IOException {
        ParseResult<CompilationUnit> result = javaParser.parse(absolutePath);
        if (!result.isSuccessful() || result.getResult().isEmpty()) {
            logger.warn("parse_failure", Map.of(
                    "file", normalizePath(absolutePath),
                    "problems", result.getProblems().toString()
            ));
            return new AnalysisResult(List.of(), List.of(), List.of(), List.of());
        }

        CompilationUnit cu = result.getResult().get();
        String fileId = "file:" + normalizePath(absolutePath);

        List<SymbolFact> symbols = new ArrayList<SymbolFact>();
        List<RelFact> relations = new ArrayList<RelFact>();
        HashSet<String> esIndexSet = new HashSet<>();
        collectClassSymbols(cu, fileId, symbols);
        collectMethodSymbols(cu, fileId, symbols, relations, esIndexSet);
        collectConstructorSymbols(cu, fileId, symbols);
        collectFieldSymbols(cu, fileId, symbols);

        List<DbQueryFact> queries = CqlQueryExtractor.extract(cu);

        List<EsIndexFact> esIndexes = esIndexSet.stream()
                .map(index -> new EsIndexFact("esi:" + index, index))
                .collect(Collectors.toList());

        return new AnalysisResult(symbols, queries, relations, esIndexes);
    }

    private void collectClassSymbols(CompilationUnit cu, String fileId, List<SymbolFact> sink) {
        cu.findAll(ClassOrInterfaceDeclaration.class).forEach(declaration -> {
            String fqName = buildClassName(cu, declaration.getNameAsString());
            String id = "sym:" + fqName;
            List<String> annotations = declaration.getAnnotations().stream()
                    .map(annotation -> annotation.getName().getIdentifier())
                    .collect(Collectors.toList());
            List<String> tags = SpringAnnotationInspector.tags(declaration);
            int start = declaration.getRange().map(range -> range.begin.line).orElse(-1);
            int end = declaration.getRange().map(range -> range.end.line).orElse(-1);
            sink.add(new SymbolFact(id, declaration.isInterface() ? "INTERFACE" : "CLASS", declaration.getNameAsString(), fqName, fileId, start, end, annotations, tags));
        });

        cu.findAll(EnumDeclaration.class).forEach(enumDecl -> {
            String fqName = buildClassName(cu, enumDecl.getNameAsString());
            String id = "sym:" + fqName;
            List<String> annotations = enumDecl.getAnnotations().stream()
                    .map(annotation -> annotation.getName().getIdentifier())
                    .collect(Collectors.toList());
            List<String> tags = SpringAnnotationInspector.tags(enumDecl);
            int start = enumDecl.getRange().map(range -> range.begin.line).orElse(-1);
            int end = enumDecl.getRange().map(range -> range.end.line).orElse(-1);
            sink.add(new SymbolFact(id, "ENUM", enumDecl.getNameAsString(), fqName, fileId, start, end, annotations, tags));
        });
    }

    private void collectMethodSymbols(CompilationUnit cu, String fileId, List<SymbolFact> sink, List<RelFact> relations, HashSet<String> esIndexCollector) {
        cu.findAll(MethodDeclaration.class).forEach(method -> {
            Optional<String> owner = method.findAncestor(ClassOrInterfaceDeclaration.class)
                    .map(coid -> buildClassName(cu, coid.getNameAsString()));
            String ownerName = owner.orElseGet(() -> cu.getPackageDeclaration().map(pd -> pd.getName().asString()).orElse(""));
            String fqName = ownerName.isEmpty() ? method.getNameAsString() : ownerName + "#" + buildMethodSignature(method);
            String id = "sym:" + fqName;
            List<String> annotations = method.getAnnotations().stream()
                    .map(annotation -> annotation.getName().getIdentifier())
                    .collect(Collectors.toList());
            List<String> tags = SpringAnnotationInspector.tags(method);
            int start = method.getRange().map(range -> range.begin.line).orElse(-1);
            int end = method.getRange().map(range -> range.end.line).orElse(-1);
            sink.add(new SymbolFact(id, "METHOD", method.getNameAsString(), fqName, fileId, start, end, annotations, tags));
            relations.addAll(ElasticsearchExtractor.detectRelations(method, id, esIndexCollector));
        });
    }

    private void collectConstructorSymbols(CompilationUnit cu, String fileId, List<SymbolFact> sink) {
        cu.findAll(ConstructorDeclaration.class).forEach(constructor -> {
            Optional<String> owner = constructor.findAncestor(ClassOrInterfaceDeclaration.class)
                    .map(coid -> buildClassName(cu, coid.getNameAsString()));
            if (owner.isEmpty()) {
                return;
            }
            String ownerName = owner.get();
            String params = constructor.getParameters().stream()
                    .map(param -> param.getType().asString())
                    .collect(Collectors.joining(","));
            String fqName = ownerName + "#<init>(" + params + ")";
            String id = "sym:" + fqName;
            List<String> annotations = constructor.getAnnotations().stream()
                    .map(annotation -> annotation.getName().getIdentifier())
                    .collect(Collectors.toList());
            List<String> tags = SpringAnnotationInspector.tags(constructor);
            int start = constructor.getRange().map(range -> range.begin.line).orElse(-1);
            int end = constructor.getRange().map(range -> range.end.line).orElse(-1);
            sink.add(new SymbolFact(id, "CONSTRUCTOR", constructor.getNameAsString(), fqName, fileId, start, end, annotations, tags));
        });
    }

    private void collectFieldSymbols(CompilationUnit cu, String fileId, List<SymbolFact> sink) {
        cu.findAll(FieldDeclaration.class).forEach(field -> {
            List<String> tags = SpringAnnotationInspector.tags(field);
            boolean hasDiTag = tags.stream().anyMatch(tag -> tag.startsWith("spring:injection") || tag.startsWith("spring:qualifier"));
            if (!hasDiTag) {
                return;
            }
            Optional<String> owner = field.findAncestor(ClassOrInterfaceDeclaration.class)
                    .map(coid -> buildClassName(cu, coid.getNameAsString()));
            String ownerName = owner.orElse("");
            List<String> annotations = field.getAnnotations().stream()
                    .map(annotation -> annotation.getName().getIdentifier())
                    .collect(Collectors.toList());
            for (VariableDeclarator variable : field.getVariables()) {
                String simpleName = variable.getNameAsString();
                String fqName = ownerName.isEmpty() ? simpleName : ownerName + "#" + simpleName;
                String id = "sym:" + fqName;
                int start = variable.getRange()
                        .map(range -> range.begin.line)
                        .orElseGet(() -> field.getRange().map(range -> range.begin.line).orElse(-1));
                int end = variable.getRange()
                        .map(range -> range.end.line)
                        .orElseGet(() -> field.getRange().map(range -> range.end.line).orElse(-1));
                sink.add(new SymbolFact(id, "FIELD", simpleName, fqName, fileId, start, end, annotations, new ArrayList<>(tags)));
            }
        });
    }

    private String buildClassName(CompilationUnit cu, String simpleName) {
        String pkg = cu.getPackageDeclaration().map(pd -> pd.getName().asString()).orElse("");
        if (pkg.isEmpty()) {
            return simpleName;
        }
        return pkg + "." + simpleName;
    }

    private String buildMethodSignature(MethodDeclaration method) {
        String params = method.getParameters().stream()
                .map(param -> param.getType().asString())
                .collect(Collectors.joining(","));
        return method.getNameAsString() + "(" + params + ")";
    }

    private String normalizePath(Path absolutePath) {
        Path root = settings.repoRoot();
        Path relative = absolutePath;
        if (absolutePath.startsWith(root)) {
            relative = root.relativize(absolutePath);
        }
        return relative.toString().replace('\\', '/');
    }
}
