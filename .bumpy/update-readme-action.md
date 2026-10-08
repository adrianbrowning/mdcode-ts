---
mdcode-ts: minor
---

Added the `update-readme` GitHub Action (`adrianbrowning/mdcode-ts/.github/actions/update-readme`). It treats source files as authoritative: it runs `mdcode update --apply` on the selected documents in a temporary worktree at the base branch's tip, then opens one pull request holding only the Markdown changes, or refreshes the one it opened before. A rerun with nothing new pushes nothing. Once the base branch is in sync, it closes its pull request. It never pushes to the base branch and never writes a source file.
