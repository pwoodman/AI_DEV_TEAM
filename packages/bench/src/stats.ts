export function mean(xs: readonly number[]): number {
  if (xs.length === 0) throw new Error("mean() requires at least one value");
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

export function stdev(xs: readonly number[]): number {
  if (xs.length < 2) throw new Error("stdev() requires at least 2 values");
  const m = mean(xs);
  let ss = 0;
  for (const x of xs) ss += (x - m) * (x - m);
  return Math.sqrt(ss / xs.length);
}

// Internal sample variance (n-1 denominator) used by Welch's t-test
function variance(xs: readonly number[]): number {
  const m = mean(xs);
  let ss = 0;
  for (const x of xs) ss += (x - m) * (x - m);
  return ss / (xs.length - 1);
}

export function welchT(a: readonly number[], b: readonly number[]): number {
  if (a.length < 2 || b.length < 2)
    throw new Error("welchT requires n>=2 per sample");
  const ma = mean(a);
  const mb = mean(b);
  const va = variance(a);
  const vb = variance(b);
  const se = Math.sqrt(va / a.length + vb / b.length);
  if (se === 0) return 0;
  return (ma - mb) / se;
}

function welchDf(a: readonly number[], b: readonly number[]): number {
  const va = variance(a);
  const vb = variance(b);
  const na = a.length;
  const nb = b.length;
  const num = (va / na + vb / nb) ** 2;
  const den = va ** 2 / (na ** 2 * (na - 1)) + vb ** 2 / (nb ** 2 * (nb - 1));
  if (den === 0) return Math.max(na, nb) - 1;
  return num / den;
}

function betacf(a: number, b: number, x: number): number {
  const MAXIT = 200;
  const EPS = 3e-12;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) return h;
  }
  return h;
}

function lnGamma(x: number): number {
  const c = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (const cj of c) ser += cj / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

function regIncBeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    lnGamma(a + b) -
      lnGamma(a) -
      lnGamma(b) +
      a * Math.log(x) +
      b * Math.log(1 - x),
  );
  if (x < (a + 1) / (a + b + 2)) return (bt * betacf(a, b, x)) / a;
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

function studentTCdfTwoSidedTail(t: number, df: number): number {
  const x = df / (df + t * t);
  return regIncBeta(df / 2, 0.5, x);
}

export function welchPValueTwoSided(
  a: readonly number[],
  b: readonly number[],
): number {
  const t = welchT(a, b);
  const df = welchDf(a, b);
  return studentTCdfTwoSidedTail(Math.abs(t), df);
}

export function welchCI95(
  a: readonly number[],
  b: readonly number[],
): [number, number] {
  const ma = mean(a);
  const mb = mean(b);
  const diff = ma - mb;
  const se = Math.sqrt(variance(a) / a.length + variance(b) / b.length);
  const df = welchDf(a, b);
  const tCrit = tCriticalTwoSided95(df);
  return [diff - tCrit * se, diff + tCrit * se];
}

function tCriticalTwoSided95(df: number): number {
  let lo = 0;
  let hi = 100;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const p = studentTCdfTwoSidedTail(mid, df);
    if (p > 0.05) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
