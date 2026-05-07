---
title: "Fix scroll position restoration on back navigation"
type: "bugfix"
created: "2026-05-06"
status: "done"
route: "one-shot"
---

## Intent

**Problem:** Navigating back from movie/show detail to the homepage resets scroll to top despite `scrollPositionRestoration: 'enabled'` being configured. The root cause is that `HomeComponent` is lazily loaded and destroyed/recreated on navigation — `toSignal()` triggers fresh HTTP requests on each creation, so the DOM is empty when Angular attempts scroll restoration.

**Approach:** Cache HTTP list responses in `LibraryService` using `shareReplay(1)` with error-recovery. On back navigation, cached data is delivered synchronously to `toSignal()`, populating the DOM before Angular's scroll restoration fires.

## Suggested Review Order

1. [library.service.ts](../apps/frontend/src/app/services/library.service.ts) — core change: `getMovies()`, `getShows()`, `getRecent()` now lazily create and cache observables with `shareReplay(1)`. Error handler via `tap({ error })` nulls the cache so failed requests retry on next navigation.
2. [app.config.ts](../apps/frontend/src/app/app.config.ts) — no change; confirms `scrollPositionRestoration: 'enabled'` was already correctly configured.
3. [home.component.ts](../apps/frontend/src/app/home/home.component.ts) — no change; `toSignal()` subscriptions now receive cached data synchronously on back nav.
