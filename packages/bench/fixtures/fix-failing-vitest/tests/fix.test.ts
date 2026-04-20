import { describe, expect, it } from "vitest";
import { sum } from "../src/sum.js";
describe("fixed sum", () => {
  it("adds", () => expect(sum(2, 3)).toBe(5));
});
