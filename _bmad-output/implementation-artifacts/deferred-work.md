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
