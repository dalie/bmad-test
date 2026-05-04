## Deferred from: code review of 4-4-tv-show-detail-page-with-season-and-episode-listings (2026-05-03)

- Route param snapshot stale on same-route navigation — spec explicitly mandated `snapshot.paramMap` to prevent "not found" flash (4-3 fix); no in-app show→show nav in current UI.
- Loading state flash during fetch — `initialValue: null` briefly shows "Show not found." while HTTP is in-flight; spec-accepted trade-off, no loading indicator required.
- Responsive breakpoint `600px` is a magic number — all other dimensions use CSS tokens; design-system gap, pre-existing pattern.
- `getDuration()` returns `0` as sentinel for unknown duration — pre-existing ProbeService behavior (noted again here); fix belongs in ProbeService.
- `ShowDetail.id` = `tmdb_id` naming — pre-existing API contract, documented in Dev Notes; rename if API is ever versioned.

## Deferred from: code review of 4-3-movie-detail-page (2026-05-03)

- API errors (503/401/network timeout) in `getMovieById()` are caught by `catchError(() => of(null))` and shown as "Movie not found." — no spec requirement for error differentiation; consistent with project-wide error-handling pattern.
- Negative ID in route param (e.g., `/movie/-1`) passes the `!id` guard (`!(-1) === false`) and fires a backend HTTP call — backend returns 404, `catchError` handles gracefully; low-priority hardening for a future story.
- Backend `getMovieById()` `LEFT JOIN transcode_jobs` lacks `ORDER BY`/`LIMIT 1` — if a `file_id` has multiple `completed` transcode rows, the returned `transcode_output_path` is non-deterministic; pre-existing in `apps/backend/src/library/browse.service.ts`.

## Deferred from: code review of spec-fix-csp-tmdb-img-src (2026-05-03)

- `script-src: ["'self'"]` default may be too strict for some Angular runtime patterns — audit Angular production build output for inline scripts; predates this change.
- TMDB image base URL is fetched dynamically from TMDB API but CSP hardcodes `https://image.tmdb.org` — if TMDB ever changes CDN hostname, move to a config env var; stable for years so deferred.

## Deferred from: code review of spec-fix-null-poster-url-in-library-api (2026-05-03)

- `startScan(true)` is fire-and-forget inside an async `onModuleInit()` — if startScan rejects, Node.js 18+ will emit an unhandled rejection (potentially crashing the process). Pre-existing pattern; fix belongs in LibraryService.
- `tmdb_config` rows with `null` or empty `image_base_url` inside the 24h TTL are returned by `TmdbService.getImageBaseUrl()` without validation — pre-existing issue in TmdbService; could cause malformed poster URLs.

## Deferred from: code review of 4-2-poster-grid-home-page-with-three-sections (2026-05-03)

- Missing `/movie/:id` and `/show/:id` route handlers — intentional: route handlers added in stories 4-3 and 4-4.
- No wildcard/404 fallback route — pre-existing gap; add when routing is fleshed out.
- `continueWatchingItems` signal not reactive to future `localStorage` writes — intentional stub; story 4-5 implements this.
- Poster card template triplicated across three sections in `home.component.html` — DRY refactor; extract to a `PosterCardComponent` in a future story.

## Deferred from: code review of 4-1-library-api-endpoints-for-movies-and-tv-shows (2026-05-03)

- Non-atomic two-query show fetch in `getShowById()` — pre-existing SQLite/better-sqlite3 pattern across codebase; low practical risk in single-writer Node.js process.
- `getImageBaseUrl()` issues a DB round-trip on every request — performance optimization; acceptable for current library sizes per NFR5.
- Double-episode files (one `media_files` → two `tv_episodes` rows) duplicate `file_id` in episode list — data model concern, requires pipeline schema decision.
- `getDuration()` returns `0` instead of `null` for files with unknown duration — pre-existing: ProbeService stores `0` as sentinel; fix belongs in ProbeService, not BrowseService.

## Deferred from: code review of 3-5-unattended-queue-processing-and-pipeline-status (2026-05-03)

