import type { LangAdapter } from "./lang-adapter.js";

export class LangAdapterRegistry {
  private readonly byLanguage = new Map<string, LangAdapter>();
  private readonly byExtension = new Map<string, LangAdapter>();

  register(adapter: LangAdapter): void {
    this.byLanguage.set(adapter.language, adapter);
    for (const ext of adapter.extensions) {
      this.byExtension.set(ext.toLowerCase(), adapter);
    }
  }

  getByLanguage(language: string): LangAdapter | undefined {
    return this.byLanguage.get(language);
  }

  getByExtension(ext: string): LangAdapter | undefined {
    return this.byExtension.get(ext.toLowerCase());
  }

  getForLanguages(languages: string[]): LangAdapter[] {
    const result: LangAdapter[] = [];
    const seen = new Set<string>();
    for (const lang of languages) {
      const adapter = this.byLanguage.get(lang);
      if (adapter && !seen.has(adapter.language)) {
        result.push(adapter);
        seen.add(adapter.language);
      }
    }
    return result;
  }
}

export const adapterRegistry = new LangAdapterRegistry();
