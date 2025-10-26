package com.codex.parsers.java;

import com.codex.parsers.java.commands.CommandRegistry;
import com.codex.parsers.java.commands.PluginCommand;
import com.codex.parsers.java.logging.StructuredLogger;

import java.io.PrintStream;
import java.util.Arrays;
import java.util.Optional;

/**
 * Entry point for the Codex Java parser plugin.
 * <p>
 * Contract (per spec):
 * <pre>
 *   parsers-java parse --in files.jsonl --out facts.raw.jsonl --opts '{"classpath": [...]}'
 * </pre>
 */
public final class JavaParserCli {
    private static final StructuredLogger LOGGER = StructuredLogger.create();

    JavaParserCli() {
    }

    public static void main(String[] args) {
        int exitCode = new JavaParserCli().run(args, System.out, System.err);
        if (exitCode != 0) {
            System.exit(exitCode);
        }
    }

    int run(String[] args, PrintStream out, PrintStream err) {
        if (args.length == 0 || Arrays.asList(args).contains("--help")) {
            printHelp(out);
            return 0;
        }

        String commandName = args[0];
        Optional<PluginCommand> command = CommandRegistry.find(commandName);
        if (command.isEmpty()) {
            err.printf("Unknown command: %s%n", commandName);
            printHelp(err);
            return 1;
        }

        String[] commandArgs = Arrays.copyOfRange(args, 1, args.length);
        try {
            return command.get().execute(commandArgs);
        } catch (Exception ex) {
            LOGGER.error("command_failed", commandName, ex);
            err.printf("Command failed: %s (%s)%n", commandName, ex.getMessage());
            return 1;
        }
    }

    private void printHelp(PrintStream out) {
        out.println("Usage: parsers-java <command> [options]");
        out.println();
        out.println("Commands:");
        CommandRegistry.list().forEach(cmd -> out.printf("  %-10s %s%n", cmd.name(), cmd.description()));
        out.println();
        out.println("Common options:");
        out.println("  --help       Show this help");
    }
}
