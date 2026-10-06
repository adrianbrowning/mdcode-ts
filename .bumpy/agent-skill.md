---
mdcode-ts: minor
---

The package now ships an Agent Skill, `skills/sync-markdown-code-blocks`, managed with TanStack Intent. It teaches coding agents the mdcode workflow: link a block to a file or region, inspect and plan, apply explicitly and verify with `--check`. It also covers `extract`, `run`, `dump`, transformers, JSON results, and which commands need approval on untrusted Markdown. Run `npx @tanstack/intent install` in your project to let your agent find it; see Agent Skills in the README.
