## Deferred from: spec-fix-scroll-position-restoration (2026-05-06)

- No cache invalidation strategy for `LibraryService` list endpoints — if content is added/removed, cached responses remain stale until page refresh. Consider adding an `invalidateCache()` method triggered after admin mutations (e.g., library rescan, manual match).
- Multi-tab stale data — tabs sharing the same service singleton cache independently; no cross-tab invalidation mechanism.

## Deferred from: spec-fix-tier1-streaming-completed-status (2026-05-06)

- Subtitle service blanket-updates ALL tier 1 `ready` files to `completed` status (`WHERE tier = 1 AND status = 'ready'`), including files with no subtitles. The update should be scoped to files that actually had subtitle work queued, or the status transition should be reconsidered.
- `media_files.status` lifecycle is undocumented — values (`discovered`, `probed`, `probe_failed`, `matched`, `match_failed`, `classified`, `ready`, `completed`) and transitions are scattered across multiple services with no central enum or state machine documentation.

## Deferred from: spec-fix-unmatched-media-streaming (2026-05-06)

- No unit test added for `match_failed` status in `getFileInfo()` — existing test file covers ready/error paths but the new `match_failed` streaming path is untested.

## Deferred from: spec-fix-manual-match-not-in-library-2 (2026-05-06)

- Fire-and-forget `executeClassification()` after manual match has no caller-visible failure reporting — if the async classification + transcode pipeline fails, the HTTP response was already sent as success. Pre-existing pattern.

## Deferred from: spec-fix-manual-match-not-in-library (2026-05-05)

- `executeClassification()` has no queue/retry mechanism — if classification is already in progress when triggered (concurrent manual matches or manual + auto-match overlap), the second invocation skips silently. Files remain in `'matched'` status until the next classification trigger. Pre-existing limitation affecting both auto-match and manual-match paths.
- Full DB scan on every classification trigger — `executeClassification()` queries ALL files with `status = 'matched'`, not just the newly matched file. Inefficient for single-file manual matches but functionally correct. Pre-existing pattern.

## Deferred from: spec-fix-watcher-sync-marks-existing-files-missing (2026-05-05)

- Watcher doesn't recover `missing` files: If a file was marked `missing` by a full scan (temporarily unavailable) and reappears with same size/mtime, neither path resets it to `discovered`. Only a size/mtime change triggers re-discovery.

## Deferred from: code review of 7-3-import-and-transcode-monitoring-with-error-details (2026-05-05)

- No pagination/limit on `getFailedJobs()` backend query — both transcode_jobs and scan_errors are queried with no LIMIT clause; unbounded result set risk if historical failures accumulate.
- No CSRF/auth beyond LanGuard for destructive operations — `POST /admin/jobs/:id/retry` mutates DB state with only IP-based LAN guard; any LAN device can trigger retries.
- Subtitle failures have no query path in `getFailedJobs()` — the `"subtitle"` stage exists in the type union but no DB table currently stores subtitle extraction failures; once subtitle extraction (story 3-4) stores errors, this query will need updating.

## Deferred from: code review of 7-2-admin-dashboard-with-library-statistics (2026-05-05)

- Duplicated `AdminStats` interface across frontend/backend with no shared contract — the interface is copy-pasted in two places; any schema drift silently breaks the API contract with no compile-time safety. Pre-existing monorepo pattern (no shared types package yet).
- No caching or rate-limiting on `GET /api/admin/stats` — every request fires 5 DB queries. LAN-guarded and admin-only, so practical risk is minimal, but a TTL cache would be appropriate if usage grows.

## Deferred from: code review of 7-1-lan-detection-and-admin-route-guard (2026-05-05)

- X-Forwarded-For spoofable when TRUST_PROXY=true — When enabled, any client can spoof XFF header to gain admin access. Operational risk mitigated by TRUST_PROXY being off by default; users who enable it must ensure only trusted proxies reach the app.
- No IPv6 subnet matching support — LanDetectionService only handles IPv4 subnets. Pure IPv6 clients (not IPv4-mapped) will never match and are denied admin access. Fails closed; no security impact but IPv6-only LAN clients cannot get admin.

