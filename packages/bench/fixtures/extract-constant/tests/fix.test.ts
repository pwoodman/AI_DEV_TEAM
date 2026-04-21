import { describe, expect, it } from "vitest";
import { SECONDS_PER_DAY, daysToSeconds, secondsToDays, isMoreThanADay } from "../src/time.js";

describe("extract-constant", () => {
  it("exports SECONDS_PER_DAY", () => {
    expect(SECONDS_PER_DAY).toBe(86400);
  });
  it("daysToSeconds works", () => {
    expect(daysToSeconds(2)).toBe(172800);
  });
  it("secondsToDays works", () => {
    expect(secondsToDays(172800)).toBe(2);
  });
  it("isMoreThanADay works", () => {
    expect(isMoreThanADay(90000)).toBe(true);
    expect(isMoreThanADay(60)).toBe(false);
  });
});
