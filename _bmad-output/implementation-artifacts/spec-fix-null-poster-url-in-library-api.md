---
title: 'Fix null poster_url in /api/library/movies and /api/library/shows'
type: 'bugfix'
created: '2026-05-03'
status: 'done'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `poster_url` is `null` for every item returned by `GET /api/library/movies` and `GET /api/library/shows`. The `metadata` table has valid `poster_path` values, but `tmdb_config` is empty so `BrowseService.getImageBaseUrl()` always returns `null`, causing `buildPosterUrl()` to short-circuit to `null`.

**Approach:** Eagerly populate `tmdb_config` on app startup by calling `TmdbService.getImageBaseUrl()` from `LibraryModule.onModuleInit()` (awaited, so it completes before the server accepts requests). A try/catch ensures startup is not blocked if the TMDB API key is absent or the network is unavailable.

## Boundaries & Constraints

**Always:**
- `BrowseService` stays synchronous — no method signatures or return types change.
- The fix must work for the existing database (already scanned, `tmdb_config` empty) without requiring a re-scan.
- Errors from `TmdbService.getImageBaseUrl()` (missing API key, network failure) must be caught and logged as warnings, never crashing the app.

**Ask First:**
- None.

**Never:**
- Do not change `BrowseService`, its public API, or its tests.
- Do not change the controller.
- Do not hardcode the TMDB image base URL as a fallback constant.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Normal startup, TMDB key configured, `tmdb_config` empty | App starts, key present | `tmdb_config` populated before first request; `poster_url` non-null | N/A |
| `tmdb_config` already populated (cached, not expired) | App starts, row exists in DB | `TmdbService.getImageBaseUrl()` returns cached value immediately; no HTTP call | N/A |
| TMDB API key missing | `TMDB_API_KEY` not set | Warning logged; `tmdb_config` stays empty; app starts normally; `poster_url` null | Caught, logged, non-fatal |
| Network unreachable | API call fails after retries | Warning logged; `tmdb_config` stays empty; app starts normally | Caught, logged, non-fatal |

</frozen-after-approval>

## Code Map

- `apps/backend/src/library/library.module.ts` -- `OnModuleInit` hook; add `TmdbService` constructor injection and awaited `getImageBaseUrl()` call
- `apps/backend/src/library/tmdb.service.ts` -- `getImageBaseUrl()` — async method that reads `tmdb_config`, calls `GET /3/configuration` if stale/absent, and upserts result

## Tasks & Acceptance

**Execution:**
- [ ] `apps/backend/src/library/library.module.ts` -- Make `onModuleInit()` async; inject `TmdbService` in the constructor; race `this.tmdbService.getImageBaseUrl()` against a 10 s `setTimeout` rejection using `Promise.race()`; wrap the entire race in try/catch that logs a warning on error -- ensures `tmdb_config` is populated before the server accepts its first request, but startup is never blocked longer than 10 s even when the TCP connection stalls

**Acceptance Criteria:**
- Given the app is started with a valid `TMDB_API_KEY` and `tmdb_config` is empty, when the server becomes ready, then `GET /api/library/movies` returns items where `poster_url` is a non-null TMDB image URL.
- Given `tmdb_config` already has a non-expired row, when the app starts, then no TMDB HTTP call is made (the cached value is used).
- Given `TMDB_API_KEY` is not set, when the app starts, then startup completes without throwing; a warning is logged; `poster_url` remains null.

## Spec Change Log

### Loop 1 — 2026-05-03
- **Finding:** Blind hunter F1 / edge-case EC-001 / acceptance F-001 — stalled TCP connection (e.g. firewall silently dropping packets) causes `getImageBaseUrl()` to never throw, so the try/catch never fires and `onModuleInit()` awaits forever, permanently blocking NestJS startup.
- **Amended:** Tasks section — changed plain `await` to `Promise.race()` with a 10 s timeout rejection.
- **Known-bad state avoided:** `onModuleInit()` hanging indefinitely when TMDB is reachable at the TCP layer but unresponsive at the HTTP layer.
- **KEEP:** Single-file change (only `library.module.ts`); no changes to `BrowseService`, controller, or tests; try/catch wraps the entire race so any fast-fail error is still logged as a warning.

## Verification

**Commands:**
- `cd apps/backend && npm run build` -- expected: zero TypeScript errors
- `cd apps/backend && npm test -- browse.service` -- expected: all existing tests pass unchanged

## Suggested Review Order

- `onModuleInit()` now async; injects `TmdbService`; races HTTP call against 10s timeout; `clearTimeout` in `finally` prevents dangling rejection
  [`library.module.ts:52`](../../apps/backend/src/library/library.module.ts#L52)
