# Story 2.4b: TMDB API Service

Status: review

## Story

As an admin,
I want the system to communicate with the TMDB API to search for and retrieve movie/TV metadata,
so that the matching pipeline can fetch rich metadata including posters, descriptions, and ratings.

## Acceptance Criteria

```gherkin
Given the TMDB_API_KEY environment variable is configured
When the TMDB service is called to search or fetch details
Then searches use the correct TMDB endpoint (search/movie or search/tv) with proper authentication
And movie details include title, overview, poster_path, backdrop_path, vote_average, runtime, release_date, genres
And TV details include title, overview, poster_path, vote_average, first_air_date, genres, plus season/episode details
And the TMDB image base URL is fetched from /3/configuration and cached in the database
And the cached image config is refreshed every 24 hours (NFR21)
And HTTP 429 rate limit responses trigger exponential backoff with Retry-After header respect (NFR18)
And network errors or 5xx responses are surfaced as retriable failures without crashing (NFR19)
And the API key is never exposed to the frontend (NFR12)
```

## Tasks / Subtasks

- [x] 1. Database schema for TMDB config caching (AC: 4, 5)
  - [x] 1.1 Add `tmdb_config` table to `DatabaseService.runMigrations()`: id, image_base_url, last_fetched
- [x] 2. Create `TmdbService` in library module (AC: all)
  - [x] 2.1 Inject NestJS `ConfigService` to read `TMDB_API_KEY` env var (NFR12)
  - [x] 2.2 Inject `DatabaseService` for tmdb_config cache reads/writes
  - [x] 2.3 Implement private `fetchWithRetry(url: string): Promise<Response>` — wraps native `fetch` with rate limit and error handling
  - [x] 2.4 Implement rate limit handling: on HTTP 429, read `Retry-After` header, wait, retry up to 3 times with exponential backoff (1s → 2s → 4s) (NFR18)
  - [x] 2.5 Implement error classification: network error / 5xx → throw `TmdbUnavailableError`; 4xx (not 429) → throw `TmdbClientError`
  - [x] 2.6 Implement `searchMovie(title: string, year?: number): Promise<TmdbSearchResult[]>` — calls `GET /3/search/movie?query=...&year=...&language=en-US`
  - [x] 2.7 Implement `searchTv(title: string, year?: number): Promise<TmdbSearchResult[]>` — calls `GET /3/search/tv?query=...&first_air_date_year=...&language=en-US`
  - [x] 2.8 Implement `getMovieDetails(tmdbId: number): Promise<TmdbMovieDetails>` — calls `GET /3/movie/{id}?language=en-US`
  - [x] 2.9 Implement `getTvDetails(tmdbId: number): Promise<TmdbTvDetails>` — calls `GET /3/tv/{id}?language=en-US`
  - [x] 2.10 Implement `getTvSeasonDetails(tmdbId: number, seasonNum: number): Promise<TmdbSeasonDetails>` — calls `GET /3/tv/{id}/season/{season_number}?language=en-US`
  - [x] 2.11 Implement `getImageBaseUrl(): Promise<string>` — returns cached base URL if fresh (<24h), otherwise fetches `/3/configuration` and updates `tmdb_config` table
  - [x] 2.12 Use Bearer token auth: `Authorization: Bearer ${TMDB_API_KEY}` header on all requests
- [x] 3. Define TypeScript interfaces (AC: 2, 3)
  - [x] 3.1 `TmdbSearchResult`: { id, title/name, overview, poster_path, release_date/first_air_date, vote_average, popularity }
  - [x] 3.2 `TmdbMovieDetails`: { id, title, overview, poster_path, backdrop_path, vote_average, runtime, release_date, genres[], production_countries[] }
  - [x] 3.3 `TmdbTvDetails`: { id, name, overview, poster_path, backdrop_path, vote_average, first_air_date, genres[], number_of_seasons }
  - [x] 3.4 `TmdbSeasonDetails`: { season_number, episodes[]: { episode_number, name, overview, air_date, still_path } }
  - [x] 3.5 `TmdbUnavailableError` and `TmdbClientError` custom error classes
