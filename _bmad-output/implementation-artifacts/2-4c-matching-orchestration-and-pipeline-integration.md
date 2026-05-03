# Story 2.4c: Matching Orchestration and Pipeline Integration

Status: done

## Story

As an admin,
I want the system to orchestrate filename parsing and TMDB lookups to automatically match probed files with metadata,
so that matched files have rich metadata stored and are ready for library browsing.

## Acceptance Criteria

```gherkin
Given a file has been probed successfully (status "probed")
When the matching service processes the file
Then the filename parser extracts title/year/season/episode
And the media type is determined from the file's source (movies vs tv)
And the TMDB service is queried for the best match based on extracted title/year
And matched metadata (title, description, poster_path, ratings, runtime, content_rating, genres) is stored in a metadata table
And for TV shows, season and episode info is fetched and stored in a tv_episodes table
And the file status is updated to "matched"
And if no TMDB match is found, status is set to "match_failed" and an error is logged to scan_errors (NFR14)
And if TMDB is temporarily unavailable, the file stays "probed" for retry on next cycle (NFR19)
And matching runs automatically after probing completes without blocking API responses (NFR17)
And concurrent matching runs are prevented via a mutex flag
```

## Tasks / Subtasks

- [x] 1. Database schema for metadata storage (AC: 4, 5)
  - [x] 1.1 Add `metadata` table to `DatabaseService.runMigrations()`: id, media_file_id (FK, UNIQUE), tmdb_id, media_type ('movie'|'tv'), title, overview, poster_path, backdrop_path, vote_average, runtime, release_date, content_rating, genres (JSON text), created_at, updated_at
  - [x] 1.2 Add `tv_episodes` table: id, metadata_id (FK), season_number, episode_number, name, overview, air_date, still_path, created_at
  - [x] 1.3 Add indexes on media_file_id, tmdb_id, and metadata_id
- [x] 2. Create `MatchingService` in library module (AC: all)
  - [x] 2.1 Inject `FilenameParserService`, `TmdbService`, `DatabaseService`
  - [x] 2.2 Implement `matchFile(file: MediaFile): Promise<'matched' | 'match_failed' | 'retry'>` — orchestrates the full flow
  - [x] 2.3 Determine media type: join `media_files.source_id` → `media_sources.type` to get 'movies' or 'tv'
  - [x] 2.4 For movies: call parser → searchMovie(title, year) → pick best result (highest popularity, prefer matching year) → getMovieDetails → store in metadata table → status "matched"
  - [x] 2.5 For TV: call parser → searchTv(title) → pick best result → getTvDetails → getTvSeasonDetails for the parsed season → store metadata + episode in tv_episodes → status "matched"
  - [x] 2.6 On no search results: set status "match_failed", insert scan_errors with error_type "MATCH_FAILED"
  - [x] 2.7 On `TmdbUnavailableError`: return 'retry' — keep status "probed", log warning (NOT to scan_errors)
  - [x] 2.8 On `TmdbClientError` or unexpected error: set status "match_failed", log to scan_errors
  - [x] 2.9 Store content_rating: for movies, fetch from release_dates endpoint or use certification; for TV, use content_ratings. (Simplification: store vote_average as primary, skip certification API calls for V1 — can enhance in future)
- [x] 3. Integrate matching into scan pipeline (AC: 7, 8, 9)
  - [x] 3.1 Add `executeMatching(): Promise<void>` to `LibraryService` — queries files with status "probed", calls `matchingService.matchFile()` sequentially
  - [x] 3.2 Add `private matching = false` mutex flag to `LibraryService` (same pattern as `this.probing`)
  - [x] 3.3 After `executeProbing()` completes, trigger `executeMatching().catch(...)` (fire-and-forget async)
  - [x] 3.4 Ensure matching doesn't block API responses — runs in background
- [x] 4. Register in LibraryModule (AC: all)
  - [x] 4.1 Add `MatchingService` to providers in `library.module.ts`
  - [x] 4.2 Export `MatchingService` from `LibraryModule` for future use by Story 2.5 (manual match)
