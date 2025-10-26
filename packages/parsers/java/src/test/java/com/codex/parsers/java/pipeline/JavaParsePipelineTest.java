package com.codex.parsers.java.pipeline;

import com.codex.parsers.java.io.FileEntry;
import com.codex.parsers.java.options.ParseOptions;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JavaParsePipelineTest {
    @Test
    void parsesSimpleServiceAndCql() throws IOException {
        Path repo = Files.createTempDirectory("java-parser-repo");
        Path sourceDir = repo.resolve("src/main/java/com/example");
        Files.createDirectories(sourceDir);
        Path sourceFile = sourceDir.resolve("DemoService.java");
        Files.writeString(sourceFile, "package com.example;\n\nimport org.springframework.stereotype.Service;\n\n@Service\npublic class DemoService {\n    public void run() {\n        String cql = \"SELECT * FROM ks.events WHERE tenant_id=? ALLOW FILTERING\";\n    }\n}\n");

        Path input = Files.createTempFile("files", ".jsonl");
        Files.writeString(input, "{\"type\":\"File\",\"path\":\"src/main/java/com/example/DemoService.java\",\"lang\":\"java\"}\n");

        Path output = Files.createTempFile("facts", ".jsonl");

        ParseOptions options = new ParseOptions(input, output, null, Map.of(
                "repoRoot", repo.toString()
        ), null);

        JavaParsePipeline pipeline = new JavaParsePipeline();
        PipelineSummary summary = pipeline.run(options, null);

        List<String> lines = Files.readAllLines(output);
        assertTrue(lines.stream().anyMatch(line -> line.contains("\"type\":\"Symbol\"")));
        assertTrue(lines.stream().anyMatch(line -> line.contains("\"type\":\"DBQuery\"")));
        assertTrue(summary.symbolsEmitted() > 0);
        assertTrue(summary.queriesEmitted() > 0);
    }

    @Test
    void parsesDirectoryInput() throws IOException {
        Path repo = Files.createTempDirectory("java-parser-root");
        Path sourceDir = repo.resolve("src/main/java/com/example");
        Files.createDirectories(sourceDir);
        Path sourceFile = sourceDir.resolve("AnotherService.java");
        Files.writeString(sourceFile, "package com.example;\n\npublic class AnotherService {\n    public String hello() {\n        return \"hello\";\n    }\n}\n");

        Path output = Files.createTempFile("facts-dir", ".jsonl");

        ParseOptions options = new ParseOptions(null, output, repo, Map.of(), null);
        JavaParsePipeline pipeline = new JavaParsePipeline();

        FileEntry entry = new FileEntry("File", "src/main/java/com/example/AnotherService.java", "java");
        PipelineSummary summary = pipeline.run(options, List.of(entry));

        List<String> lines = Files.readAllLines(output);
        assertTrue(lines.stream().anyMatch(line -> line.contains("\"type\":\"Symbol\"")));
        assertTrue(summary.symbolsEmitted() > 0);
    }

    @Test
    void respectsMaxFilesLimit() throws IOException {
        Path repo = Files.createTempDirectory("java-parser-limit");
        Path sourceDir = repo.resolve("src/main/java/com/example");
        Files.createDirectories(sourceDir);
        Path file1 = sourceDir.resolve("FirstService.java");
        Path file2 = sourceDir.resolve("SecondService.java");
        Files.writeString(file1, "package com.example;\npublic class FirstService {}\n");
        Files.writeString(file2, "package com.example;\npublic class SecondService {}\n");

        Path input = Files.createTempFile("files-limit", ".jsonl");
        Files.writeString(input,
                "{\"type\":\"File\",\"path\":\"src/main/java/com/example/FirstService.java\",\"lang\":\"java\"}\n" +
                        "{\"type\":\"File\",\"path\":\"src/main/java/com/example/SecondService.java\",\"lang\":\"java\"}\n");
        Path output = Files.createTempFile("facts-limit", ".jsonl");

        ParseOptions options = new ParseOptions(input, output, null, Map.of("repoRoot", repo.toString()), 1);
        JavaParsePipeline pipeline = new JavaParsePipeline();
        PipelineSummary summary = pipeline.run(options, null);

        assertTrue(summary.filesProcessed() == 1);
        List<String> lines = Files.readAllLines(output);
        assertTrue(lines.size() > 0);
    }

    @Test
    void detectsSpringDiAnnotations() throws IOException {
        Path repo = Files.createTempDirectory("java-parser-di");
        Path sourceDir = repo.resolve("src/main/java/com/example");
        Files.createDirectories(sourceDir);

        Path serviceFile = sourceDir.resolve("AccountService.java");
        Files.writeString(serviceFile,
                "package com.example;\n" +
                        "import org.springframework.stereotype.Service;\n" +
                        "import org.springframework.beans.factory.annotation.Autowired;\n" +
                        "import org.springframework.beans.factory.annotation.Qualifier;\n" +
                        "\n@Service\n" +
                        "public class AccountService {\n" +
                        "    @Autowired\n" +
                        "    @Qualifier(\"primaryRepo\")\n" +
                        "    private AccountRepository repository;\n" +
                        "\n" +
                        "    @Autowired\n" +
                        "    public AccountService(@Qualifier(\"primaryRepo\") AccountRepository repository) {\n" +
                        "        this.repository = repository;\n" +
                        "    }\n" +
                        "}\n");

        Path repoFile = sourceDir.resolve("AccountRepository.java");
        Files.writeString(repoFile,
                "package com.example;\n" +
                        "public interface AccountRepository {}\n");

        Path input = Files.createTempFile("files-di", ".jsonl");
        Files.writeString(input,
                "{\"type\":\"File\",\"path\":\"src/main/java/com/example/AccountService.java\",\"lang\":\"java\"}\n" +
                        "{\"type\":\"File\",\"path\":\"src/main/java/com/example/AccountRepository.java\",\"lang\":\"java\"}\n");
        Path output = Files.createTempFile("facts-di", ".jsonl");

        ParseOptions options = new ParseOptions(input, output, null, Map.of("repoRoot", repo.toString()), null);
        JavaParsePipeline pipeline = new JavaParsePipeline();
        pipeline.run(options, null);

        ObjectMapper mapper = new ObjectMapper();
        List<JsonNode> nodes = Files.readAllLines(output).stream()
                .map(line -> {
                    try {
                        return mapper.readTree(line);
                    } catch (IOException e) {
                        throw new RuntimeException(e);
                    }
                })
                .collect(Collectors.toList());

        JsonNode classSymbol = nodes.stream()
                .filter(node -> "Symbol".equals(node.path("type").asText()) && "CLASS".equals(node.path("kind").asText()))
                .findFirst()
                .orElse(null);
        assertNotNull(classSymbol);
        assertTrue(containsTag(classSymbol, "spring:component:service"));

        JsonNode fieldSymbol = nodes.stream()
                .filter(node -> "Symbol".equals(node.path("type").asText())
                        && "FIELD".equals(node.path("kind").asText())
                        && "repository".equals(node.path("name").asText()))
                .findFirst()
                .orElse(null);
        assertNotNull(fieldSymbol);
        assertTrue(containsTag(fieldSymbol, "spring:injection:autowired"));
        assertTrue(containsTag(fieldSymbol, "spring:qualifier:primaryRepo"));

        JsonNode constructorSymbol = nodes.stream()
                .filter(node -> "Symbol".equals(node.path("type").asText())
                        && "CONSTRUCTOR".equals(node.path("kind").asText()))
                .findFirst()
                .orElse(null);
        assertNotNull(constructorSymbol);
        assertTrue(containsTag(constructorSymbol, "spring:injection:autowired"));
    }

    private boolean containsTag(JsonNode node, String tag) {
        if (node == null || !node.has("tags")) {
            return false;
        }
        for (JsonNode element : node.get("tags")) {
            if (tag.equals(element.asText())) {
                return true;
            }
        }
        return false;
    }

    @Test
    void detectsElasticsearchRelations() throws IOException {
        Path repo = Files.createTempDirectory("java-parser-es");
        Path sourceDir = repo.resolve("src/main/java/com/example");
        Files.createDirectories(sourceDir);

        Path file = sourceDir.resolve("SearchService.java");
        Files.writeString(file,
                "package com.example;\n" +
                        "import org.elasticsearch.client.RestHighLevelClient;\n" +
                        "import org.elasticsearch.action.search.SearchRequest;\n" +
                        "import org.elasticsearch.client.RequestOptions;\n" +
                        "public class SearchService {\n" +
                        "    private final RestHighLevelClient client;\n" +
                        "    public SearchService(RestHighLevelClient client) { this.client = client; }\n" +
                        "    public void find() throws Exception {\n" +
                        "        client.search(new SearchRequest(\"logs-2025\"), RequestOptions.DEFAULT);\n" +
                        "    }\n" +
                        "}\n");

        Path input = Files.createTempFile("files-es", ".jsonl");
        Files.writeString(input, "{\"type\":\"File\",\"path\":\"src/main/java/com/example/SearchService.java\",\"lang\":\"java\"}\n");
        Path output = Files.createTempFile("facts-es", ".jsonl");

        ParseOptions options = new ParseOptions(input, output, null, Map.of("repoRoot", repo.toString()), null);
        JavaParsePipeline pipeline = new JavaParsePipeline();
        pipeline.run(options, null);

        ObjectMapper mapper = new ObjectMapper();
        List<JsonNode> nodes = Files.readAllLines(output).stream()
                .map(line -> {
                    try {
                        return mapper.readTree(line);
                    } catch (IOException e) {
                        throw new RuntimeException(e);
                    }
                })
                .collect(Collectors.toList());

        JsonNode relation = nodes.stream()
                .filter(node -> "Rel".equals(node.path("type").asText())
                        && "QUERIES_ES".equals(node.path("rel").asText()))
                .findFirst()
                .orElse(null);
        assertNotNull(relation);
        assertTrue(relation.path("to").asText().endsWith("logs-2025"));
        assertTrue("search".equals(relation.path("op").asText()));

        JsonNode indexNode = nodes.stream()
                .filter(node -> "ESIndex".equals(node.path("type").asText()))
                .findFirst()
                .orElse(null);
        assertNotNull(indexNode);
        assertTrue("logs-2025".equals(indexNode.path("name").asText()));
    }
}
