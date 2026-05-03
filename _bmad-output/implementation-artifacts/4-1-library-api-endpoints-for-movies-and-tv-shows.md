# Story 4.1: Library API Endpoints for Movies and TV Shows

Status: ready-for-dev

## Story

As a viewer,
I want the backend to serve my library data as fast API responses,
so that the frontend can render the poster grid and detail pages instantly.

## Acceptance Criteria

```gherkin
Given the library has matched media files with TMDB metadata
When the frontend requests library data
Then GET /api/library/movies returns all movies with: id, title, year, poster_url, runtime, rating, added_at, transcode_tier, playback_ready status
And GET /api/library/shows returns all TV shows with: id, title, year, poster_url, rating, season_count, added_at
And GET /api/library/movies/:id returns full movie detail: title, description, year, poster_url, runtime, rating, content_rating, available audio tracks, available subtitle tracks, playback file path info
And GET /api/library/shows/:id returns show detail with season list, each season with episode list (episode title, number, duration, playback info)
And GET /api/library/recent returns the most recently added titles (configurable limit, default 20)
And GET /api/library/search?q=... returns titles matching the search query by title substring
And all metadata endpoints respond within 200ms (NFR5)
And only titles with pipeline status "playback-ready" (media_files.status IN ('ready','completed')) appear in viewer-facing endpoints
```

## Tasks / Subtasks

