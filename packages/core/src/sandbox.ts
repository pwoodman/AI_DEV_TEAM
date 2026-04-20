import { mkdir, rm, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Patch } from "@amase/contracts";

export async function ensureSandbox(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
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
