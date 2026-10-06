// #region greet
export function greet(name: string, punctuation = "!"): string {
  return `Hello, ${name}${punctuation}`;
}
// #endregion

// #region farewell
export function farewell(name: string): string {
  return `Goodbye, ${name}.`;
}
// #endregion
