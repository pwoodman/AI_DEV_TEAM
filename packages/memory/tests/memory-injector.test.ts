import { expect, test, vi } from "vitest";
import { MemoryInjector } from "../src/memory-injector.js";
import type { EmbeddingProvider } from "../src/embeddings.js";

function makeStubProvider(vectors: number[][] = [[0.1, 0.2]]): EmbeddingProvider {
  return { embed: vi.fn().mockResolvedValue(vectors) };
}

function makeStubTable(rows: Record<string, unknown>[] = []) {
  return {
    search: vi.fn().mockReturnValue({
      limit: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue(rows),
      }),
    }),
    add: vi.fn().mockResolvedValue(undefined),
    createTable: vi.fn().mockResolvedValue(undefined),
  };
}

function makeStubDb(table: ReturnType<typeof makeStubTable>) {
  return {
    tableNames: vi.fn().mockResolvedValue(["task_outcomes"]),
    openTable: vi.fn().mockResolvedValue(table),
    createTable: vi.fn().mockResolvedValue(table),
    connect: vi.fn(),
  };
}

test("query returns empty array when provider throws", async () => {
  const provider: EmbeddingProvider = {
    embed: vi.fn().mockRejectedValue(new Error("no key")),
  };
  const injector = new MemoryInjector(provider, "/tmp/fake-db");
  const result = await injector.query("fix the bug", ["src/"]);
  expect(result).toEqual([]);
});

test("query returns empty array when timeout fires before provider responds", async () => {
  const provider: EmbeddingProvider = {
    embed: vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve([[0.1]]), 500)),
    ),
  };
  const injector = new MemoryInjector(provider, "/tmp/fake-db");
  const result = await injector.query("fix the bug", ["src/"]);
  expect(result).toEqual([]);
});

test("query filters results below 0.75 confidence", async () => {
  const provider = makeStubProvider();
  const table = makeStubTable([
    { goal: "fix null", summary: "fixed: fix null", result: "pass", filePaths: "[]", vector: [0.1], _distance: 0.4 },
    { goal: "add test", summary: "fixed: add test", result: "pass", filePaths: "[]", vector: [0.1], _distance: 0.1 },
  ]);
  const injector = new MemoryInjector(provider, "/tmp/fake-db");
  (injector as unknown as { table: unknown }).table = table;
  (injector as unknown as { opened: boolean }).opened = true;
  const result = await injector.query("fix the bug", ["src/"]);
  expect(result).toHaveLength(1);
  expect(result[0]!.summary).toBe("fixed: add test");
  expect(result[0]!.confidence).toBeGreaterThanOrEqual(0.75);
});

test("query caps results at 3", async () => {
  const provider = makeStubProvider();
  const rows = Array.from({ length: 6 }, (_, i) => ({
    goal: `task ${i}`,
    summary: `fixed: task ${i}`,
    result: "pass",
    filePaths: "[]",
    vector: [0.1],
    _distance: 0.05,
  }));
  const table = makeStubTable(rows);
  const injector = new MemoryInjector(provider, "/tmp/fake-db");
  (injector as unknown as { table: unknown }).table = table;
  (injector as unknown as { opened: boolean }).opened = true;
  const result = await injector.query("fix the bug", ["src/"]);
  expect(result).toHaveLength(3);
});

test("index does not throw when provider errors", () => {
  const provider: EmbeddingProvider = {
    embed: vi.fn().mockRejectedValue(new Error("network error")),
  };
  const injector = new MemoryInjector(provider, "/tmp/fake-db");
  expect(() => injector.index("fix the bug", ["src/"], true)).not.toThrow();
});
