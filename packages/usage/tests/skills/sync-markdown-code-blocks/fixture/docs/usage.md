# Using greet

`greet` takes an optional punctuation mark:

```ts file=src/greet.ts region=greet
export function greet(name: string): string {
  return `Hello, ${name}!`;
}
```
