---
title: 'Other Media Watch Path'
type: 'feature'
created: '2026-05-07'
status: 'review'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The system only supports `movies` and `tv` source types. Home videos, recordings, and YouTube downloads stored in a separate folder cannot be imported or viewed. These files will never match TMDB but should otherwise be treated identically to movies — scanned, probed, classified, transcoded, and displayed alongside movies in the library.

**Approach:** Add a third source type `other` that flows through the entire existing pipeline (scan → probe → classify → transcode → serve) but skips TMDB matching entirely, transitioning directly from `probed` to `ready`/classification. In browse queries and the frontend, `other` files appear mixed into the movies list as unmatched items.

## Boundaries & Constraints

**Always:** Reuse the existing pipeline stages (probing, classification, transcoding, subtitle extraction, streaming). Source files remain read-only. `other` files use their filename (cleaned) as the display title.

**Ask First:** Adding a dedicated "Other" section/tab in the frontend instead of mixing with movies.

**Never:** Create TMDB metadata rows for `other` files. Modify how `movies` or `tv` sources currently work.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Other source seeded | `MEDIA_OTHER_PATH` set in .env | `media_sources` row with `type = 'other'` created on startup | Missing env var → skip with warning (same as movies/tv) |
| Other file scanned | Video file in other folder | `media_files` row linked to other source, status `discovered` | N/A |
| Other file after probe | File status `probed`, source type `other` | Matching skips file; status set to `matched` (no metadata row) | N/A |
| Other file in movie list | Browse movies endpoint called | Other files appear alongside movies as unmatched-style items | N/A |
| Other file detail page | Navigate to other file by id | Movie detail page loads with filename-derived title, no TMDB metadata | N/A |

</frozen-after-approval>

## Code Map

- `apps/backend/src/database/database.service.ts` — schema CHECK constraints for `media_sources.type` and `metadata.media_type`
- `apps/backend/src/config/config.service.ts` — `MediaSource` type, `MEDIA_OTHER_PATH` env var reading, source seeding
- `apps/backend/src/library/matching.service.ts` — `matchFile()` entry point; must skip TMDB for `other` sources
- `apps/backend/src/library/library.service.ts` — `executeMatching()` pipeline orchestration
- `apps/backend/src/library/browse.service.ts` — `getMovies()` query; must include `other` source files
- `apps/backend/src/library/filename-parser.service.ts` — `parseFilename` source type parameter
- `apps/frontend/src/app/home/home.component.ts` — `allItems` signal merging movies+shows
- `.env` / `.env.example` — `MEDIA_OTHER_PATH` variable
- `docker-compose.yml` / `Dockerfile` — volume mount for other media folder

## Tasks & Acceptance

**Execution:**
- [x] `apps/backend/src/database/database.service.ts` — add migration to ALTER `media_sources.type` CHECK constraint to include `'other'`; no change needed for `metadata.media_type` since other files won't have metadata rows
- [x] `apps/backend/src/config/config.service.ts` — extend `MediaSource.type` union to include `'other'`; read `MEDIA_OTHER_PATH` and seed it as source type `other`
- [x] `apps/backend/src/library/matching.service.ts` — in `matchFile()`, detect source type `other` and skip TMDB matching; set status directly to `matched` so classification/transcode pipeline proceeds
- [x] `apps/backend/src/library/filename-parser.service.ts` — accept `'other'` in the sourceType parameter; parse like movies (title extraction only, no season/episode)
- [x] `apps/backend/src/library/browse.service.ts` — in `getMovies()`, include unmatched files from `other` sources alongside movie unmatched files (extend the unmatched query `WHERE` clause)
- [x] `.env.example` — add `MEDIA_OTHER_PATH` with a comment
- [x] `docker-compose.yml` — add volume mount for other media path

**Acceptance Criteria:**
- Given `MEDIA_OTHER_PATH` is set in `.env`, when the backend starts, then a `media_sources` row with `type = 'other'` exists
- Given a video file exists in the other folder, when a library scan runs, then the file is discovered, probed, classified, and reaches `ready` or `completed` status without TMDB interaction
- Given other files exist with `ready`/`completed` status, when the movies browse endpoint is called, then other files appear in the response with filename-derived titles
- Given an other file is playback-ready, when a user clicks it in the UI, then it plays using the same player and pipeline as movies

## Verification

**Commands:**
- `npm run build` — expected: zero errors
- `npx nx test backend --testPathPattern=matching` — expected: existing tests pass

**Manual checks:**
- Place a video file in `_media/other/`, trigger scan, verify it appears in the movie list in the browser

## Dev Agent Record

### Implementation Plan
- Added `'other'` to the `media_sources.type` CHECK constraint via a migration block that recreates the table if the existing schema lacks `'other'`
- Extended `MediaSource.type` union and seeded `MEDIA_OTHER_PATH` using the same pattern as movies/tv
- In `matchFile()`, detect `other` source type and skip TMDB entirely — set status to `matched` so the classification/transcode pipeline proceeds
- In `FilenameParserService`, added `'other'` to the accepted sourceType, parsing like movies
- In `getMovies()`, extended the unmatched query to include `other` source files; updated `getMovieById()` and `search()` similarly
- Added `.env.example` entry and `docker-compose.yml` volume mount

### Debug Log
- No issues encountered

### Completion Notes
- All 7 tasks completed
- 76 tests pass across matching, browse, filename-parser, and database service specs
- Full project build succeeds (frontend + backend)
- 4 pre-existing test failures in `watcher.service.spec.ts` (unrelated — spec references `syncFiles` but service uses `insertNewFiles`)

## File List

- `apps/backend/src/database/database.service.ts` — modified (migration for `other` type in CHECK constraint)
- `apps/backend/src/config/config.service.ts` — modified (added `'other'` to type union, `MEDIA_OTHER_PATH` seeding)
- `apps/backend/src/library/matching.service.ts` — modified (skip TMDB for `other` source type)
- `apps/backend/src/library/filename-parser.service.ts` — modified (accept `'other'` sourceType)
- `apps/backend/src/library/browse.service.ts` — modified (include `other` files in movie queries)
- `.env.example` — modified (added `MEDIA_OTHER_PATH`)
- `docker-compose.yml` — modified (added other media volume mount)

## Change Log

- 2026-05-07: Implemented other media watch path — all 7 tasks completed. Added `other` source type through full pipeline (scan → probe → skip-TMDB → classify → transcode → browse).
