# Task: bring the docs up to date after a code change

I changed `greet()` in `src/greet.ts`: it now takes an optional `punctuation` argument. The code
samples in our docs still show the old version.

Update the docs so they show the current code, and make sure our CI docs check, which runs
`mdcode update --check --project`, passes. Don't change how `greet()` behaves.

`mdcode-ts` is already installed as a dev dependency.