- [ ] 1. Create `apps/backend/src/library/browse.service.ts` (AC: all data endpoints)
  - [ ] 1.1 Define exported interfaces at top of file:
    ```typescript
    export interface MovieListItem {
      id: number;            // media_files.id
      title: string;
      year: number | null;   // parsed from metadata.release_date
      poster_url: string | null;
      runtime: number | null;
      rating: number | null; // metadata.vote_average
      added_at: string;      // media_files.created_at
      transcode_tier: number | null;
      playback_ready: boolean; // always true — filtered at query level
    }
    export interface ShowListItem {
      id: number;            // metadata.tmdb_id (groups all episodes of same show)
      title: string;
      year: number | null;   // parsed from metadata.release_date (first_air_date stored here for TV)
      poster_url: string | null;
      rating: number | null;
      season_count: number;  // COUNT(DISTINCT tv_episodes.season_number)
      added_at: string;      // MIN(media_files.created_at) across all episodes
    }
    export interface AudioTrack {
      index: number;
      codec: string;
      channels: number;
      language: string | null;
    }
    export interface SubtitleTrackInfo {
      id: number;            // subtitles.id
      track_index: number | null;
      type: string;          // 'embedded' | 'sidecar'
      language: string | null;
      codec: string | null;
      webvtt_path: string | null;
    }
    export interface MovieDetail {
      id: number;            // media_files.id
      title: string;
      description: string | null;
      year: number | null;
      poster_url: string | null;
      runtime: number | null;
      rating: number | null;
      content_rating: string | null;
      audio_tracks: AudioTrack[];
      subtitle_tracks: SubtitleTrackInfo[];
      file_id: number;       // media_files.id (same as id — for streaming)
      tier: number | null;
      transcode_output_path: string | null; // transcode_jobs.output_path (Tier 2 → .m4a sidecar, Tier 3 → .mp4)
    }
    export interface EpisodeItem {
      episode_number: number;
      name: string | null;
      duration: number | null; // seconds, from probe_data.format.duration
      file_id: number;       // media_files.id — use for /api/media/stream/:fileId
      tier: number | null;
    }
    export interface SeasonInfo {
      season_number: number;
      episodes: EpisodeItem[];
    }
    export interface ShowDetail {
      id: number;            // metadata.tmdb_id
      title: string;
      description: string | null;
      year: number | null;
      poster_url: string | null;
      rating: number | null;
      seasons: SeasonInfo[]; // sorted: latest season first, episodes ascending within each season
    }
    export interface RecentItem {
      id: number;            // media_files.id for movies, tmdb_id for shows
      title: string;
      year: number | null;
      poster_url: string | null;
      rating: number | null;
      media_type: string;    // 'movie' | 'tv'
      added_at: string;
    }
    ```
  - [ ] 1.2 Define class `BrowseService` with `@Injectable()`, `Logger`, constructor injecting `DatabaseService`
  - [ ] 1.3 Implement `private getImageBaseUrl(): string | null`:
    ```typescript
    private getImageBaseUrl(): string | null {
      const db = this.database.getDatabase();
      const row = db
        .prepare('SELECT image_base_url FROM tmdb_config ORDER BY last_fetched DESC LIMIT 1')
        .get() as { image_base_url: string } | undefined;
      return row?.image_base_url ?? null;
    }
    ```
  - [ ] 1.4 Implement `private buildPosterUrl(imageBaseUrl: string | null, posterPath: string | null): string | null`:
    ```typescript
    // TMDB image URL format: {imageBaseUrl}w500{posterPath}
    // imageBaseUrl ends with '/', e.g. 'https://image.tmdb.org/t/p/'
    // posterPath starts with '/', e.g. '/xyz.jpg'
    // Result: 'https://image.tmdb.org/t/p/w500/xyz.jpg'
    private buildPosterUrl(imageBaseUrl: string | null, posterPath: string | null): string | null {
      if (!imageBaseUrl || !posterPath) return null;
      return `${imageBaseUrl}w500${posterPath}`;
    }
    ```
  - [ ] 1.5 Implement `private extractYear(dateStr: string | null): number | null`:
    ```typescript
    private extractYear(dateStr: string | null): number | null {
      if (!dateStr) return null;
      const year = parseInt(dateStr.substring(0, 4), 10);
      return Number.isNaN(year) ? null : year;
    }
    ```
  - [ ] 1.6 Implement `private getDuration(probeDataJson: string | null): number | null`:
    ```typescript
    // probe_data is stored as JSON string matching ProbeResult interface
    private getDuration(probeDataJson: string | null): number | null {
      if (!probeDataJson) return null;
      try {
        const probe = JSON.parse(probeDataJson) as { format?: { duration?: number } };
        return probe.format?.duration ?? null;
      } catch {
        return null;
      }
    }
    ```
  - [ ] 1.7 Implement `private getAudioTracks(probeDataJson: string | null): AudioTrack[]`:
    ```typescript
    private getAudioTracks(probeDataJson: string | null): AudioTrack[] {
      if (!probeDataJson) return [];
      try {
        const probe = JSON.parse(probeDataJson) as { audioTracks?: AudioTrack[] };
        return probe.audioTracks ?? [];
      } catch {
        return [];
      }
    }
    ```
  - [ ] 1.8 Implement `getMovies(): MovieListItem[]`:
    ```sql
    SELECT mf.id, m.title, m.release_date, m.poster_path, m.runtime,
           m.vote_average AS rating, mf.created_at AS added_at, mf.tier
    FROM media_files mf
    JOIN metadata m ON m.media_file_id = mf.id
    WHERE m.media_type = 'movie' AND mf.status IN ('ready', 'completed')
    ORDER BY m.title ASC
    ```
    Map rows to `MovieListItem`: call `extractYear(release_date)`, `buildPosterUrl(imageBaseUrl, poster_path)`.
    Set `playback_ready = true` (always — filtered by query).
    Call `getImageBaseUrl()` once before the main query and reuse across all rows.
  - [ ] 1.9 Implement `getShows(): ShowListItem[]`:
    ```sql
    SELECT m.tmdb_id AS id, MIN(m.title) AS title,
           MIN(m.release_date) AS release_date,
           MIN(m.poster_path) AS poster_path,
           MIN(m.vote_average) AS rating,
           MIN(mf.created_at) AS added_at,
           COUNT(DISTINCT te.season_number) AS season_count
    FROM metadata m
    JOIN media_files mf ON mf.id = m.media_file_id
    LEFT JOIN tv_episodes te ON te.metadata_id = m.id
    WHERE m.media_type = 'tv' AND mf.status IN ('ready', 'completed')
    GROUP BY m.tmdb_id
    ORDER BY MIN(m.title) ASC
    ```
    Map rows to `ShowListItem`: call `extractYear(release_date)`, `buildPosterUrl(imageBaseUrl, poster_path)`.
    Call `getImageBaseUrl()` once before the query.
  - [ ] 1.10 Implement `getMovieById(id: number): MovieDetail | null`:
    - Query 1 — main row:
      ```sql
      SELECT mf.id, mf.path AS file_path, mf.tier, mf.probe_data,
             m.title, m.overview, m.release_date, m.poster_path,
             m.runtime, m.vote_average AS rating, m.content_rating,
             tj.output_path AS transcode_output_path
      FROM media_files mf
      JOIN metadata m ON m.media_file_id = mf.id
      LEFT JOIN transcode_jobs tj ON tj.file_id = mf.id
      WHERE mf.id = ? AND m.media_type = 'movie' AND mf.status IN ('ready', 'completed')
      ```
      Return `null` if row not found.
    - Query 2 — subtitles for this file:
      ```sql
      SELECT id, track_index, type, language, codec, webvtt_path
      FROM subtitles
      WHERE media_file_id = ?
      ORDER BY id ASC
      ```
    - Build `MovieDetail`: parse `probe_data` for audio tracks via `getAudioTracks()`, map subtitles rows to `SubtitleTrackInfo[]`.
  - [ ] 1.11 Implement `getShowById(tmdbId: number): ShowDetail | null`:
    - Query 1 — show header (any one row for the show):
      ```sql
      SELECT m.title, m.overview, m.release_date, m.poster_path, m.vote_average AS rating
      FROM metadata m
      JOIN media_files mf ON mf.id = m.media_file_id
      WHERE m.tmdb_id = ? AND m.media_type = 'tv' AND mf.status IN ('ready', 'completed')
      LIMIT 1
      ```
      Return `null` if no rows found (show not in library or not playback-ready).
    - Query 2 — all episodes for this show:
      ```sql
      SELECT mf.id AS file_id, mf.tier, mf.probe_data,
             te.season_number, te.episode_number, te.name AS episode_name
      FROM metadata m
      JOIN media_files mf ON mf.id = m.media_file_id
      LEFT JOIN tv_episodes te ON te.metadata_id = m.id
      WHERE m.tmdb_id = ? AND m.media_type = 'tv' AND mf.status IN ('ready', 'completed')
      ORDER BY te.season_number DESC, te.episode_number ASC
      ```
    - Build `ShowDetail`: group episode rows into seasons. Season ordering: DESC by season_number (most recent season first). Episodes ordering within each season: ASC by episode_number.
    - Use a `Map<number, EpisodeItem[]>` to group, then convert to `SeasonInfo[]`.
    - Call `getDuration(probe_data)` per episode row to get duration.
  - [ ] 1.12 Implement `getRecent(limit: number): RecentItem[]`:
    ```sql
    SELECT
      CASE WHEN m.media_type = 'movie' THEN mf.id ELSE m.tmdb_id END AS id,
      m.title, m.release_date, m.poster_path, m.vote_average AS rating,
      m.media_type, MAX(mf.created_at) AS added_at
    FROM media_files mf
    JOIN metadata m ON m.media_file_id = mf.id
    WHERE mf.status IN ('ready', 'completed')
    GROUP BY
      CASE WHEN m.media_type = 'movie' THEN mf.id ELSE m.tmdb_id END,
      m.title, m.release_date, m.poster_path, m.vote_average, m.media_type
    ORDER BY MAX(mf.created_at) DESC
    LIMIT ?
    ```
    This deduplicates TV shows (multiple episodes of same show collapse to one entry using tmdb_id). Returns the most recently added distinct titles.
    Map rows to `RecentItem[]` with `extractYear()` and `buildPosterUrl()`.
  - [ ] 1.13 Implement `search(q: string): RecentItem[]`:
    ```typescript
    // Returns same RecentItem shape as getRecent() but filtered by title
    // q = '' → returns all (% LIKE % matches everything — intentional for "cleared search" UX)
    // q with SQL wildcards (%, _) treated as literal wildcards — acceptable for title substring search
    const pattern = '%' + q + '%';
    ```
    ```sql
    SELECT
      CASE WHEN m.media_type = 'movie' THEN mf.id ELSE m.tmdb_id END AS id,
      m.title, m.release_date, m.poster_path, m.vote_average AS rating,
      m.media_type, MAX(mf.created_at) AS added_at
    FROM media_files mf
    JOIN metadata m ON m.media_file_id = mf.id
    WHERE mf.status IN ('ready', 'completed') AND m.title LIKE ? COLLATE NOCASE
    GROUP BY
      CASE WHEN m.media_type = 'movie' THEN mf.id ELSE m.tmdb_id END,
      m.title, m.release_date, m.poster_path, m.vote_average, m.media_type
    ORDER BY m.title ASC
    ```
    Pass `pattern` as the bound parameter — parameterized binding prevents SQL injection.
    Return `RecentItem[]` (same shape as `getRecent` — frontend uses `media_type` to route).
  - [ ] 1.14 Add required imports: `Injectable`, `Logger` from `@nestjs/common`; `DatabaseService` from `../database/database.service`

