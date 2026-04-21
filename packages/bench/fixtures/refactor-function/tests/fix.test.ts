import { describe, expect, it } from "vitest";
import { formatCurrency, printInvoice, printReceipt } from "../src/format.js";

describe("refactor-function", () => {
  it("exports formatCurrency helper", () => {
    expect(formatCurrency(1)).toBe("$1.00");
    expect(formatCurrency(12.5)).toBe("$12.50");
  });
  it("printInvoice still works", () => {
    expect(printInvoice(9.5)).toBe("Invoice: $9.50");
  });
  it("printReceipt still works", () => {
    expect(printReceipt(3)).toBe("Receipt: $3.00");
  });
});
