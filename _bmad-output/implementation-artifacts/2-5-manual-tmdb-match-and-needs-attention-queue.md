# Story 2.5: Manual TMDB Match and Needs Attention Queue

Status: ready-for-dev

## Story

As an admin,
I want to see files that failed automatic matching and manually search TMDB to assign the correct match,
so that no files are silently lost from my library.

## Acceptance Criteria

```gherkin
Given a file has failed automatic TMDB matching
When the file status is set to "match_failed"
Then the file appears in the "Needs Attention" queue accessible via GET /api/library/unmatched
And the admin can search TMDB manually via GET /api/tmdb/search?query=...&type=movie|tv
And the admin can assign a TMDB match to a file via POST /api/library/files/:id/match with the TMDB ID
And once manually matched, metadata is fetched and stored, and the file status updates to "matched"
And for TV files, the matched season and episode are stored in tv_episodes using the season/episode parsed from the filename
And failed matches are never silently dropped — they remain in the queue until resolved (NFR14)
```

## Tasks / Subtasks

- [ ] 1. Add `GET /api/library/unmatched` endpoint (AC: 1, 5)
  - [ ] 1.1 Add `getUnmatchedFiles()` method to `LibraryService` — queries `media_files` WHERE `status = 'match_failed'`, JOINs `media_sources` to include source type and path context
  - [ ] 1.2 Add `@Get('unmatched')` route to `LibraryController` — returns list of unmatched files with pagination (offset/limit, same pattern as existing `getFiles`)
  - [ ] 1.3 Return shape: `{ items: UnmatchedFile[], total: number, offset: number, limit: number }` where `UnmatchedFile` includes: `id, filename, path, source_type ('movies'|'tv'), error_message (from scan_errors), created_at`
- [ ] 2. Add `GET /api/tmdb/search` endpoint (AC: 2)
  - [ ] 2.1 Create `TmdbController` in the library module — `@Controller('tmdb')`
  - [ ] 2.2 Add `@Get('search')` route with query params: `query` (required string), `type` (required, `'movie'|'tv'`)
  - [ ] 2.3 Validate: `query` must be non-empty string; `type` must be `'movie'` or `'tv'`; return 400 on invalid input
  - [ ] 2.4 Delegate to existing `TmdbService.searchMovie(query)` or `TmdbService.searchTv(query)` based on `type`
  - [ ] 2.5 Return the search results array directly (same shape as TMDB API: id, title/name, overview, poster_path, release_date/first_air_date, vote_average, popularity)
  - [ ] 2.6 Handle `TmdbUnavailableError` → return 503; `TmdbClientError` → return 502
- [ ] 3. Add `POST /api/library/files/:id/match` endpoint (AC: 3, 4)
  - [ ] 3.1 Add `@Post('files/:id/match')` route to `LibraryController`
  - [ ] 3.2 Accept body: `{ tmdbId: number }` — validate tmdbId is a positive integer
  - [ ] 3.3 Verify file exists and has status `'match_failed'` — return 404 if not found, 409 if already matched
  - [ ] 3.4 Add `manualMatch(fileId: number, tmdbId: number)` method to `LibraryService` that delegates to `MatchingService`
  - [ ] 3.5 Add `applyManualMatch(file, tmdbId, mediaType)` method to `MatchingService` — fetches details from TMDB using the provided tmdbId, stores metadata (reuse existing `persistMovieMatch`/`persistTvMatch` transaction patterns), updates status to `'matched'`
  - [ ] 3.6 For TV manual match: fetch show details, then use `FilenameParserService.parseFilename()` to extract season/episode from the file's filename. Fetch the specific season via `getTvSeasonDetails()`, find the matching episode, and store both show-level metadata AND the episode row in `tv_episodes`
  - [ ] 3.7 On success: return `{ status: 'matched', metadata: { title, tmdb_id, poster_path } }`
  - [ ] 3.8 Handle TMDB errors: `TmdbUnavailableError` → 503; `TmdbClientError` → 502; invalid tmdbId (404 from TMDB) → 400
