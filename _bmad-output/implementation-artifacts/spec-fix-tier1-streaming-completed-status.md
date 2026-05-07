---
title: "Fix Tier 1 Streaming for Completed Status"
type: "bugfix"
created: "2026-05-06"
status: "done"
route: "one-shot"
context: []
---

## Intent

**Problem:** Tier 1 (direct play) media files return 404 "Media file not ready" after subtitle processing runs, because the subtitle service transitions their status from `ready` to `completed`, but the streaming endpoint only allows `ready` and `match_failed`.

**Approach:** Add `completed` to the streamable statuses list in the media service, and add a corresponding test.

## Suggested Review Order

1. [apps/backend/src/media/media.service.ts](../../apps/backend/src/media/media.service.ts#L53) — core fix: `completed` added to `streamableStatuses` array
2. [apps/backend/src/media/media.service.spec.ts](../../apps/backend/src/media/media.service.spec.ts#L100) — new test: tier 1 file with `completed` status resolves correctly

## Spec Change Log

<!-- No review loops — one-shot fix. -->