- [ ] 2. Create `apps/backend/src/library/browse.controller.ts` (AC: all 6 endpoints)
  - [ ] 2.1 Define `@Controller('library')` class `BrowseController` injecting `BrowseService`
  - [ ] 2.2 Add `@Get('movies')` handler `getMovies()` → returns `this.browseService.getMovies()`
  - [ ] 2.3 Add `@Get('shows')` handler `getShows()` → returns `this.browseService.getShows()`
  - [ ] 2.4 Add `@Get('recent')` handler `getRecent(@Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number)` → returns `this.browseService.getRecent(limit)`
  - [ ] 2.5 Add `@Get('search')` handler `search(@Query('q') q: string = '')` → returns `this.browseService.search(q ?? '')`
  - [ ] 2.6 Add `@Get('movies/:id')` handler `getMovie(@Param('id', ParseIntPipe) id: number)`:
    ```typescript
    @Get('movies/:id')
    getMovie(@Param('id', ParseIntPipe) id: number) {
      const result = this.browseService.getMovieById(id);
      if (!result) throw new NotFoundException(`Movie with id ${id} not found`);
      return result;
    }
    ```
  - [ ] 2.7 Add `@Get('shows/:id')` handler `getShow(@Param('id', ParseIntPipe) id: number)`:
    ```typescript
    @Get('shows/:id')
    getShow(@Param('id', ParseIntPipe) id: number) {
      const result = this.browseService.getShowById(id);
      if (!result) throw new NotFoundException(`Show with tmdb_id ${id} not found`);
      return result;
    }
    ```
  - [ ] 2.8 Import: `Controller`, `Get`, `Param`, `Query`, `NotFoundException`, `ParseIntPipe`, `DefaultValuePipe` from `@nestjs/common`; `BrowseService` and relevant interfaces from `./browse.service`
  - [ ] 2.9 **Route order caveat:** NestJS resolves static routes before dynamic routes within the same controller prefix. `movies`, `shows`, `recent`, `search` are static; `movies/:id` and `shows/:id` are dynamic. NestJS handles this correctly — no manual ordering needed.

