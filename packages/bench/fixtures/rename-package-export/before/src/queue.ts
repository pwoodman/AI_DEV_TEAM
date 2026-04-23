export function runAll(jobs: Array<() => void>): void {
  for (const j of jobs) j();
}
