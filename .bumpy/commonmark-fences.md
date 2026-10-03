---
mdcode-ts: minor
---

Added tilde fences and fences of any length from three up, following CommonMark's closing-fence rules. Fixed `extract --update-source` writing `file=` onto the wrong fence when one fence contained another.

Behaviour changes: a closing fence may now be indented up to three spaces more than its opener, and a backtick fence whose info string contains a backtick no longer opens a block.