- [ ] 3. Register in `apps/backend/src/library/library.module.ts`
  - [ ] 3.1 Add `import { BrowseService } from './browse.service';`
  - [ ] 3.2 Add `import { BrowseController } from './browse.controller';`
  - [ ] 3.3 Add `BrowseService` to `providers` array
  - [ ] 3.4 Add `BrowseController` to `controllers` array
  - [ ] 3.5 Add `BrowseService` to `exports` array (for future inter-module use)

- [ ] 4. Create `apps/backend/src/library/browse.service.spec.ts` (AC: all service methods)
  - [ ] 4.1 Set up test module using actual `DatabaseService` with `CACHE_PATH = ':memory:'` — follow `pipeline.service.spec.ts` pattern exactly:
    ```typescript
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          BrowseService,
          DatabaseService,
          {
            provide: ConfigService,
            useValue: { get: (key: string) => key === 'CACHE_PATH' ? ':memory:' : undefined },
          },
        ],
      }).compile();
      dbService = module.get<DatabaseService>(DatabaseService);
      dbService.onModuleInit();
      db = dbService.getDatabase();
      service = module.get<BrowseService>(BrowseService);
    });
    afterEach(() => { dbService.onModuleDestroy(); });
    ```
  - [ ] 4.2 Define helper functions (same `lastInsertRowid as number` pattern from pipeline.service.spec.ts):
    ```typescript
    function insertSource(type: 'movies' | 'tv' = 'movies'): number
    function insertMediaFile(sourceId: number, filename: string, status = 'ready', tier: number | null = 1): number
    function insertMediaFileWithProbeData(sourceId: number, filename: string, probeDataJson: string, status = 'ready', tier: number | null = 1): number
    function insertMetadata(fileId: number, tmdbId: number, mediaType: 'movie' | 'tv', title: string, extras?: Partial<...>): number
    function insertTvEpisode(metadataId: number, seasonNumber: number, episodeNumber: number, name?: string): number
    function insertTranscodeJob(fileId: number, tier: number, status: string, outputPath?: string): number
    function insertSubtitle(mediaFileId: number, type: 'embedded' | 'sidecar', language?: string, webvttPath?: string): number
    function insertTmdbConfig(imageBaseUrl: string): void
    ```
    `insertMetadata` extras: `release_date`, `poster_path`, `overview`, `vote_average`, `runtime`, `content_rating`
  - [ ] 4.3 Tests for `getMovies()`:
    - Empty DB: returns `[]`
    - Single ready movie: returns one item with correct fields (title, year extracted from release_date, poster_url built correctly, transcode_tier, playback_ready = true)
    - Movie with status='completed': also included in results (Tier 1 files go to 'completed')
    - Movie with status='classified': NOT included (not playback-ready)
    - Multiple movies: returned ordered A-Z by title
    - Movie with null poster_path: poster_url = null
    - Missing tmdb_config (no image_base_url): poster_url = null
    - poster_url construction: given imageBaseUrl = 'https://image.tmdb.org/t/p/', posterPath = '/abc.jpg' → 'https://image.tmdb.org/t/p/w500/abc.jpg'
  - [ ] 4.4 Tests for `getShows()`:
    - Empty DB: returns `[]`
    - Single show with 2 episodes across 2 seasons: returns 1 show entry with season_count = 2
    - Show with status='completed' episodes: included
    - Show with multiple episodes, only some ready: only includes ready/completed episodes in season_count
    - Multiple shows: ordered A-Z
    - added_at = MIN(media_files.created_at) across all episodes for the show
  - [ ] 4.5 Tests for `getMovieById()`:
    - Non-existent id: returns null
    - Existing movie id: returns full MovieDetail with correct fields
    - Audio tracks parsed from probe_data correctly (index, codec, channels, language)
    - No probe_data: audio_tracks = []
    - Subtitles included: webvtt_path, language, type populated
    - No subtitles: subtitle_tracks = []
    - Tier 2 movie with transcode job: transcode_output_path = job's output_path (.m4a sidecar path)
    - Tier 1 movie (no transcode job): transcode_output_path = null
    - Movie with status='classified' (not ready): returns null
    - TV show file with same id: returns null (WHERE media_type = 'movie' filter)
  - [ ] 4.6 Tests for `getShowById()`:
    - Non-existent tmdbId: returns null
    - Single show, one season, two episodes: correct season/episode structure
    - Season ordering: latest season first (DESC by season_number)
    - Episode ordering within season: ASC by episode_number
    - Multiple seasons: all seasons present
    - episode duration from probe_data
    - file_id = media_files.id for each episode
    - Show with no ready episodes: returns null
  - [ ] 4.7 Tests for `getRecent()`:
    - Empty DB: returns `[]`
    - Mixed movies and TV shows: returned together, ordered by added_at DESC
    - TV show with 3 episodes: appears ONCE (grouped by tmdb_id, MAX(created_at))
    - `limit` parameter: returns at most `limit` items
    - `limit = 1`: returns only the most recently added
  - [ ] 4.8 Tests for `search()`:
    - `q = 'Task'`: matches 'Taskmaster' (substring, case-insensitive)
    - `q = 'task'`: same result (COLLATE NOCASE)
    - `q = ''`: returns all ready titles
    - `q = 'nonexistent'`: returns `[]`
    - TV show: appears once even with multiple matching episodes

