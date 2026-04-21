import { calcTotal } from "./totals.js";

export function cartTotal(prices: number[]): number {
  return calcTotal(prices);
}
