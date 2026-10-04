---
mdcode-ts: patch
---

Added a ready-to-copy CI script, `examples/ci/validate-snippets.mjs`, that extracts the code blocks marked `runnable=true` into a temporary workspace, runs your validation command there, names the block that failed, and always removes the workspace.