- [ ] 4. Register TmdbController in LibraryModule (AC: all)
  - [ ] 4.1 Add `TmdbController` to `controllers` array in `library.module.ts`
- [ ] 5. Unit tests (AC: all)
  - [ ] 5.1 Test `GET /api/library/unmatched` — returns files with status 'match_failed', correct pagination, includes error context
  - [ ] 5.2 Test `GET /api/tmdb/search` — delegates to TmdbService, returns results, handles errors
  - [ ] 5.3 Test `POST /api/library/files/:id/match` — happy path movie: file status changes to matched, metadata stored
  - [ ] 5.4 Test `POST /api/library/files/:id/match` — happy path TV: file status changes to matched, show metadata stored, episode row created with correct season/episode numbers
  - [ ] 5.5 Test `POST /api/library/files/:id/match` — file not found → 404
  - [ ] 5.6 Test `POST /api/library/files/:id/match` — file already matched → 409
  - [ ] 5.7 Test `POST /api/library/files/:id/match` — TMDB unavailable → 503
  - [ ] 5.8 Test `POST /api/library/files/:id/match` — invalid tmdbId → 400
  - [ ] 5.9 Use `:memory:` database for all DB tests

## Dev Notes

### Technical Implementation: API Endpoints

**Unmatched files query pattern:**

```typescript
// In LibraryService
getUnmatchedFiles(offset: number, limit: number) {
  const db = this.db.getDatabase();

  const countStmt = db.prepare(
    "SELECT COUNT(*) as total FROM media_files WHERE status = 'match_failed'"
  );
  const { total } = countStmt.get() as { total: number };

  const filesStmt = db.prepare(`
    SELECT mf.id, mf.filename, mf.path, ms.type as source_type,
           se.error_message, mf.created_at
    FROM media_files mf
    JOIN media_sources ms ON mf.source_id = ms.id
    LEFT JOIN scan_errors se ON se.file_path = mf.path AND se.error_type = 'MATCH_FAILED'
    WHERE mf.status = 'match_failed'
    ORDER BY mf.created_at DESC
    LIMIT ? OFFSET ?
  `);
  const items = filesStmt.all(limit, offset);

  return { items, total, offset, limit };
}
```

**Note on scan_errors JOIN:** A file may have multiple MATCH_FAILED entries in scan_errors (if it was retried). Use the latest one by ordering or use a subquery with MAX(id). Simplest approach: `LEFT JOIN` picks one arbitrarily which is acceptable since the error message is informational only.

**Manual match flow:**

```typescript
// In MatchingService — new method
async applyManualMatch(
  file: { id: number; path: string; source_id: number },
  tmdbId: number,
  mediaType: 'movie' | 'tv'
): Promise<{ title: string; tmdb_id: number; poster_path: string | null }> {
  const db = this.database.getDatabase();

  if (mediaType === 'movie') {
    const details = await this.tmdb.getMovieDetails(tmdbId);
    // Reuse the same persistMovieMatch transaction pattern from matchMovie()
    // ... store metadata, update status to 'matched'
    return { title: details.title, tmdb_id: details.id, poster_path: details.poster_path };
  } else {
    const details = await this.tmdb.getTvDetails(tmdbId);
    // Store show-level metadata only (no episode matching for manual)
    // ... store metadata, update status to 'matched'
    return { title: details.name, tmdb_id: details.id, poster_path: details.poster_path };
  }
}
```

**TmdbController pattern:**

