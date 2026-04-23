import { expect, test } from "vitest";
import { runQueue } from "../src/index.js";
import { consumerA } from "../src/consumer-a.js";
import { consumerB } from "../src/consumer-b.js";

test("runQueue executes jobs in order", () => {
  const results: string[] = [];
  runQueue([() => results.push("1"), () => results.push("2"), () => results.push("3")]);
  expect(results).toEqual(["1", "2", "3"]);
});

test("consumerA appends a1, a2 in order", () => {
  const results: string[] = [];
  consumerA(results);
  expect(results).toEqual(["a1", "a2"]);
});

test("consumerB appends b1", () => {
  const results: string[] = [];
  consumerB(results);
  expect(results).toEqual(["b1"]);
});
