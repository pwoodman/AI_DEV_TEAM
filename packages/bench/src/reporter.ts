import type { BenchResult } from "./types.js";

export type Headline =
  | { status: "insufficient_signal"; bothPassed: number }
  | { status: "regression"; passRateDelta: number }
  | {
      status: "ok";
      tokenDelta: number;
      timeDelta: number;
      passRateDelta: number;
      bothPassed: number;
    };

export function reportHeadline(results: BenchResult[]): Headline {
  const byTask = new Map<string, { amase?: BenchResult; superpowers?: BenchResult }>();
  for (const r of results) {
    const entry = byTask.get(r.taskId) ?? {};
    entry[r.stack] = r;
    byTask.set(r.taskId, entry);
  }
  let amasePassed = 0;
  let spPassed = 0;
  let tokenA = 0;
  let tokenS = 0;
  let timeA = 0;
  let timeS = 0;
  let bothPassed = 0;
  const total = byTask.size;
  for (const [, { amase, superpowers }] of byTask) {
    if (amase?.pass) amasePassed++;
    if (superpowers?.pass) spPassed++;
    if (amase?.pass && superpowers?.pass) {
      bothPassed++;
      tokenA += amase.tokensIn + amase.tokensOut;
      tokenS += superpowers.tokensIn + superpowers.tokensOut;
      timeA += amase.wallMs;
      timeS += superpowers.wallMs;
    }
  }
  const passRateDelta = total === 0 ? 0 : (amasePassed - spPassed) / total;
  if (passRateDelta < 0) return { status: "regression", passRateDelta };
  if (bothPassed < 5) return { status: "insufficient_signal", bothPassed };
  return {
    status: "ok",
    tokenDelta: tokenS === 0 ? 0 : (tokenS - tokenA) / tokenS,
    timeDelta: timeS === 0 ? 0 : (timeS - timeA) / timeS,
    passRateDelta,
    bothPassed,
  };
}
