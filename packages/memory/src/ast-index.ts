import { stat } from "node:fs/promises";
import type { SymbolRef } from "@amase/contracts";
import { Project, type SourceFile, SyntaxKind } from "ts-morph";

interface CacheEntry {
  mtimeMs: number;
  source: SourceFile;
}

export class ASTIndex {
  private project: Project;
  private cache = new Map<string, CacheEntry>();

  constructor(tsConfigFilePath?: string) {
    this.project = tsConfigFilePath
      ? new Project({ tsConfigFilePath })
      : new Project({ useInMemoryFileSystem: false });
  }

  private async source(path: string): Promise<SourceFile> {
    const s = await stat(path);
    const cached = this.cache.get(path);
    if (cached && cached.mtimeMs === s.mtimeMs) return cached.source;
    const source = this.project.addSourceFileAtPath(path);
    await source.refreshFromFileSystem();
    this.cache.set(path, { mtimeMs: s.mtimeMs, source });
    return source;
  }

  async getSlice(path: string, symbolName: string): Promise<string | undefined> {
    const src = await this.source(path);
    const fn = src.getFunction(symbolName);
    if (fn) return fn.getText();
    const cls = src.getClass(symbolName);
    if (cls) return cls.getText();
    const iface = src.getInterface(symbolName);
    if (iface) return iface.getText();
    const type = src.getTypeAlias(symbolName);
    if (type) return type.getText();
    return undefined;
  }

  async listSymbols(path: string): Promise<SymbolRef[]> {
    const src = await this.source(path);
    const out: SymbolRef[] = [];
    for (const fn of src.getFunctions()) {
      const name = fn.getName();
      if (name) out.push({ path, name, kind: "function" });
    }
    for (const cls of src.getClasses()) {
      const name = cls.getName();
      if (name) out.push({ path, name, kind: "class" });
    }
    for (const iface of src.getInterfaces())
      out.push({ path, name: iface.getName(), kind: "interface" });
    for (const t of src.getTypeAliases()) out.push({ path, name: t.getName(), kind: "type" });
    for (const v of src.getVariableDeclarations()) {
      if (v.getParentIfKind(SyntaxKind.VariableDeclarationList)) {
        out.push({ path, name: v.getName(), kind: "const" });
      }
    }
    return out;
  }
}
