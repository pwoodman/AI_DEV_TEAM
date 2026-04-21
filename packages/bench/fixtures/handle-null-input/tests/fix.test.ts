import { describe, expect, it } from "vitest";
import { sumList } from "../src/sumList.js";

describe("handle-null-input", () => {
  it("returns 0 for null", () => {
    expect(sumList(null as unknown as number[])).toBe(0);
  });
  it("returns 0 for undefined", () => {
    expect(sumList(undefined as unknown as number[])).toBe(0);
  });
  it("sums normal arrays", () => {
    expect(sumList([1, 2, 3])).toBe(6);
  });
  it("returns 0 for empty array", () => {
    expect(sumList([])).toBe(0);
  });
});
