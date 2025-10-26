package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"go/ast"
	"go/parser"
	"go/printer"
	"go/token"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"
)

type parseOptions struct {
	InputPath  string
	OutputPath string
	Options    string
}

func main() {
	rootCmd := &cobra.Command{
		Use:   "parsers-go",
		Short: "Codex Go parser (L1)",
	}

	rootCmd.AddCommand(newParseCommand())
	rootCmd.AddCommand(newVersionCommand())

	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}

func newParseCommand() *cobra.Command {
	opts := &parseOptions{}

	cmd := &cobra.Command{
		Use:   "parse",
		Short: "Parse Go sources into Codex Facts",
		RunE: func(cmd *cobra.Command, args []string) error {
			if opts.InputPath == "" || opts.OutputPath == "" {
				return errors.New("both --in and --out must be provided")
			}

			inputPath := filepath.Clean(opts.InputPath)
			if _, err := os.Stat(inputPath); err != nil {
				return fmt.Errorf("input file error: %w", err)
			}

			records, err := loadInputRecords(inputPath)
			if err != nil {
				return err
			}

			facts, err := analyzeRecords(records)
			if err != nil {
				return err
			}

			return writeFacts(opts.OutputPath, facts)
		},
	}

	cmd.Flags().StringVar(&opts.InputPath, "in", "", "Path to JSONL file describing input files")
	cmd.Flags().StringVar(&opts.OutputPath, "out", "", "Path to write raw facts JSONL")
	cmd.Flags().StringVar(&opts.Options, "opts", "", "Additional options as JSON string")
	cmd.MarkFlagFilename("in")
	cmd.MarkFlagFilename("out")

	return cmd
}

func newVersionCommand() *cobra.Command {
	return &cobra.Command{
		Use:   "version",
		Short: "Print parser version",
		RunE: func(cmd *cobra.Command, args []string) error {
			fmt.Println("Codex Go parser v0.0.1")
			return nil
		},
	}
}

type inputRecord struct {
	Path     string  `json:"path"`
	Contents *string `json:"contents"`
}

type fact map[string]interface{}

func loadInputRecords(path string) ([]inputRecord, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	var records []inputRecord
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var record inputRecord
		if err := json.Unmarshal([]byte(line), &record); err != nil {
			return nil, fmt.Errorf("parse input JSONL: %w", err)
		}
		if record.Path == "" {
			return nil, errors.New("input record missing path")
		}
		records = append(records, record)
	}

	if err := scanner.Err(); err != nil {
		return nil, err
	}
	return records, nil
}

func analyzeRecords(records []inputRecord) ([]fact, error) {
	var facts []fact
	seen := make(map[string]struct{})
	fset := token.NewFileSet()

	for _, record := range records {
		absolutePath, err := filepath.Abs(record.Path)
		if err != nil {
			return nil, err
		}
		if _, ok := seen[absolutePath]; ok {
			continue
		}
		seen[absolutePath] = struct{}{}

		var src []byte
		if record.Contents != nil {
			src = []byte(*record.Contents)
		} else {
			src, err = os.ReadFile(absolutePath)
			if err != nil {
				return nil, err
			}
		}

		file, err := parser.ParseFile(fset, absolutePath, src, parser.ParseComments)
		if err != nil {
			return nil, err
		}

		relPath, err := filepath.Rel(".", absolutePath)
		if err != nil {
			relPath = absolutePath
		}

		facts = append(facts, fact{
			"type":     "File",
			"language": "Go",
			"path":     filepath.ToSlash(relPath),
		})

		facts = append(facts, extractImports(file, relPath)...)
		facts = append(facts, extractSymbols(fset, file, relPath)...)
		facts = append(facts, extractCalls(fset, file, relPath)...)
	}

	return facts, nil
}

func extractImports(file *ast.File, relPath string) []fact {
	var facts []fact
	for _, spec := range file.Imports {
		pathValue := strings.Trim(spec.Path.Value, "\"")
		facts = append(facts, fact{
			"type":     "Import",
			"language": "Go",
			"file":     filepath.ToSlash(relPath),
			"path":     pathValue,
		})
	}
	return facts
}

func extractSymbols(fset *token.FileSet, file *ast.File, relPath string) []fact {
	var facts []fact
	for _, decl := range file.Decls {
		fn, ok := decl.(*ast.FuncDecl)
		if !ok || fn.Name == nil {
			continue
		}
		start := fset.Position(fn.Name.Pos()).Line
		receiver := ""
		if fn.Recv != nil && len(fn.Recv.List) > 0 {
			var buf bytes.Buffer
			_ = printer.Fprint(&buf, fset, fn.Recv.List[0].Type)
			receiver = buf.String()
		}
		facts = append(facts, fact{
			"type":      "Symbol",
			"language":  "Go",
			"file":      filepath.ToSlash(relPath),
			"name":      fn.Name.Name,
			"kind":      "function",
			"receiver":  receiver,
			"startLine": start,
			"exported":  fn.Name.IsExported(),
		})
	}
	return facts
}

func extractCalls(fset *token.FileSet, file *ast.File, relPath string) []fact {
	var facts []fact
	ast.Inspect(file, func(n ast.Node) bool {
		call, ok := n.(*ast.CallExpr)
		if !ok {
			return true
		}

		var callee string
		var receiver string

		switch fun := call.Fun.(type) {
		case *ast.Ident:
			callee = fun.Name
		case *ast.SelectorExpr:
			callee = fun.Sel.Name
			var buf bytes.Buffer
			_ = printer.Fprint(&buf, fset, fun.X)
			receiver = buf.String()
		default:
			var buf bytes.Buffer
			_ = printer.Fprint(&buf, fset, fun)
			callee = buf.String()
		}

		if callee == "" {
			return true
		}

		var args []string
		for _, arg := range call.Args {
			var buf bytes.Buffer
			_ = printer.Fprint(&buf, fset, arg)
			args = append(args, buf.String())
		}

		pos := fset.Position(call.Lparen)
		facts = append(facts, fact{
			"type":      "Call",
			"language":  "Go",
			"file":      filepath.ToSlash(relPath),
			"callee":    callee,
			"receiver":  receiver,
			"arguments": args,
			"startLine": pos.Line,
		})

		return true
	})

	return facts
}

func writeFacts(outputPath string, facts []fact) error {
	file, err := os.Create(filepath.Clean(outputPath))
	if err != nil {
		return err
	}
	defer file.Close()

	encoder := json.NewEncoder(file)
	for _, fact := range facts {
		if err := encoder.Encode(fact); err != nil {
			return err
		}
	}
	return nil
}
