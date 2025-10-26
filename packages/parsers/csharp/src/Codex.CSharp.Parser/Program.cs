using System;
using System.CommandLine;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Tasks;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

var rootCommand = new RootCommand("Codex C# parser (L1)");

var parseCommand = new Command("parse", "Parse C# sources into Codex Facts");
var inputOption = new Option<FileInfo>("--in", description: "Path to JSONL file describing input files") { IsRequired = true };
var outputOption = new Option<FileInfo>("--out", description: "Path to write raw facts JSONL") { IsRequired = true };
var optsOption = new Option<string?>("--opts", description: "Additional options as JSON string");

parseCommand.AddOption(inputOption);
parseCommand.AddOption(outputOption);
parseCommand.AddOption(optsOption);

parseCommand.SetHandler(async (input, output, _) =>
{
    if (input is null || output is null)
    {
        throw new ArgumentException("Both --in and --out must be provided.");
    }

    if (!input.Exists)
    {
        throw new FileNotFoundException("Input file not found.", input.FullName);
    }

    var records = await LoadInputRecordsAsync(input).ConfigureAwait(false);
    var facts = await AnalyzeRecordsAsync(records).ConfigureAwait(false);
    await WriteFactsAsync(output, facts).ConfigureAwait(false);
}, inputOption, outputOption, optsOption);

var versionCommand = new Command("version", "Print parser version");
versionCommand.SetHandler(() =>
{
    Console.WriteLine("Codex C# parser v0.0.1");
});

rootCommand.AddCommand(parseCommand);
rootCommand.AddCommand(versionCommand);

return await rootCommand.InvokeAsync(args);

static async Task<List<InputRecord>> LoadInputRecordsAsync(FileInfo file)
{
    var records = new List<InputRecord>();
    await using var stream = file.OpenRead();
    using var reader = new StreamReader(stream);
    while (!reader.EndOfStream)
    {
        var line = (await reader.ReadLineAsync().ConfigureAwait(false))?.Trim();
        if (string.IsNullOrEmpty(line))
        {
            continue;
        }

        var record = JsonSerializer.Deserialize<InputRecord>(line);
        if (record is null || string.IsNullOrEmpty(record.Path))
        {
            throw new InvalidDataException("Invalid input record");
        }
        records.Add(record);
    }
    return records;
}

static async Task<List<Dictionary<string, object?>>> AnalyzeRecordsAsync(IEnumerable<InputRecord> records)
{
    var facts = new List<Dictionary<string, object?>>();
    var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

    foreach (var record in records)
    {
        var absolutePath = Path.GetFullPath(record.Path);
        if (!seen.Add(absolutePath))
        {
            continue;
        }

        var text = record.Contents ?? await File.ReadAllTextAsync(absolutePath).ConfigureAwait(false);
        var tree = CSharpSyntaxTree.ParseText(text);
        var root = tree.GetCompilationUnitRoot();

        var relativePath = GetRelativePath(absolutePath);
        facts.Add(new Dictionary<string, object?>
        {
            ["type"] = "File",
            ["language"] = "CSharp",
            ["path"] = relativePath
        });

        facts.AddRange(ExtractUsings(root, relativePath));
        facts.AddRange(ExtractTypes(root, relativePath));
        facts.AddRange(ExtractMethods(root, relativePath));
        facts.AddRange(ExtractInvocations(root, relativePath));
    }

    return facts;
}

static IEnumerable<Dictionary<string, object?>> ExtractUsings(CompilationUnitSyntax root, string filePath)
{
    foreach (var usingDirective in root.Usings)
    {
        yield return new Dictionary<string, object?>
        {
            ["type"] = "Import",
            ["language"] = "CSharp",
            ["file"] = filePath,
            ["namespace"] = usingDirective.Name.ToString()
        };
    }
}

