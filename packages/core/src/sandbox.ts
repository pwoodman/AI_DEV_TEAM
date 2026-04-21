import { mkdir, readdir, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import type { Patch } from "@amase/contracts";

export async function ensureSandbox(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function seedSandbox(sourceDir: string, sandboxDir: string): Promise<void> {
  await mkdir(sandboxDir, { recursive: true });
  const walk = async (dir: string): Promise<void> => {
    const names = await readdir(dir).catch(() => []);
    for (const name of names) {
      if (name === "node_modules" || name === ".amase" || name.startsWith(".git")) continue;
      const abs = join(dir, name);
      const s = await stat(abs).catch(() => null);
      if (!s) continue;
      const rel = relative(sourceDir, abs);
      const dest = join(sandboxDir, rel);
      if (s.isDirectory()) {
        await mkdir(dest, { recursive: true });
        await walk(abs);
      } else if (s.isFile()) {
        await mkdir(dirname(dest), { recursive: true });
        const content = await readFile(abs);
        await writeFile(dest, content);
      }
    }
  };
  await walk(sourceDir);
}

export async function applyPatches(workspace: string, patches: Patch[]): Promise<void> {
  for (const p of patches) {
    const abs = join(workspace, p.path);
    if (p.op === "delete") {
      try {
        await unlink(abs);
      } catch {
        // ignore missing
      }
      continue;
    }
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, p.content, "utf8");
  }
}

export async function resetSandbox(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
  await mkdir(path, { recursive: true });
}
