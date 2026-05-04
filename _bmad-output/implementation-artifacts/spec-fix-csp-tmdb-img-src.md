---
title: 'Fix CSP to Allow TMDB Poster Images'
type: 'bugfix'
created: '2026-05-03'
status: 'done'
route: 'one-shot'
---

## Intent

**Problem:** The backend's default `helmet()` configuration sets `img-src 'self' data:`, which blocks browsers from loading TMDB poster images (hosted at `https://image.tmdb.org`), resulting in a CSP console error and broken poster thumbnails on the home page.

**Approach:** Configure `helmet`'s `contentSecurityPolicy` to spread the default directives and extend `img-src` to also permit `https://image.tmdb.org`.

## Suggested Review Order

- [apps/backend/src/main.ts](../../apps/backend/src/main.ts) — helmet CSP configuration; the single changed file

## Spec Change Log

<!-- Empty — no review loops required. -->
