import { mkdir } from "node:fs/promises";
import type { SymbolRef } from "@amase/contracts";
import * as lancedb from "@lancedb/lancedb";

export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
}

export class VoyageEmbeddings implements EmbeddingProvider {
  constructor(
    private apiKey: string = process.env.VOYAGE_API_KEY ?? "",
    private model: string = "voyage-code-3",
  ) {
    if (!this.apiKey) throw new Error("VOYAGE_API_KEY not set");
  }

  async embed(texts: string[]): Promise<number[][]> {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ input: texts, model: this.model, input_type: "document" }),
    });
    if (!res.ok) throw new Error(`voyage: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
    return json.data.map((d) => d.embedding);
  }
}

export interface SymbolRecord extends SymbolRef {
  text: string;
  vector: number[];
}

export class EmbeddingStore {
  private db: lancedb.Connection | undefined;
  private table: lancedb.Table | undefined;
  constructor(
    private dbPath: string,
    private provider: EmbeddingProvider,
  ) {}

  async open(): Promise<void> {
    await mkdir(this.dbPath, { recursive: true });
    this.db = await lancedb.connect(this.dbPath);
    const names = await this.db.tableNames();
    if (names.includes("code_symbols")) {
      this.table = await this.db.openTable("code_symbols");
    }
  }

  async upsert(records: Omit<SymbolRecord, "vector">[]): Promise<void> {
    if (!this.db) throw new Error("EmbeddingStore not opened");
    if (records.length === 0) return;
    const vectors = await this.provider.embed(records.map((r) => r.text));
    const rows = records.map((r, i) => ({ ...r, vector: vectors[i]! }));
    if (!this.table) {
      this.table = await this.db.createTable("code_symbols", rows);
    } else {
      await this.table.add(rows);
    }
  }

  async search(query: string, k = 8): Promise<SymbolRecord[]> {
    if (!this.table) return [];
    const [vector] = await this.provider.embed([query]);
    if (!vector) return [];
    const results = await this.table.search(vector).limit(k).toArray();
    return results as unknown as SymbolRecord[];
  }
}
