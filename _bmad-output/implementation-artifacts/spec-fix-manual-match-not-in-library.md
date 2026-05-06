---
title: "Fix manual match not appearing in library"
type: "bugfix"
created: "2026-05-05"
status: "done"
route: "one-shot"
---

# Fix manual match not appearing in library

## Intent

**Problem:** After manually matching a file from the Needs Attention queue, the file is cleared from Needs Attention (status changes to `matched`) but never appears in the library because classification is never triggered — leaving it stranded in `matched` status while the browse API filters for `ready`/`completed`.

**Approach:** Trigger `classificationService.executeClassification()` after a successful manual match, following the same fire-and-forget pattern used by the auto-match path.

## Suggested Review Order

1. [apps/backend/src/library/library.service.ts](../../apps/backend/src/library/library.service.ts#L490-L504) — the fix: classification trigger added after `applyManualMatch()` returns
2. [\_bmad-output/implementation-artifacts/deferred-work.md](deferred-work.md) — deferred items from adversarial review (classification queue mechanism, full-scan efficiency)
