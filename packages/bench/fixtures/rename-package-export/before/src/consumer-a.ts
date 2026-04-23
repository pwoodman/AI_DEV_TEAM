import { runAll } from "./index.js";
export function consumerA(results: string[]): void {
  runAll([() => results.push("a1"), () => results.push("a2")]);
}
