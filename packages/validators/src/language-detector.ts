import { readFile } from "node:fs/promises";
import { extname } from "node:path";

const EXT_MAP: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".pyw": "python",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".cs": "csharp",
  ".cpp": "cpp",
  ".cc": "cpp",
  ".cxx": "cpp",
  ".hpp": "cpp",
  ".c": "c",
  ".h": "c",
  ".php": "php",
  ".rb": "ruby",
  ".swift": "swift",
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".dart": "dart",
  ".scala": "scala",
  ".sc": "scala",
  ".sh": "shell",
  ".bash": "shell",
  ".zsh": "shell",
  ".fish": "shell",
  ".sql": "sql",
  ".html": "html-css",
  ".htm": "html-css",
  ".css": "html-css",
  ".scss": "html-css",
  ".sass": "html-css",
  ".less": "html-css",
  ".r": "r",
  ".R": "r",
  ".lua": "lua",
};

const SHEBANG_MAP: Array<[RegExp, string]> = [
  [/python/, "python"],
  [/node/, "javascript"],
  [/ruby|rbenv/, "ruby"],
  [/php/, "php"],
  [/bash|sh|zsh|fish/, "shell"],
  [/lua/, "lua"],
  [/Rscript/, "r"],
];

export async function detectLanguages(files: string[]): Promise<string[]> {
  const detected = new Set<string>();
  for (const file of files) {
    const ext = extname(file);
    const mapped = EXT_MAP[ext] ?? EXT_MAP[ext.toLowerCase()];
    if (mapped) {
      detected.add(mapped);
      continue;
    }
    try {
      const content = await readFile(file, "utf8");
      const firstLine = content.split("\n")[0] ?? "";
      if (firstLine.startsWith("#!")) {
        for (const [re, lang] of SHEBANG_MAP) {
          if (re.test(firstLine)) {
            detected.add(lang);
            break;
          }
        }
      }
    } catch {
      // unreadable or missing file — skip
    }
  }
  return [...detected];
}
