// regions.js - Multiple region examples

// This content is outside any region and should NOT be included in extracts

// #region factorial
function factorial(n) {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}
// #endregion factorial

// More content outside regions
const PI = 3.14159;

// #region isPrime
function isPrime(num) {
  if (num <= 1) return false;
  for (let i = 2; i * i <= num; i++) {
    if (num % i === 0) return false;
  }
  return true;
}
// #endregion isPrime

// Export statement outside regions
export { factorial, isPrime, PI };