- [x] 4. Register in LibraryModule (AC: all)
  - [x] 4.1 Add `TmdbService` to providers in `library.module.ts`
  - [x] 4.2 Export `TmdbService` from `LibraryModule` for use by MatchingService and future Story 2.5
- [x] 5. Unit tests (AC: all)
  - [x] 5.1 Test searchMovie — mock fetch returning sample TMDB search results JSON
  - [x] 5.2 Test searchTv — mock fetch returning TV search results
  - [x] 5.3 Test getMovieDetails — mock fetch returning movie detail JSON
  - [x] 5.4 Test getTvSeasonDetails — mock fetch returning season detail with episodes
  - [x] 5.5 Test rate limit: mock 429 response with Retry-After header, verify retry after delay
  - [x] 5.6 Test TMDB unavailable: mock network error (fetch throws), verify `TmdbUnavailableError` thrown
  - [x] 5.7 Test TMDB 5xx: mock 503 response, verify `TmdbUnavailableError` thrown
  - [x] 5.8 Test image base URL caching: first call fetches from API, second call returns cached, third call after 24h refetches
  - [x] 5.9 Test missing API key: verify meaningful error on startup/first call

## Dev Notes

### Technical Implementation: TMDB API Client

**Authentication:** Use TMDB v3 API with Read Access Token (Bearer token in Authorization header).

```typescript
// API call pattern — all requests follow this structure
private async fetchWithRetry(url: string): Promise<any> {
  const apiKey = this.config.get<string>('TMDB_API_KEY');
  if (!apiKey) throw new Error('TMDB_API_KEY not configured');

  let lastError: Error | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json',
        },
      });

      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '1', 10);
        const delay = Math.max(retryAfter * 1000, Math.pow(2, attempt) * 1000);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      if (response.status >= 500) {
        throw new TmdbUnavailableError(`TMDB returned ${response.status}`);
      }

      if (!response.ok) {
        throw new TmdbClientError(`TMDB returned ${response.status}: ${await response.text()}`);
      }

      return await response.json();
    } catch (err) {
      if (err instanceof TmdbUnavailableError || err instanceof TmdbClientError) throw err;
      lastError = err as Error;
      // Network error — treat as unavailable
      if (attempt === 2) throw new TmdbUnavailableError(`Network error: ${lastError.message}`);
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
    }
  }
  throw new TmdbUnavailableError(lastError?.message || 'Max retries exceeded');
}
```

**Key TMDB API endpoints:**

- Search Movie: `GET https://api.themoviedb.org/3/search/movie?query=...&year=...&language=en-US&page=1`
- Search TV: `GET https://api.themoviedb.org/3/search/tv?query=...&first_air_date_year=...&language=en-US&page=1`
- Movie Details: `GET https://api.themoviedb.org/3/movie/{id}?language=en-US`
- TV Details: `GET https://api.themoviedb.org/3/tv/{id}?language=en-US`
- TV Season: `GET https://api.themoviedb.org/3/tv/{id}/season/{season_number}?language=en-US`
- Configuration: `GET https://api.themoviedb.org/3/configuration`

**Image URL Construction (NFR21):**

- Full poster URL = `{secure_base_url}{size}{poster_path}` e.g. `https://image.tmdb.org/t/p/w342/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg`
- Configuration response: `{ images: { secure_base_url: "https://image.tmdb.org/t/p/", poster_sizes: ["w92","w154","w185","w342","w500","w780","original"] } }`
- Store `secure_base_url` in `tmdb_config` table with `last_fetched` timestamp
- On `getImageBaseUrl()`: if `last_fetched` > 24 hours ago, re-fetch from API; otherwise return cached value

**Rate Limiting (NFR18):**

- TMDB rate limit: ~50 requests per second (generous for sequential processing)
- On HTTP 429: read `Retry-After` header (seconds), wait, retry
- Exponential backoff: 1s → 2s → 4s → give up after 3 attempts
- Sequential file processing naturally throttles requests

