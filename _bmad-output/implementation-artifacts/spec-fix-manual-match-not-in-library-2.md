---
title: "Fix manual match not appearing in library (mutex bypass)"
type: "bugfix"
created: "2026-05-06"
status: "done"
route: "one-shot"
---

# Fix manual match not appearing in library (mutex bypass)

## Intent

**Problem:** After manually matching a file from the Needs Attention queue, it remains stuck in `matched` status and never appears in the library. The previous fix added a fire-and-forget `executeClassification()` call, but that method has a `classifying` mutex — if classification is already running (from a scan or watcher event), the call is silently dropped and the file is never classified.

**Approach:** Call `classifyFile()` directly on the specific file (synchronous, no mutex) immediately after `applyManualMatch()` returns, wrapped in try/catch so a classification failure doesn't reject the match response. The existing `executeClassification()` is kept to trigger pending transcode queues.

## Suggested Review Order

1. [apps/backend/src/library/library.service.ts](../../apps/backend/src/library/library.service.ts#L496-L505) — the fix: inline `classifyFile()` call with error handling, replacing the redundant DB re-query
2. [\_bmad-output/implementation-artifacts/deferred-work.md](deferred-work.md) — deferred item from adversarial review