- [ ] 5. Create `apps/backend/src/library/browse.controller.spec.ts` (AC: all endpoints)
  - [ ] 5.1 Set up test module with mock `BrowseService` — follow `library.controller.spec.ts` / `pipeline.controller.spec.ts` pattern:
    ```typescript
    browseService = {
      getMovies: jest.fn(),
      getShows: jest.fn(),
      getMovieById: jest.fn(),
      getShowById: jest.fn(),
      getRecent: jest.fn(),
      search: jest.fn(),
    };
    ```
  - [ ] 5.2 Test `GET /library/movies`: mock returns array; controller returns it; `getMovies()` called once
  - [ ] 5.3 Test `GET /library/shows`: mock returns array; controller returns it; `getShows()` called once
  - [ ] 5.4 Test `GET /library/movies/:id` — found: mock returns MovieDetail object; controller returns it; `getMovieById(42)` called with correct id
  - [ ] 5.5 Test `GET /library/movies/:id` — not found: mock returns null; controller throws `NotFoundException`
  - [ ] 5.6 Test `GET /library/shows/:id` — found: mock returns ShowDetail; controller returns it
  - [ ] 5.7 Test `GET /library/shows/:id` — not found: mock returns null; controller throws `NotFoundException`
  - [ ] 5.8 Test `GET /library/recent` — default limit: `getRecent(20)` called; controller returns result
  - [ ] 5.9 Test `GET /library/recent?limit=5`: `getRecent(5)` called with limit=5
  - [ ] 5.10 Test `GET /library/search?q=foo`: `search('foo')` called; controller returns result
  - [ ] 5.11 Test `GET /library/search` (no q): `search('')` called (empty string default)
  - [ ] 5.12 Verify `toHaveBeenCalledTimes(1)` on all mock method assertions

