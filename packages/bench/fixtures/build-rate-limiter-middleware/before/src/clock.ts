// Inject via `setNow` in tests; production uses real Date.now.
let _now: () => number = () => Date.now();
export function now(): number {
  return _now();
}
export function setNow(fn: () => number): void {
  _now = fn;
}
