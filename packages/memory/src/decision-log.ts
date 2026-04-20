import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { type DecisionLogEntry, DecisionLogEntrySchema } from "@amase/contracts";

export class DecisionLog {
  constructor(private path: string) {}

  async append(entry: DecisionLogEntry): Promise<void> {
    const validated = DecisionLogEntrySchema.parse(entry);
    await mkdir(dirname(this.path), { recursive: true });
    await appendFile(this.path, `${JSON.stringify(validated)}\n`, "utf8");
  }

  async readAll(): Promise<DecisionLogEntry[]> {
    let raw: string;
    try {
      raw = await readFile(this.path, "utf8");
    } catch {
      return [];
    }
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => DecisionLogEntrySchema.parse(JSON.parse(line)));
  }

  async tail(n: number): Promise<DecisionLogEntry[]> {
    const all = await this.readAll();
    return all.slice(-n);
  }
}
