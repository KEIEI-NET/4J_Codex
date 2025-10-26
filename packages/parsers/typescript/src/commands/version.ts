import { Command } from "commander";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const pkgPath = fileURLToPath(new URL("../../package.json", import.meta.url));
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version?: string };

export function createVersionCommand(): Command {
  return new Command("version")
    .description("Print parser version information")
    .action(() => {
      console.log(`Codex TypeScript parser ${pkg.version}`);
    });
}
