import { describe, expect, it } from "vitest";
import { mean, stdev, welchT, welchPValueTwoSided, welchCI95 } from "../src/stats.js";

describe("stats", () => {
  it("mean of [1,2,3,4,5] is 3", () => {
    expect(mean([1, 2, 3, 4, 5])).toBe(3);
  });
  it("mean of empty throws", () => {
    expect(() => mean([])).toThrow();
  });
  it("stdev of [2,4,4,4,5,5,7,9] is ~2.1381 (sample stdev, Bessel-corrected)", () => {
    expect(stdev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.1381, 3);
  });
  it("stdev of single value throws (needs n>=2)", () => {
    expect(() => stdev([5])).toThrow();
  });
  it("welchT for identical samples is 0", () => {
    expect(welchT([1, 2, 3], [1, 2, 3])).toBe(0);
  });
  it("welchT for [10,11,12] vs [1,2,3] is clearly positive and large", () => {
    expect(welchT([10, 11, 12], [1, 2, 3])).toBeGreaterThan(5);
  });
  it("welchPValueTwoSided for identical samples ~1", () => {
    expect(welchPValueTwoSided([1, 2, 3], [1, 2, 3])).toBeGreaterThan(0.9);
  });
  it("welchPValueTwoSided for widely separated samples < 0.05", () => {
    expect(
      welchPValueTwoSided([100, 101, 102, 103], [1, 2, 3, 4]),
    ).toBeLessThan(0.05);
  });
  it("welchCI95 returns [lo, hi] with lo<=mean diff<=hi", () => {
    const a = [10, 11, 12, 13];
    const b = [1, 2, 3, 4];
    const [lo, hi] = welchCI95(a, b);
    const diff = mean(a) - mean(b);
    expect(lo).toBeLessThanOrEqual(diff);
    expect(hi).toBeGreaterThanOrEqual(diff);
  });
});
