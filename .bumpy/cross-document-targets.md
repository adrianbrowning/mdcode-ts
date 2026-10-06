---
mdcode-ts: minor
---

`extract` with several documents now checks all of them before writing anything. Blocks in different documents that write one file follow the same rule as blocks within one document: each needs its own `region=`, in one language. Otherwise they are refused as `ambiguous_target`, each error naming its document, and nothing is written for any document. Previously the first document's version won and the second was skipped, depending on document order. A rule broken in a later document no longer leaves the earlier documents' files written. `validate --for extract` reports the same cross-document conflicts.