- [ ] 6. Run full backend test suite — no regressions
  - [ ] 6.1 `npm test -w apps/backend` — all existing tests pass; new tests pass
  - [ ] 6.2 Verify no TypeScript compile errors: `npm run build -w apps/backend`

## Dev Notes

### Critical: Playback-Ready Status Filter

**⚠️ NEVER filter with only `status = 'ready'`** — this will exclude Tier 1 files.

The media_files status lifecycle is:
```
discovered → probed → matched → classified → ready (Tier 2/3 after transcode completes)
                                                   ↓
                                           completed (Tier 1 only, after subtitle conversion queue runs)
```
- Tier 1 files: `status = 'ready'` immediately after classification → `status = 'completed'` after `SubtitleService.executeSubtitleConversionQueue()` runs (see `apps/backend/src/library/subtitle.service.ts` line ~65)
- Tier 2 files: `status = 'ready'` after `TranscodeService.processAudioSidecar()` completes
- Tier 3 files: `status = 'ready'` after `TranscodeService.processVideoTranscode()` completes

**All viewer-facing queries MUST use**: `WHERE mf.status IN ('ready', 'completed')`

### ID Strategy: Movies vs TV Shows

| Endpoint | `:id` Parameter | Reason |
|----------|-----------------|--------|
| `GET /api/library/movies` | returns `media_files.id` | Each movie file is distinct |
| `GET /api/library/movies/:id` | `media_files.id` | Joins to metadata + subtitles + transcode_jobs |
| `GET /api/library/shows` | returns `metadata.tmdb_id` | Multiple episode files share same tmdb_id |
| `GET /api/library/shows/:id` | `metadata.tmdb_id` | Aggregates all episodes for the show |
| `GET /api/library/recent` | mixed: `media_files.id` for movies, `tmdb_id` for TV | Frontend uses `media_type` to route correctly |
| `GET /api/library/search` | same as recent | Same mixed shape |

### Poster URL Construction

```
TMDB imageBaseUrl from tmdb_config: 'https://image.tmdb.org/t/p/'
TMDB posterPath from metadata:      '/abc123.jpg'
Result:                             'https://image.tmdb.org/t/p/w500/abc123.jpg'
```
- `w500` is the poster size (standard for grid display, ~500px wide)
- `imageBaseUrl` ends with `/`, `posterPath` starts with `/` → use `${imageBaseUrl}w500${posterPath}`
- If either is null → return null for poster_url (safe fallback)
- `getImageBaseUrl()` reads from `tmdb_config` table synchronously (DB cache, no async TMDB call needed)

### Audio Tracks from probe_data

`media_files.probe_data` is a JSON string matching the `ProbeResult` interface from `probe.service.ts`:
```typescript
interface ProbeResult {
  format: { container: string; duration: number; bitrate: number; }
  video: { codec: string; width: number; height: number; profile?: string; } | null;
  audioTracks: Array<{ index: number; codec: string; channels: number; language?: string; }>
  subtitleTracks: Array<{ index: number; codec: string; language?: string; }>
}
```
Parse with `JSON.parse(mf.probe_data)` — wrap in try/catch (returns `[]` on parse failure).

### Transcode Output Path

`transcode_jobs.output_path` stores:
- Tier 2 (audio sidecar): `{CACHE_PATH}/sidecars/{file_id}.m4a`
- Tier 3 (full transcode): `{CACHE_PATH}/transcodes/{file_id}.mp4`
- Tier 1: No `transcode_jobs` row → `LEFT JOIN` returns null for `output_path`

