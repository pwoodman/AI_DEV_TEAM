import { runAll } from "./index.js";
export function consumerB(results: string[]): void {
  runAll([() => results.push("b1")]);
}
