import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import ignore, { type Ignore } from "ignore";
import type { FileRecord, ScanOptions } from "./types.js";

const DEFAULT_IGNORE = [
  ".git/",
  ".gitignore",
  "node_modules/",
  "dist/",
  "build/",
  ".venv/",
  ".tox/",
  ".idea/",
  ".vscode/",
  "*.log",
];

async function loadIgnore(
  root: string,
  extraPatterns: string[] = [],
): Promise<Ignore> {
  const ig = ignore();
  ig.add(DEFAULT_IGNORE);
  const gitignorePath = path.join(root, ".gitignore");
  try {
    const raw = await readFile(gitignorePath, "utf8");
    ig.add(raw.split(/\r?\n/));
  } catch {
    // 没有 .gitignore の場合は無視
  }
  if (extraPatterns.length > 0) {
    ig.add(extraPatterns);
  }
  return ig;
}

function normalizePath(root: string, target: string): string {
  const rel = path.relative(root, target);
  return rel.split(path.sep).join("/");
}

async function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(`sha256:${hash.digest("hex")}`));
  });
}

export async function* scanRepository(
  options: ScanOptions,
): AsyncGenerator<FileRecord> {
  const {
    root,
    includeHash = false,
    changedFiles = null,
    ignorePatterns = [],
  } = options;
  const ig = await loadIgnore(root, ignorePatterns);
  const queue: string[] = [root];

  while (queue.length > 0) {
    const current = queue.pop()!;
    const dirents = await readdir(current, { withFileTypes: true });
    for (const dirent of dirents) {
      const absolute = path.join(current, dirent.name);
      const relative = normalizePath(root, absolute);
      const isDirectory = dirent.isDirectory();
      const checkPath = isDirectory ? `${relative}/` : relative;

      if (ig.ignores(checkPath)) {
        continue;
      }

      if (dirent.isSymbolicLink()) {
        continue;
      }

      if (isDirectory) {
        queue.push(absolute);
        continue;
      }

      if (changedFiles && !changedFiles.has(relative)) {
        continue;
      }

      const fileStat = await stat(absolute);
      if (!fileStat.isFile()) {
        continue;
      }

      let hash: string | undefined;
      if (includeHash) {
        hash = await hashFile(absolute);
      }

      yield {
        path: relative,
        size: fileStat.size,
        mtimeMs: fileStat.mtimeMs,
        hash,
      };
    }
  }
}