This field (`transcode_output_path` in `MovieDetail` and future show episode detail) will be used by Story 5.1's media serving endpoint to locate the correct file.

### TV Show Episode Duration

Episode duration comes from `media_files.probe_data.format.duration` (seconds, float). Each episode is a separate `media_files` row. Extract via `getDuration(mf.probe_data)`.

Note: `tv_episodes` table does NOT store duration — it only stores `season_number`, `episode_number`, `name`, `overview`, `air_date`, `still_path`. Duration is always from probe_data.

### Database Schema Reference (Relevant Tables)

```sql
media_files: id, path, filename, source_id, status, size, mtime, probe_data (JSON), tier, created_at, updated_at

metadata: id, media_file_id (UNIQUE FK), tmdb_id, media_type ('movie'|'tv'),
          title, overview, poster_path, backdrop_path, vote_average, runtime,
          release_date, content_rating, genres, created_at, updated_at

tv_episodes: id, metadata_id (FK → metadata.id), season_number, episode_number,
             name, overview, air_date, still_path, created_at

transcode_jobs: id, file_id (FK → media_files.id UNIQUE), tier, status,
                error_details, output_path, created_at, updated_at

subtitles: id, media_file_id (FK → media_files.id), track_index, type ('embedded'|'sidecar'),
           language, codec, sidecar_path, webvtt_path, created_at

tmdb_config: id, image_base_url, last_fetched
```

### TV Show Data Model Clarification

Each episode file is a **separate** `media_files` row. Each file has one `metadata` row (with `media_type='tv'`). All episodes of the same show share the same `tmdb_id` in their `metadata` rows. Each `metadata` row has exactly one `tv_episodes` row (for the specific episode in that file).

Relationship chain: `media_files` 1→1 `metadata` 1→1 `tv_episodes`

Multiple `media_files` can share the same `tmdb_id` (all episodes of the same show). Use `GROUP BY m.tmdb_id` to aggregate shows.

### NestJS Controller with Same Prefix

NestJS supports multiple `@Controller('library')` classes in the same module — routes are merged at startup. `BrowseController` and `LibraryController` both use `@Controller('library')` and will coexist without conflict. No routes overlap between them.

### File Locations (Project Structure)

```
apps/backend/src/library/
├── browse.controller.ts       ← NEW
├── browse.controller.spec.ts  ← NEW
├── browse.service.ts          ← NEW
├── browse.service.spec.ts     ← NEW
├── library.module.ts          ← UPDATE (add BrowseService + BrowseController)
├── library.controller.ts      ← DO NOT MODIFY
├── pipeline.controller.ts     ← reference for controller pattern
├── pipeline.service.ts        ← reference for service pattern
└── ...
```

### Existing Patterns to Follow

- Service pattern: `pipeline.service.ts` (synchronous better-sqlite3 queries, Logger, Injectable)
- Controller pattern: `pipeline.controller.ts` (thin controller, delegates to service, no extra error handling on read-only queries)
- Controller exception pattern: `library.controller.ts` (NotFoundException for missing resources)
- Service spec pattern: `pipeline.service.spec.ts` (actual DatabaseService with :memory:, helper functions, afterEach onModuleDestroy)
- Controller spec pattern: `library.controller.spec.ts` (mock service, jest.fn(), toHaveBeenCalledWith)

### NFR5: 200ms Response Time

All queries use synchronous better-sqlite3 against an on-disk SQLite file. No network calls during request handling (TMDB image URL is read from DB cache, not fetched live). All queries are single-pass JOINs or simple GROUPs — response time well under 200ms for typical library sizes.

### Deferred / Out of Scope for This Story

- Pagination on `getMovies()` and `getShows()` — not in AC; library expected to fit in one response
- Auth guards — no endpoints in codebase have auth; pre-existing pattern
- `LIMIT` on `getMovies()` / `getShows()` — the AC specifies all movies/shows, no pagination
- Frontend components (Stories 4.2–4.6)
- Media serving endpoints (Story 5.1)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.5 (GitHub Copilot)

### Debug Log References

### Completion Notes List

### File List

- apps/backend/src/library/browse.service.ts (NEW)
- apps/backend/src/library/browse.controller.ts (NEW)
- apps/backend/src/library/browse.service.spec.ts (NEW)
- apps/backend/src/library/browse.controller.spec.ts (NEW)
- apps/backend/src/library/library.module.ts (UPDATE)
