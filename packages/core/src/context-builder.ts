import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";

// ---------------------------------------------------------------------------
// Context packing constants
// ---------------------------------------------------------------------------
const MAX_FILE_BYTES_SMALL = 6_000; // files under 6KB: include fully
const MAX_FILE_BYTES_LARGE = 12_000; // files 6-12KB: smart slice
const MAX_FILE_BYTES_CAP = 18_000; // absolute cap per file
const DEFAULT_TOTAL_BYTES = 16_000;

// ---------------------------------------------------------------------------
// Smart context file loading with file-size-aware packing
// ---------------------------------------------------------------------------
export async function buildContextFiles(
  workspace: string,
  allowedPaths: string[],
  budgetOverride?: number,
): Promise<Array<{ path: string; slice: string }>> {
  const maxTotal = budgetOverride ?? DEFAULT_TOTAL_BYTES;
  const out: Array<{ path: string; slice: string }> = [];
  let total = 0;

  const visit = async (rel: string): Promise<void> => {
    if (total >= maxTotal) return;
    const abs = join(workspace, rel);
    let s: import("node:fs").Stats;
    try {
      s = await stat(abs);
    } catch {
      return;
    }
    if (s.isDirectory()) {
      const names = await readdir(abs);
      await Promise.all(
        names.map((name) => {
          if (name === "node_modules" || name === ".amase" || name.startsWith(".git"))
            return Promise.resolve();
          return visit(relative(workspace, join(abs, name)).replace(/\\/g, "/"));
        }),
      );
      return;
    }
    if (!s.isFile()) return;
    const content = await readFile(abs, "utf8").catch(() => "");
    if (!content) return;

    let slice: string;
    const size = content.length;
    if (size <= MAX_FILE_BYTES_SMALL) {
      slice = content;
    } else if (size <= MAX_FILE_BYTES_LARGE) {
      // Large file: grab first 60% + last 40% to preserve structure
      const splitAt = Math.floor(size * 0.6);
      const firstPart = content.slice(0, splitAt);
      const lastPart = content.slice(splitAt);
      // Take up to MAX_FILE_BYTES_LARGE total
      const available = MAX_FILE_BYTES_LARGE - firstPart.length;
      const truncatedLastPart = lastPart.slice(0, Math.max(0, available - 100)); // Reserve space for truncation message
      slice = `${firstPart + truncatedLastPart}\n/* ... file truncated for context ... */`;
    } else {
      // Very large file: hard cap
      slice = content.slice(0, MAX_FILE_BYTES_CAP);
    }

    if (total + slice.length > maxTotal) return;
    total += slice.length;
    out.push({ path: rel, slice });
  };

  await Promise.all(allowedPaths.map((p) => visit(p)));
  return out;
}