```typescript
@Controller("tmdb")
export class TmdbController {
  constructor(private readonly tmdbService: TmdbService) {}

  @Get("search")
  async search(@Query("query") query: string, @Query("type") type: string) {
    if (!query?.trim()) {
      throw new BadRequestException("query parameter is required");
    }
    if (type !== "movie" && type !== "tv") {
      throw new BadRequestException('type must be "movie" or "tv"');
    }

    try {
      if (type === "movie") {
        return await this.tmdbService.searchMovie(query);
      } else {
        return await this.tmdbService.searchTv(query);
      }
    } catch (err) {
      if (err instanceof TmdbUnavailableError) {
        throw new ServiceUnavailableException(err.message);
      }
      if (err instanceof TmdbClientError) {
        throw new BadGatewayException(err.message);
      }
      throw err;
    }
  }
}
```

### Architecture Compliance

1. **NFR14 (Never silently drop):** Files with status `match_failed` persist indefinitely in the DB. The `GET /api/library/unmatched` endpoint surfaces them. Only an explicit manual match resolves them.
2. **NFR12 (TMDB key not exposed to frontend):** The `GET /api/tmdb/search` endpoint acts as a backend proxy — the TMDB API key never leaves the server. Frontend calls the backend, which forwards to TMDB.
3. **NFR17 (Non-blocking):** These are simple request/response endpoints. They don't interact with the background scan/probe/match pipeline.
4. **NFR18 (Rate limits):** The existing `TmdbService.fetchWithRetry` handles rate limiting with backoff. Manual search uses the same service, so it benefits from the same retry logic.
5. **Error handling:** Use NestJS built-in exception classes (`NotFoundException`, `ConflictException`, `BadRequestException`, `ServiceUnavailableException`, `BadGatewayException`) — standard NestJS exception filter handles HTTP response formatting.

### File Structure

```
apps/backend/src/library/
├── tmdb.controller.ts               # NEW: TMDB search proxy endpoint
├── tmdb.controller.spec.ts          # NEW: unit tests for TmdbController
├── library.controller.ts            # UPDATE: add unmatched + manual match endpoints
├── library.controller.spec.ts       # UPDATE: tests for new endpoints (create if not exists)
├── library.service.ts               # UPDATE: add getUnmatchedFiles() + manualMatch()
├── library.service.spec.ts          # UPDATE: test new service methods
├── matching.service.ts              # UPDATE: add applyManualMatch() method
├── matching.service.spec.ts         # UPDATE: test applyManualMatch()
├── library.module.ts                # UPDATE: add TmdbController to controllers array
```

### Dependencies on Previous Stories

- **2-4b (TmdbService):** Provides `searchMovie()`, `searchTv()`, `getMovieDetails()`, `getTvDetails()`, error types (`TmdbUnavailableError`, `TmdbClientError`)
- **2-4c (MatchingService):** Provides the metadata storage transaction patterns (`persistMovieMatch`, `persistTvMatch`) to reuse in `applyManualMatch`
- **2-1 (Database):** Schema for `media_files`, `metadata`, `tv_episodes`, `scan_errors` tables already exists

### Existing Code to Reuse (DO NOT REINVENT)

- `MatchingService.matchMovie()` transaction pattern → extract/reuse for `applyManualMatch` movie flow
- `MatchingService.matchTv()` transaction pattern → adapt for show-level match (skip episode-specific matching for manual)
- `LibraryService.getFiles()` pagination pattern → replicate for `getUnmatchedFiles()`
- `LibraryController` existing patterns: `@Get()`, `@Post()`, `@Param(ParseIntPipe)`, `@Query(DefaultValuePipe, ParseIntPipe)`
- `TmdbService.searchMovie/searchTv` → call directly from `TmdbController`, no wrapper needed

### Library/Framework Requirements

- **NestJS decorators:** `@Controller`, `@Get`, `@Post`, `@Query`, `@Param`, `@Body`, `@HttpCode`
- **NestJS exceptions:** `NotFoundException`, `ConflictException`, `BadRequestException`, `ServiceUnavailableException`, `BadGatewayException` — import from `@nestjs/common`
- **NestJS pipes:** `ParseIntPipe`, `DefaultValuePipe` — for param/query validation
- **better-sqlite3:** Synchronous API for all DB operations (consistent with entire project)
- **No additional npm dependencies required** — all needed packages already installed