- Pre-existing `media_files` rows with `tier=1, status='classified'` (classified before story 3-5) will not be reflected in any status counter — deferred: dev fresh-install only, no persistent data to migrate. A future migration story should handle all schema/data backfills.
- `PipelineJob.status` typed as `string` not a union — pre-existing convention across services.
- No auth guards on `/api/pipeline/status` or `/api/pipeline/jobs` — pre-existing: no other endpoints in codebase have auth.
- `error_details` returned raw to HTTP client from `getJobs` — pre-existing design, consistent with other error surfaces.
- `lastInsertRowid as number` cast in test helpers — pre-existing pattern in all spec files; should use `Number(...)` to be explicit.
- Orphaned `transcode_jobs` rows silently excluded from `getJobs` when referenced `media_files` row is deleted — pre-existing schema design; consider `LEFT JOIN` or cascade-delete.
- Unknown `status` values in `transcode_jobs` silently excluded from `getStatus` aggregation — pre-existing design.

## Deferred from: code review of 3-2-aac-audio-sidecar-generation-tier-2 (2026-05-03)

- `output_path` column not migrated on existing DBs — `CREATE TABLE IF NOT EXISTS` is a no-op when the table exists; `output_path TEXT` column is absent on DBs created before story 3-2. Fresh install or manual `DROP TABLE transcode_jobs` required. Accepted as known limitation (dev/fresh-install only). A future schema migration story should address all pending column additions across the codebase.
- No FFmpeg execution timeout — a hung `execFileAsync` call permanently locks `this.transcoding = true` for the lifetime of the process, blocking all future sidecar queue runs.
- `processAudioSidecar` is public — callers can invoke it directly, bypassing the `this.transcoding` mutex guard. Should be private.
- Crash-recovery UPDATE unguarded — if the `UPDATE … WHERE status = 'processing'` throws, the entire queue is skipped for that run. Low probability but unguarded; caught and logged by the caller's `.catch()`.
- No row-count validation on completion transaction — if `file_id` is cascade-deleted between SELECT and completion UPDATE, the transaction succeeds with zero rows changed, producing an orphaned sidecar file with a false success log.

## Deferred from: code review (2026-05-01) of 1-1-scaffold-monorepo-with-nestjs-backend-and-angular-frontend.md

- Incomplete backend health endpoint HTTP test coverage: Backend test coverage only verifies the health endpoint via direct controller method call, not over HTTP.
- No end-to-end test verification of monorepo service serving: No E2E/integration test verifying Nest actually serves the Angular app at `/`.
- Empty Angular route table: Routing is enabled in Angular, but the route table is empty without a fallback or home route.
- Placeholder uses "Cineplex Rigaud" instead of correct title: The user-facing placeholder says "Cineplex Rigaud" while document title says "Frontend".
- Frontend package contains app-local .vscode noise: The diff adds app-local .vscode files and `.vscode/mcp.json` into the frontend package.

## Deferred from: code review (2026-05-01) of 1-2-docker-deployment-with-media-volume-mounts

- No Container Resource Limits [docker-compose.yml] - deferred, pre-existing
- No Container Healthchecks [docker-compose.yml] - deferred, pre-existing
- Missing Log Rotation [docker-compose.yml] - deferred, pre-existing

## Deferred from: code review of 2-2-folder-scanning-and-file-detection (2026-05-01)

- No concurrency guard on scan initiation — parallel POST requests can race on same media_files rows causing SQLITE_BUSY or duplicates. Requires architectural decision on scan mutex/queue.
- scan_errors table has no index on file_path/created_at and no retention/cleanup mechanism — will grow unbounded on noisy filesystems.

## Deferred from: code review of 2-4a-filename-parser-service (2026-05-02)

- No multi-episode handling (S01E01E02, S01E01-03, S01E01-E02) — parser only captures first episode number; multi-episode files are common in TV scene releases.
- `stripQualityTags` list missing HDR/streaming service tags (AMZN, NF, DSNP, ATVP, HMAX, HDR, HDR10, DV, DoVi, 10bit, Atmos, TrueHD) — will need periodic maintenance as new tags appear.

## Deferred from: code review of 2-3-video-file-probing-with-ffmpeg (2026-05-02)

- No atomicity across `probeAndStore` operations — if crash occurs between status update to 'probed' and subtitle inserts completing, file is permanently marked probed with incomplete subtitle data. Would need wrapping in a transaction.
- `execFileAsync` default maxBuffer (1MB) may be exceeded for files with hundreds of streams/chapters producing large JSON output. Unlikely in practice but could cause valid files to be marked probe_failed.
- No observable "probing in progress" state — scan API reports "completed" immediately while probing still runs in background. Future UX story should add a probing status indicator.
- Case-insensitive filesystem matching — sidecar detection uses case-sensitive `startsWith` which may miss subtitles on Windows/exFAT mounts. Depends on deployment environment.

## Deferred from: code review of 3-4-subtitle-extraction-and-webvtt-conversion (2026-05-03)

