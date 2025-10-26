import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { scanRepository } from "./scanner.js";

async function collectFiles(
  root: string,
  options: Parameters<typeof scanRepository>[0],
) {
  const files = [];
  for await (const record of scanRepository({ ...options, root })) {
    files.push(record);
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

describe("scanRepository", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "scanner-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("enumerates files with hashes when requested", async () => {
    await writeFile(path.join(root, "a.txt"), "hello");
    await writeFile(path.join(root, "b.txt"), "world");

    const files = await collectFiles(root, { root, includeHash: true });

    expect(files).toHaveLength(2);
    expect(files[0]).toMatchObject({
      path: "a.txt",
      size: 5,
    });
    expect(files[0]?.hash?.startsWith("sha256:")).toBe(true);
    expect(files[1]).toMatchObject({
      path: "b.txt",
      size: 5,
    });
  });

  it("respects .gitignore patterns", async () => {
    await writeFile(path.join(root, ".gitignore"), "ignored/\n*.log\n");
    await mkdir(path.join(root, "ignored"));
    await writeFile(path.join(root, "ignored", "secret.txt"), "skip");
    await writeFile(path.join(root, "app.log"), "skip");
    await writeFile(path.join(root, "keep.txt"), "keep");

    const files = await collectFiles(root, { root });

    expect(files.map((f) => f.path)).toEqual(["keep.txt"]);
  });

  it("applies additional ignore patterns", async () => {
    await writeFile(path.join(root, "ignored.tmp"), "tmp");
    await writeFile(path.join(root, "keep.txt"), "keep");

    const files = await collectFiles(root, { root, ignorePatterns: ["*.tmp"] });
    expect(files.map((f) => f.path)).toEqual(["keep.txt"]);
  });

  it("filters by changed files set", async () => {
    await writeFile(path.join(root, "keep.txt"), "keep");
    await writeFile(path.join(root, "skip.txt"), "skip");

    const files = await collectFiles(root, {
      root,
      changedFiles: new Set(["keep.txt"]),
    });
    expect(files).toHaveLength(1);
    expect(files[0]?.path).toBe("keep.txt");
  });
});
