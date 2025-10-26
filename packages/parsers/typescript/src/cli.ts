#!/usr/bin/env node
import { Command } from "commander";
import { fileURLToPath } from "node:url";
import { createParseCommand } from "./commands/parse.js";
import { createVersionCommand } from "./commands/version.js";

export function buildCli(): Command {
  const program = new Command();
  program
    .name("parsers-typescript")
    .description("Codex TypeScript parser (L1)")
    .showHelpAfterError("(add --help for additional information)")
    .configureHelp({ sortSubcommands: true });

  program.addCommand(createParseCommand());
  program.addCommand(createVersionCommand());

  return program;
}

export async function main(argv: string[]) {
  const program = buildCli();
  await program.parseAsync(argv);
}

const entrypointPath = fileURLToPath(import.meta.url);
if (process.argv[1] === entrypointPath) {
  void main(process.argv);
}