### Testing Requirements

- Mock `TmdbService` via jest for controller tests — control responses and error throws
- Use `:memory:` database with full schema via `DatabaseService` for service-level tests
- Test error mapping: `TmdbUnavailableError` → 503, `TmdbClientError` → 502
- Test validation: missing query → 400, invalid type → 400, invalid tmdbId → 400
- Test state transitions: only `match_failed` files can be manually matched
- Follow existing test patterns from `matching.service.spec.ts` and `library.service.spec.ts`

### Previous Story Intelligence (from 2-4c)

**Key learnings:**

- better-sqlite3 uses **synchronous API** — all DB calls are blocking, no async needed for queries
- Use `db.transaction()` for atomic metadata + status updates (prevents partial writes)
- `INSERT OR REPLACE INTO metadata` handles re-matching gracefully (same file matched again)
- Error types from TmdbService: `TmdbUnavailableError` = temporary (retry), `TmdbClientError` = permanent
- Matching mutex pattern exists but is irrelevant for manual match (it's a one-shot request)
- Review findings from 2-4c (all fixed): transaction wrapping, null guards on seasonDetails.episodes, error isolation per file

**Code patterns established:**

- Services are `@Injectable()` providers in `LibraryModule`
- Controllers registered in `controllers` array of `@Module` decorator
- Tests use `Test.createTestingModule()` with mocked dependencies
- All timestamps use `datetime('now')` SQLite function

### TV Manual Match Design Decision

When an admin manually matches a TV file to a TMDB show:

- Store show-level metadata in `metadata` table (tmdb_id, title, poster, etc.)
- Parse season/episode from the filename using `FilenameParserService.parseFilename(file.filename, 'tv')`
- Fetch the specific season via `TmdbService.getTvSeasonDetails(tmdbId, season)`
- Find the matching episode in the season data and store it in `tv_episodes`
- If season/episode cannot be parsed from filename, still store show metadata but log a warning (don't fail the match)
- If the episode is not found in TMDB season data, still store show metadata but log a warning (don't fail the match)
- This mirrors the automatic matcher (Story 2-4c) behavior but uses the admin-provided tmdbId instead of a search result

### IMPORTANT: Route ordering in LibraryController

NestJS matches routes top-to-bottom. Place `@Get('unmatched')` BEFORE `@Get('files/:id')` to prevent "unmatched" from being interpreted as a file ID parameter. Alternatively, since unmatched is a sub-path of library (not files), there's no conflict — but verify route doesn't collide with existing patterns.

Current routes:

- `POST /api/library/scan` ✓
- `GET /api/library/scan/:scanId` ✓
- `GET /api/library/files` ✓
- `GET /api/library/files/:id` ✓
- `GET /api/library/unmatched` ← NEW (no conflict)
- `POST /api/library/files/:id/match` ← NEW (no conflict with GET files/:id)

### References

- [Source: _bmad-output/planning-artifacts/epics.md - Story 2.5 acceptance criteria]
- [Source: _bmad-output/planning-artifacts/prd.md - FR5, FR6, NFR12, NFR14]
- [Source: apps/backend/src/library/matching.service.ts - matchMovie/matchTv patterns to reuse]
- [Source: apps/backend/src/library/library.service.ts - getFiles() pagination pattern]
- [Source: apps/backend/src/library/library.controller.ts - existing endpoint patterns]
- [Source: apps/backend/src/library/tmdb.service.ts - searchMovie, searchTv, error types]
- [Source: apps/backend/src/library/library.module.ts - module structure]
- [Source: apps/backend/src/database/database.service.ts - full schema reference]
- [Source: _bmad-output/implementation-artifacts/2-4c-matching-orchestration-and-pipeline-integration.md - learnings]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (GitHub Copilot)

### Debug Log References

### Completion Notes List

### File List
