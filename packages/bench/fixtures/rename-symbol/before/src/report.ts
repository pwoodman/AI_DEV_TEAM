import { calcTotal } from "./totals.js";

export function reportLine(label: string, values: number[]): string {
  return `${label}: ${calcTotal(values)}`;
}
