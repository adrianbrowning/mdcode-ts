# Test Markdown Document

This document contains various markdown elements and code blocks for comprehensive end-to-end testing of the mdcode tool.

## Introduction

Here's a paragraph with some **bold** and *italic* text. This helps us verify that non-code markdown elements are preserved during extract and update operations.

### Unordered List

- Item one
- Item two
  - Nested item
- Item three

### Ordered List

1. First step
2. Second step
3. Third step

## Code Blocks Without File Metadata

These code blocks should be ignored by extract and update commands since they don't have file metadata.

```js
// This block has no file metadata
const message = 'I should not be extracted';
console.log(message);
```

```python
# Another block without metadata
print("I also should not be extracted")
```

## Code Blocks With File Metadata Only

These blocks have file references but no regions. Extract should create these files, and update should replace the entire code block with file contents.

### Simple JavaScript

```js file=simple.js
function greet(name) {
  return `Hello, ${name}!`;
}

console.log(greet('World'));
```

### Simple TypeScript

```ts file=calculator.ts
function add(a: number, b: number): number {
  return a + b;
}

function multiply(a: number, b: number): number {
  return a * b;
}

export { add, multiply };
```

### Simple Python

```python file=utils.py
def square(n):
    return n * n

def cube(n):
    return n * n * n
```

## Code Blocks With File and Region Metadata

These blocks reference specific regions within files. Extract should create files with region markers, and update should only replace the code block with the region content (not the entire file).

### JavaScript Region Example

```js file=regions.js region=factorial
function factorial(n) {
  // Updated implementation with memoization
  if (n <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) {
    result *= i;
  }
  return result;
}
```

### TypeScript Region Example

```ts file=math.ts region=fibonacci
function fibonacci(n: number): number {
  // Updated with iterative approach
  if (n <= 1) return n;
  let a = 0, b = 1;
  for (let i = 2; i <= n; i++) {
    [a, b] = [b, a + b];
  }
  return b;
}
```

### Python Region Example

```python file=strings.py region=reverse
def reverse_string(s):
    return s[::-1]
```

### Another JavaScript Region

```js file=regions.js region=isPrime
function isPrime(num) {
  if (num <= 1) return false;
  for (let i = 2; i * i <= num; i++) {
    if (num % i === 0) return false;
  }
  return true;
}
```

## Mixed Content

More text content here to ensure we're testing with realistic markdown structure.

> This is a blockquote
> It spans multiple lines

### Code Block Without Language

```
Plain text code block
No language specified
Should still work if it has file metadata
```

### Shell Script

```bash file=deploy.sh
#!/bin/bash
echo "Deploying application..."
npm run build
npm run deploy
echo "Deployment complete!"
```

## Conclusion

This document provides comprehensive test coverage for:

- Blocks without file metadata (ignored)
- Blocks with file metadata only (full file)
- Blocks with file and region metadata (region extraction)
- Multiple languages (js, ts, python, bash)
- Preservation of other markdown elements

The end.
