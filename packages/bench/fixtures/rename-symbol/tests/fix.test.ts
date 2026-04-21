import { describe, expect, it } from "vitest";
import { calculateTotal } from "../src/totals.js";
import { cartTotal } from "../src/cart.js";
import { reportLine } from "../src/report.js";

describe("rename-symbol", () => {
  it("exports calculateTotal", () => {
    expect(calculateTotal([1, 2, 3])).toBe(6);
  });
  it("cartTotal uses the renamed function", () => {
    expect(cartTotal([10, 20])).toBe(30);
  });
  it("reportLine uses the renamed function", () => {
    expect(reportLine("sum", [1, 2, 3])).toBe("sum: 6");
  });
});
