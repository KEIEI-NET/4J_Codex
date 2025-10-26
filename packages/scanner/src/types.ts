export interface FileRecord {
  /** Path relative to repository root, using forward slashes. */
  path: string;
  /** File byte size. */
  size: number;
  /** Last modified time in milliseconds since epoch. */
  mtimeMs: number;
  /** SHA256 hash (optional depending on scan options). */
  hash?: string;
}

export interface ScanOptions {
  /** Repository root to scan. */
  root: string;
  /** Whether to compute SHA256 hashes for files. */
  includeHash?: boolean;
  /** Limit results to files in this set (relative paths). */
  changedFiles?: Set<string> | null;
  /** Additional globs/patterns to ignore (unix style). */
  ignorePatterns?: string[];
}