## Deferred from: code review of 6-2-resume-playback-from-last-position (2026-05-05)

- Tests call private method via `as any` — `component.applyResumePosition()` bypasses TypeScript access control in tests; works correctly but is a design smell consistent with prior test patterns in the file.
- Double invocation of `applyResumePosition()` in tests — `setup()` triggers `ngAfterViewInit()` (no-op, mock not yet set), then tests call the method manually; tests are correct but fragile.
- NaN values in `entry.position`/`entry.duration` pass the `<= 0` guard — `NaN <= 0` is `false`, so corrupted localStorage entries reach `video.currentTime = NaN` (browser silently ignores); pre-existing pattern gap consistent with `saveProgress()`.
- No test for TV happy-path resume — TV storage key construction and missing `seasonNum`/`episodeNum` guard (AC #7) are exercised only by production code, not by the new test suite; not required by spec Task 3 but a real coverage gap.

## Deferred from: code review of 6-1-persist-watch-progress-in-localstorage (2026-05-04)

- Double `saveProgress()` call on navigate away — `ngOnDestroy` calls `saveProgress()` and the video `pause` event also fires during navigation teardown; redundant writes with identical data, functionally harmless.
- `readAll()` called twice per home load — `buildProgressData()` and `readContinueWatchingFromStorage()` each call `watchProgressService.readAll()` independently; two localStorage reads per home page load; pre-existing design choice.

## Deferred from: code review of 5-5-audio-track-selection-during-playback (2026-05-04)

- Float/partial strings pass trackIndex validation (`parseInt("1.5")` silently returns 1) — benign because the frontend always sends integers; pre-existing parseInt pattern.
- /audio-tracks endpoint exposes codec and channel metadata without auth — pre-existing unauthed endpoint design consistent with all other media endpoints; LAN-only deployment.
- syncStarted not explicitly reset on audio src change — syncLoop keeps running; `video.play` listener re-establishes sync on next user play action; practical impact negligible.
- ArrowUp from no-focus position skips last menu item in audio track dropdown — same bug exists in subtitle menu's `onMenuKeydown`; pre-existing mirrored pattern.
- No upper bound on trackIndex query param — `validatePath()` prevents traversal; LAN-only; pre-existing service pattern.
- Out-of-bounds trackIndex returns 404 not 400 — spec-intended behavior (non-existent sidecar naturally 404s); syncDisabled fallback handles gracefully.

## Deferred from: code review of 5-3-dual-element-audio-sync-for-sidecar-playback (2026-05-04)

- iOS Safari blocks `audio.play()` without user gesture — programmatic `audio.play()` from `canplay` callback is rejected on iOS Safari. Needs platform-specific handling (e.g., resume audio on first user tap). Low priority for LAN-only deployment.
- Playback rate changes cause permanent drift — No `ratechange` listener syncs `audio.playbackRate` to `video.playbackRate`. If user changes rate via native controls or browser extensions, the sync loop hammers `audio.currentTime` every frame. Low risk for current use case.

## Deferred from: code review of 5-1-media-file-serving-via-http-range-requests (2026-05-04)

- Multiple transcode_jobs per file — LEFT JOIN returns arbitrary row without ORDER BY when multiple jobs exist for the same file_id. Pre-existing schema design choice.
- No Cache-Control / ETag / Last-Modified headers on streaming endpoints — performance improvement not required by current acceptance criteria.

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

## Deferred from: code review of 4-5-watch-progress-indicators-on-poster-grid (2026-05-04)

- Playback route is still undefined for new Continue Watching links. `home.component.html` now routes these cards to `/play/:fileId`, but `app.routes.ts` still exposes only `''`, `movie/:id`, and `show/:id`. This blocks end-to-end playback from the new entry point, but the missing route is pre-existing because movie and show detail pages already emit `/play/...` links.

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
