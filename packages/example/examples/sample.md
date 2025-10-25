# Sample Markdown File

This file contains example code blocks for testing mdcode.

## JavaScript Example

```js file=hello.js
console.log('Hello, world!');
```

## TypeScript Example

```ts file=greet.ts
function greet(name: string): string {
  return `Hello, ${name}!`;
}

console.log(greet('TypeScript'));
```

## Python Example

```python file=calculator.py
def add(a, b):
    return a + b

def subtract(a, b):
    return a - b

print(f"5 + 3 = {add(5, 3)}")
print(f"5 - 3 = {subtract(5, 3)}")
```

## Code Block Without File Metadata

```js
// This block has no file metadata
const x = 42;
```

## Region Example

```js file=regions.js region=factorial
function factorial(n) {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}
```