### Architecture Compliance

1. **TMDB API key security (NFR12):** Key loaded via NestJS `ConfigService` from env var. Never returned in any API response.
2. **Graceful Degradation (NFR19):** `TmdbUnavailableError` is a typed error that calling code (MatchingService in 2-4c) uses to decide retry vs permanent failure.
3. **No new external dependencies:** Use Node.js native `fetch` (globally available in Node 18+). No axios, no node-fetch.
4. **Database for caching:** Use `tmdb_config` table (better-sqlite3, synchronous) to persist image base URL across restarts.

### Database Schema Addition

```sql
CREATE TABLE IF NOT EXISTS tmdb_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  image_base_url TEXT NOT NULL,
  last_fetched TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Library/Framework Requirements

- **NestJS patterns:** `@Injectable()` provider in `LibraryModule`
- **NestJS ConfigService:** Inject to read `TMDB_API_KEY` environment variable
- **better-sqlite3:** Synchronous DB operations for tmdb_config cache
- **No HTTP client library:** Native `fetch` only
- **Error handling:** Two custom error classes distinguish retriable (TmdbUnavailableError) from permanent (TmdbClientError) failures
- **Testing:** Mock `global.fetch` via jest.spyOn or jest.fn()

### File Structure

```
apps/backend/src/library/
├── tmdb.service.ts                  # NEW: TMDB API client with retry/caching
├── tmdb.service.spec.ts             # NEW: unit tests
├── library.module.ts                # UPDATE: add to providers/exports
apps/backend/src/database/
└── database.service.ts              # UPDATE: add tmdb_config table migration
```

### Previous Story Intelligence (Learnings from 2.3)

- better-sqlite3 uses **synchronous API** — cache reads/writes are blocking, NOT async
- Schema additions go in `DatabaseService.runMigrations()` using `CREATE TABLE IF NOT EXISTS`
- Services follow `@Injectable()` pattern in `LibraryModule`
- The `.env` file must include `TMDB_API_KEY` — ensure it's documented

### References

- [Source: _bmad-output/planning-artifacts/epics.md - Story 2.4 ACs: TMDB matching, rate limits, image caching]
- [Source: _bmad-output/planning-artifacts/prd.md - FR4, NFR12, NFR18, NFR19, NFR21]
- [Source: TMDB API Reference - search/movie, search/tv, movie details, tv details, configuration endpoints]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (GitHub Copilot)

### Debug Log References

None — clean implementation, all tests passed.

### Completion Notes List

- Added `tmdb_config` table to database migrations for image base URL caching with 24h TTL
- Implemented `TmdbService` as `@Injectable()` NestJS service using native `fetch` (no external HTTP deps)
- All 5 TMDB endpoints implemented: searchMovie, searchTv, getMovieDetails, getTvDetails, getTvSeasonDetails
- `getImageBaseUrl()` caches configuration response in SQLite with 24h refresh
- Rate limiting: HTTP 429 → read Retry-After header, exponential backoff (1s→2s→4s), 3 attempts max
- Error classification: network/5xx → `TmdbUnavailableError` (retriable), 4xx → `TmdbClientError` (permanent)
- Bearer token auth via `TMDB_API_KEY` env var through NestJS ConfigService (never exposed to frontend)
- TypeScript interfaces: TmdbSearchResult, TmdbMovieDetails, TmdbTvDetails, TmdbSeasonDetails
- 11 unit tests covering all endpoints, rate limiting, error handling, and cache lifecycle
- Full regression suite: 59 tests across 8 suites — all passing, zero regressions

### File List

- apps/backend/src/library/tmdb.service.ts (NEW)
- apps/backend/src/library/tmdb.service.spec.ts (NEW)
- apps/backend/src/library/library.module.ts (MODIFIED)
- apps/backend/src/database/database.service.ts (MODIFIED)

## Change Log

- 2026-05-02: Implemented TmdbService — TMDB API client with retry/backoff, error classification, image base URL caching, and full unit test coverage
