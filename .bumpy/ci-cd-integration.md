---
mdcode-ts: patch
---

Added a CI/CD Integration section to the README. It puts the docs-sync check, the runnable-snippet check and release gating in one sequence, and shows how to publish only after they pass, either with `prepublishOnly` or with a GitHub Actions publish job that needs a checks job.
