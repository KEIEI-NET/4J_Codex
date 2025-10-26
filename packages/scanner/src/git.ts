import { promisify } from "node:util";
import { execFile } from "node:child_process";

const execFileAsync = promisify(execFile);

export async function listChangedFiles(
  root: string,
  sinceRef: string,
): Promise<Set<string> | null> {
  try {
    const args = ["diff", "--name-only", "--relative", sinceRef];
    const { stdout } = await execFileAsync("git", args, { cwd: root });
    const files = stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    return new Set(files);
  } catch {
    return null;
  }
}

export async function listUntrackedFiles(
  root: string,
): Promise<Set<string> | null> {
  try {
    const args = ["ls-files", "--others", "--exclude-standard"];
    const { stdout } = await execFileAsync("git", args, { cwd: root });
    const files = stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    return new Set(files);
  } catch {
    return null;
  }
}
