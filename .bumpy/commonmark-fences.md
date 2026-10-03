---
mdcode-ts: minor
---

Added CommonMark-style tilde fences and fences of any length from three up. Unlike CommonMark, an opening fence may still have any indent, so fences in nested lists keep working. Fixed `extract --update-source` writing `file=` onto the wrong fence when one fence contained another.

Behaviour changes: a closing fence may now be indented up to three spaces more than its opener, and a backtick fence whose info string contains a backtick no longer opens a block.