static IEnumerable<Dictionary<string, object?>> ExtractTypes(CompilationUnitSyntax root, string filePath)
{
    foreach (var typeDecl in root.DescendantNodes().OfType<TypeDeclarationSyntax>())
    {
        var typeKind = typeDecl switch
        {
            ClassDeclarationSyntax => "class",
            StructDeclarationSyntax => "struct",
            RecordDeclarationSyntax recordDecl when recordDecl.ClassOrStructKeyword.IsKind(Microsoft.CodeAnalysis.CSharp.SyntaxKind.StructKeyword) => "record struct",
            RecordDeclarationSyntax => "record",
            InterfaceDeclarationSyntax => "interface",
            _ => "type"
        };

        yield return new Dictionary<string, object?>
        {
            ["type"] = "Symbol",
            ["language"] = "CSharp",
            ["file"] = filePath,
            ["name"] = typeDecl.Identifier.Text,
            ["kind"] = typeKind,
            ["startLine"] = GetLineNumber(typeDecl.Identifier)
        };
    }
}

static IEnumerable<Dictionary<string, object?>> ExtractMethods(CompilationUnitSyntax root, string filePath)
{
    foreach (var method in root.DescendantNodes().OfType<MethodDeclarationSyntax>())
    {
        yield return new Dictionary<string, object?>
        {
            ["type"] = "Symbol",
            ["language"] = "CSharp",
            ["file"] = filePath,
            ["name"] = method.Identifier.Text,
            ["kind"] = "method",
            ["returnType"] = method.ReturnType.ToString(),
            ["async"] = method.Modifiers.Any(m => m.IsKind(SyntaxKind.AsyncKeyword)),
            ["startLine"] = GetLineNumber(method.Identifier)
        };
    }

    foreach (var ctor in root.DescendantNodes().OfType<ConstructorDeclarationSyntax>())
    {
        yield return new Dictionary<string, object?>
        {
            ["type"] = "Symbol",
            ["language"] = "CSharp",
            ["file"] = filePath,
            ["name"] = ctor.Identifier.Text,
            ["kind"] = "constructor",
            ["startLine"] = GetLineNumber(ctor.Identifier)
        };
    }
}

static IEnumerable<Dictionary<string, object?>> ExtractInvocations(CompilationUnitSyntax root, string filePath)
{
    foreach (var invocation in root.DescendantNodes().OfType<InvocationExpressionSyntax>())
    {
        var expressionText = invocation.Expression.ToString();
        var arguments = invocation.ArgumentList.Arguments
            .Select(arg => arg.ToString())
            .ToArray();

        yield return new Dictionary<string, object?>
        {
            ["type"] = "Call",
            ["language"] = "CSharp",
            ["file"] = filePath,
            ["callee"] = expressionText,
            ["arguments"] = arguments,
            ["startLine"] = GetLineNumber(invocation)
        };
    }
}

static async Task WriteFactsAsync(FileInfo output, IEnumerable<Dictionary<string, object?>> facts)
{
    await using var stream = new FileStream(output.FullName, FileMode.Create, FileAccess.Write, FileShare.None);
    await using var writer = new StreamWriter(stream);

    foreach (var fact in facts)
    {
        var json = JsonSerializer.Serialize(fact, new JsonSerializerOptions
        {
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
        });
        await writer.WriteLineAsync(json).ConfigureAwait(false);
    }
}

static int GetLineNumber(SyntaxNode node) => node.GetLocation().GetLineSpan().StartLinePosition.Line + 1;

static int GetLineNumber(SyntaxToken token) => token.GetLocation().GetLineSpan().StartLinePosition.Line + 1;

static string GetRelativePath(string absolutePath)
{
    try
    {
        var relative = Path.GetRelativePath(Environment.CurrentDirectory, absolutePath);
        return string.IsNullOrWhiteSpace(relative) ? absolutePath : relative.Replace('\\', '/');
    }
    catch
    {
        return absolutePath.Replace('\\', '/');
    }
}

internal sealed record InputRecord(
    [property: JsonPropertyName("path")] string Path,
    [property: JsonPropertyName("contents")] string? Contents
);
