import { mkdir } from "node:fs/promises";
import * as lancedb from "@lancedb/lancedb";
import type { EmbeddingProvider } from "./embeddings.js";

export interface PatternHint {
  summary: string;
  outcome: "fixed" | "regressed";
  confidence: number;
}

interface OutcomeRow {
  goal: string;
  filePaths: string;
  summary: string;
  result: "pass" | "fail";
  vector: number[];
  _distance?: number;
}

const QUERY_TIMEOUT_MS = 200;
const MIN_CONFIDENCE = 0.75;
const MAX_PATTERNS = 3;

export class MemoryInjector {
  private db: lancedb.Connection | undefined;
  private table: lancedb.Table | undefined;
  private opened = false;

  constructor(
    private provider: EmbeddingProvider,
    private dbPath: string,
  ) {}

  private async open(): Promise<void> {
    if (this.opened) return;
    this.opened = true;
    await mkdir(this.dbPath, { recursive: true });
    this.db = await lancedb.connect(this.dbPath);
    const names = await this.db.tableNames();
    if (names.includes("task_outcomes")) {
      this.table = await this.db.openTable("task_outcomes");
    }
  }

  async query(goal: string, _allowedPaths: string[]): Promise<PatternHint[]> {
    const timeout = new Promise<PatternHint[]>((resolve) =>
      setTimeout(() => resolve([]), QUERY_TIMEOUT_MS),
    );
    return Promise.race([this._query(goal), timeout]).catch(() => []);
  }

  private async _query(goal: string): Promise<PatternHint[]> {
    await this.open();
    if (!this.table) return [];
    const [vector] = await this.provider.embed([goal]);
    if (!vector) return [];
    const rows = (await this.table
      .search(vector)
      .limit(MAX_PATTERNS * 3)
      .toArray()) as OutcomeRow[];
    return rows
      .map((r) => ({
        summary: r.summary,
        outcome: (r.result === "pass" ? "fixed" : "regressed") as "fixed" | "regressed",
        confidence: Math.max(0, 1 - (r._distance ?? 1)),
      }))
      .filter((h) => h.confidence >= MIN_CONFIDENCE)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, MAX_PATTERNS);
  }

  index(goal: string, allowedPaths: string[], pass: boolean): void {
    void this._index(goal, allowedPaths, pass).catch(() => {});
  }

  private async _index(goal: string, allowedPaths: string[], pass: boolean): Promise<void> {
    await this.open();
    if (!this.db) return;
    const summary = `${pass ? "fixed" : "failed"}: ${goal.slice(0, 40)}`;
    const result: "pass" | "fail" = pass ? "pass" : "fail";
    const [vector] = await this.provider.embed([goal]);
    if (!vector) return;
    const row: OutcomeRow = {
      goal,
      filePaths: JSON.stringify(allowedPaths),
      summary,
      result,
      vector,
    };
    if (!this.table) {
      this.table = await this.db.createTable("task_outcomes", [row as unknown as Record<string, unknown>]);
    } else {
      await this.table.add([row as unknown as Record<string, unknown>]);
    }
  }
}
