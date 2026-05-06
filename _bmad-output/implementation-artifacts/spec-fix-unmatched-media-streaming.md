---
title: "Fix unmatched media streaming returning 404"
type: "bugfix"
created: "2026-05-06"
status: "done"
route: "one-shot"
context: []
---

## Intent

**Problem:** Media files with `status = 'match_failed'` cannot be streamed — the `/api/media/stream/:fileId` endpoint requires `status = 'ready'` for tier 1/2 files, returning 404 "Media file not ready" for unmatched items that are physically present and playable.

**Approach:** Allow `match_failed` as a streamable status alongside `ready` in `getFileInfo()`. Also update browse service `playback_ready` flag from `false` to `true` for unmatched items to reflect actual capability.

## Suggested Review Order

1. [apps/backend/src/media/media.service.ts](../../apps/backend/src/media/media.service.ts#L54) — Core fix: `streamableStatuses` array now includes `match_failed`
2. [apps/backend/src/library/browse.service.ts](../../apps/backend/src/library/browse.service.ts#L228) — Consistency patch: `playback_ready: true` for unmatched movie items
