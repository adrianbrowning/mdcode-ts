# greeter

A tiny greeting library.

## Usage

```ts file=src/greet.ts region=greet name=greet
export function greet(name: string): string {
  return `Hello, ${name}!`;
}
```

Say goodbye too:

```ts file=src/greet.ts region=farewell name=farewell
export function farewell(name: string): string {
  return `Goodbye, ${name}.`;
}
```

## Install

```sh
npm install greeter
```