- [x] 5. Unit tests (AC: all)
  - [x] 5.1 Test movie matching happy path: parser returns title+year → TMDB search returns results → details fetched → metadata stored → status "matched"
  - [x] 5.2 Test TV matching happy path: parser returns title+season+episode → TMDB search → TV details + season details → metadata + episode stored → status "matched"
  - [x] 5.3 Test match failure: TMDB search returns empty results → status "match_failed", error in scan_errors
  - [x] 5.4 Test TMDB unavailable: TmdbUnavailableError thrown → status stays "probed", no scan_errors entry
  - [x] 5.5 Test executeMatching: processes all "probed" files, respects mutex flag
  - [x] 5.6 Test pipeline integration: after probing, matching is triggered automatically
  - [x] 5.7 Use `:memory:` database for all DB tests

  ### Review Findings
  - [x] [Review][Patch] Matching mutex can leave newly probed files stranded in `probed` [apps/backend/src/library/library.service.ts:207]
  - [x] [Review][Patch] TV matches can be finalized without required episode rows [apps/backend/src/library/matching.service.ts:131]
  - [x] [Review][Patch] Metadata and episode writes are not wrapped in a transaction [apps/backend/src/library/matching.service.ts:99]
  - [x] [Review][Patch] One thrown match can abort the rest of the batch [apps/backend/src/library/library.service.ts:226]
  - [x] [Review][Patch] seasonDetails.episodes unguarded against null/undefined from TMDB [apps/backend/src/library/matching.service.ts:169]

## Dev Notes

### Technical Implementation: Matching Orchestration

**Best match selection strategy:**

```typescript
// For movies: prefer exact year match with highest popularity
function pickBestMovie(
  results: TmdbSearchResult[],
  parsedYear?: number,
): TmdbSearchResult | null {
  if (results.length === 0) return null;

  if (parsedYear) {
    const yearMatches = results.filter(
      (r) =>
        r.release_date &&
        parseInt(r.release_date.substring(0, 4)) === parsedYear,
    );
    if (yearMatches.length > 0) {
      return yearMatches.sort((a, b) => b.popularity - a.popularity)[0];
    }
  }

  // Fallback: highest popularity regardless of year
  return results.sort((a, b) => b.popularity - a.popularity)[0];
}

// For TV: highest popularity (year less reliable for TV shows)
function pickBestTv(results: TmdbSearchResult[]): TmdbSearchResult | null {
  if (results.length === 0) return null;
  return results.sort((a, b) => b.popularity - a.popularity)[0];
}
```

**Metadata storage pattern:**

