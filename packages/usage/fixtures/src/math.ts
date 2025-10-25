// math.ts - TypeScript math utilities

// Content outside region should not be extracted
const GOLDEN_RATIO = 1.618033988749;

// #region fibonacci
function fibonacci(n: number): number {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}
// #endregion fibonacci

// More utilities outside the region
function power(base: number, exponent: number): number {
  return Math.pow(base, exponent);
}

export { fibonacci, power, GOLDEN_RATIO };