- `mkdirSync` called synchronously per-subtitle inside async loop — pre-existing pattern from TranscodeService; directory only needs to be created once per queue run.
- Tests create real `:memory:` directory on host filesystem; parent dir not cleaned in `afterEach` — follows spec-prescribed transcode.service.spec.ts pattern.
- `cachePath` resolved from config per subtitle rather than once per queue run — consistent with other services; low severity.
- `this.classifying = false` fires while fire-and-forget subtitle/transcode queues still running — pre-existing in ClassificationService; a second `executeClassification()` call can start while previous queues are still in-flight.
- Permanently-failing subtitles retried on every queue run with no failure marking or bound — spec-chosen design (no status column on subtitles table); known limitation, same as other queue strategies in the pipeline.
- ffmpeg exit-0 with empty/header-only output commits `webvtt_path` permanently without validating output size/contents — out of scope per spec; row will not be retried after false-success commit.

## Deferred from: code review of 3-3-full-video-transcode-tier-3 (2026-05-03)

- `processVideoTranscode` is public, callers can bypass `videoTranscoding` mutex — same pattern as `processAudioSidecar`; explicitly deferred in story notes to future refactor story.
- Crash recovery races in multi-instance deployments — `videoTranscoding` is in-process boolean only; two instances against the same SQLite file can both reset and re-queue the same Tier 3 job. Pre-existing pattern shared with audio queue.
- No retry path for `failed` transcode jobs — jobs stuck in `failed` status are permanently dead-ended; no operator mechanism to re-attempt without direct DB intervention. Pre-existing pattern.
- `processVideoTranscode` 'processing' UPDATE runs before the inner try block — if the DB UPDATE itself throws, the job stays `queued` and retries, but repeated DB errors loop the job indefinitely with no attempt counter or cap. Pre-existing pattern from audio sidecar.
- Unbounded `.all()` query materializes full Tier 3 queue into memory — consistent with rest of pipeline; future scalability concern on large libraries.
- Video files with no audio stream produce a silent MP4 output (FFmpeg exits 0, job completes) with no warning — out of scope for this story.

## Deferred from: code review of 3-1-transcode-tier-classification (2026-05-03)

- W1: Existing deployments — `tier` column never added to live `media_files` table. `CREATE TABLE IF NOT EXISTS` is a no-op on existing DBs; no `ALTER TABLE` migration provided. Pre-existing schema migration strategy issue.
- W2: `transcode_jobs.error_details` column defined but never populated. Future transcode stories (3-2/3-3) own population of this field.
- W3: No retry/attempts tracking on `transcode_jobs` — `failed` status is a permanent dead end with no attempt count, `started_at`, or `completed_at`. Future story scope.
- W4: `executeClassification` loads all matched files with a single unbounded `.all()` query. Consistent with rest of pipeline but a future scalability concern on large libraries.

## Deferred from: code review of 2-6-folder-watcher-for-new-content-detection (2026-05-03)

- No mechanism to reload media sources without restart — if a user adds a new source to the DB, the watcher remains blind until app restart. Not in story scope; would require a hot-reload API or event hook.
- No auth on `GET /library/watcher/status` — exposes internal filesystem paths and error messages. Pre-existing pattern: no endpoints in this app have auth yet. Should be addressed when auth layer is added.

## Deferred from: code review of 2-5-manual-tmdb-match-and-needs-attention-queue (2026-05-03)

- No rate limiting on TMDB proxy endpoints (GET /api/tmdb/search, POST /api/library/files/:id/match) — unauthenticated callers can spam TMDB API and exhaust quota.
- String-based error discrimination (err.message === "FILE_NOT_FOUND") is fragile — refactor to typed error classes for compiler safety.
- Duplicate scan_errors rows (from repeated scans) can inflate unmatched pagination count via LEFT JOIN producing duplicate file rows.

## Deferred from: code review of 2-4b-tmdb-api-service (2026-05-02)

- 5xx responses not retried internally (asymmetry with network error retry) — matches spec Dev Notes pattern; caller can retry via TmdbUnavailableError. Consider internal retry for transient 502/503 in future.
- Race condition in getImageBaseUrl — concurrent calls could both INSERT rows. Mitigated by single-process SQLite and single-row LIMIT 1 query. Consider INSERT OR REPLACE for robustness.
- No AbortController timeout on fetch calls — if TMDB API hangs, fetchWithRetry blocks indefinitely. Consider adding a 30s signal timeout per request.