```typescript
// Store metadata — synchronous better-sqlite3
const insertMetadata = db.prepare(`
  INSERT OR REPLACE INTO metadata 
  (media_file_id, tmdb_id, media_type, title, overview, poster_path, backdrop_path, vote_average, runtime, release_date, content_rating, genres, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
`);

// Store TV episode
const insertEpisode = db.prepare(`
  INSERT INTO tv_episodes (metadata_id, season_number, episode_number, name, overview, air_date, still_path)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
```

**Pipeline integration:**

```typescript
// In LibraryService — after executeProbing completes:
private async executeScan(scanId: string): Promise<void> {
  // ... existing scan logic ...

  // Trigger probing (existing)
  this.executeProbing().catch(err => { ... });
}

// In executeProbing — after all files probed:
async executeProbing(): Promise<void> {
  // ... existing probing logic ...

  // Trigger matching after probing completes
  this.executeMatching().catch(err => {
    this.logger.error(`Matching failed: ${err.message}`);
  });
}
```

### Architecture Compliance

1. **Graceful Degradation (NFR13, NFR14):** Each file match is independent. Failure on one does NOT stop others. Permanent failures go to "match_failed" (visible in Story 2.5's Needs Attention queue). Temporary failures stay "probed" for retry.
2. **Non-blocking (NFR17):** Matching runs asynchronously. Playback and API endpoints remain responsive.
3. **Read-Only Source (NFR9):** Only reads filenames from DB and writes metadata — no filesystem modifications.
4. **Error isolation:** MatchingService catches all errors per-file. LibraryService catch wraps the entire batch.

### Database Schema Additions

```sql
CREATE TABLE IF NOT EXISTS metadata (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  media_file_id INTEGER NOT NULL UNIQUE REFERENCES media_files(id) ON DELETE CASCADE,
  tmdb_id INTEGER NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  title TEXT NOT NULL,
  overview TEXT,
  poster_path TEXT,
  backdrop_path TEXT,
  vote_average REAL,
  runtime INTEGER,
  release_date TEXT,
  content_rating TEXT,
  genres TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_metadata_media_file_id ON metadata(media_file_id);
CREATE INDEX IF NOT EXISTS idx_metadata_tmdb_id ON metadata(tmdb_id);

CREATE TABLE IF NOT EXISTS tv_episodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  metadata_id INTEGER NOT NULL REFERENCES metadata(id) ON DELETE CASCADE,
  season_number INTEGER NOT NULL,
  episode_number INTEGER NOT NULL,
  name TEXT,
  overview TEXT,
  air_date TEXT,
  still_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tv_episodes_metadata_id ON tv_episodes(metadata_id);
```

### File Structure

```
apps/backend/src/library/
├── matching.service.ts              # NEW: orchestrates parsing → TMDB → store
├── matching.service.spec.ts         # NEW: unit tests
├── library.module.ts                # UPDATE: add MatchingService to providers/exports
├── library.service.ts               # UPDATE: add executeMatching() + trigger after probing
├── library.service.spec.ts          # UPDATE: test matching integration
apps/backend/src/database/
└── database.service.ts              # UPDATE: add metadata + tv_episodes table migrations
```

### Dependencies on Previous Sub-Stories

- **2-4a:** `FilenameParserService` must be available for injection (provides `parseFilename()`)
- **2-4b:** `TmdbService` must be available for injection (provides search, details, error types)

### Library/Framework Requirements

- **NestJS patterns:** `@Injectable()` provider in `LibraryModule`
- **better-sqlite3:** All DB operations synchronous — inserts, updates, queries
- **Error handling:** Catch `TmdbUnavailableError` (retry) vs `TmdbClientError` (permanent) from TmdbService
- **Transaction support:** Use `db.transaction()` for atomic metadata + episode inserts

### Testing Requirements

- Mock `FilenameParserService` and `TmdbService` via jest — control their outputs
- Use `:memory:` database with full schema for integration-style tests
- Verify status transitions: "probed" → "matched" or "match_failed"
- Verify scan_errors entries on permanent failure
- Verify NO scan_errors on temporary (unavailable) failure

### Previous Story Intelligence (Learnings from 2.3)

- better-sqlite3 uses **synchronous API** — all DB calls are blocking
- Use `INSERT OR REPLACE` for metadata to handle re-matching gracefully
- Schema additions go in `DatabaseService.runMigrations()` using `CREATE TABLE IF NOT EXISTS`
- Error logging to `scan_errors` table: `(file_path, error_type, error_message)` — reuse pattern
- Use mutex flag (`this.matching`) identical to existing `this.probing` pattern
- Pipeline flows: scan → probe → match (each fires-and-forgets the next step)

### References

- [Source: _bmad-output/planning-artifacts/epics.md - Story 2.4 full acceptance criteria]
- [Source: _bmad-output/planning-artifacts/prd.md - FR3, FR4, NFR12, NFR13, NFR14, NFR17, NFR18, NFR19]
- [Source: apps/backend/src/library/library.service.ts - executeProbing() pattern to replicate]
- [Source: _bmad-output/implementation-artifacts/2-4a-filename-parser-service.md - ParsedFilename interface]
- [Source: _bmad-output/implementation-artifacts/2-4b-tmdb-api-service.md - TmdbService API, error types]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (GitHub Copilot)

### Debug Log References

- All 69 backend tests pass (9 suites), zero regressions
- TypeScript compiles cleanly with `--noEmit`

### Completion Notes List

- Added `metadata` and `tv_episodes` tables with proper foreign keys, constraints, and indexes to `DatabaseService.runMigrations()`
- Created `MatchingService` with full orchestration: filename parsing → TMDB search → best-match selection → metadata storage → status transitions
- Movie matching uses year-preference + popularity sort; TV matching uses popularity sort
- Graceful error handling: `TmdbUnavailableError` → retry (stays "probed"), `TmdbClientError`/unexpected → "match_failed" + scan_errors
- Integrated `executeMatching()` into `LibraryService` with mutex flag, triggered automatically after probing
- Pipeline: scan → probe → match (each fire-and-forgets the next), non-blocking to API responses
- V1 simplification: content_rating stored as null (skipped certification API calls per story spec)
- Registered and exported `MatchingService` from `LibraryModule`
- 6 unit tests for `MatchingService` + 3 integration tests in `LibraryService` spec (executeMatching mutex + pipeline trigger)

### File List

- apps/backend/src/database/database.service.ts (modified - added metadata + tv_episodes tables)
- apps/backend/src/library/matching.service.ts (new - matching orchestration service)
- apps/backend/src/library/matching.service.spec.ts (new - 6 unit tests)
- apps/backend/src/library/library.service.ts (modified - added executeMatching + mutex + pipeline trigger + MatchingService injection)
- apps/backend/src/library/library.service.spec.ts (modified - added MatchingService mock + 3 new tests)
- apps/backend/src/library/library.module.ts (modified - registered + exported MatchingService)
