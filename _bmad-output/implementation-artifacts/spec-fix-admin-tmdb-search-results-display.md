---
title: "Fix TMDB search results not displaying in Needs Attention"
type: "bugfix"
created: "2026-05-05"
status: "done"
route: "one-shot"
---

# Fix TMDB search results not displaying in Needs Attention

## Intent

**Problem:** In the admin Needs Attention section, searching TMDB returns results from the API (visible in browser console), but the UI never renders them. The frontend expects a `{ results: [...] }` wrapper object while the backend returns a plain `TmdbSearchResult[]` array.

**Approach:** Align the frontend HTTP call's type annotation and subscribe handler to consume the array directly, and update the test mock to match.

## Suggested Review Order

1. [apps/frontend/src/app/admin/needs-attention.component.ts](../../apps/frontend/src/app/admin/needs-attention.component.ts#L327-L337) — the `search()` method fix: changed generic type from `{ results: TmdbSearchResult[] }` to `TmdbSearchResult[]`, catchError returns `[]`, subscribe uses `results` directly
2. [apps/frontend/src/app/admin/needs-attention.component.spec.ts](../../apps/frontend/src/app/admin/needs-attention.component.spec.ts#L82-L84) — test mock updated to flush a plain array instead of wrapper object
3. [apps/backend/src/library/tmdb.controller.ts](../../apps/backend/src/library/tmdb.controller.ts#L30-L33) — backend confirmation: returns service result directly (no wrapper)
