# Story 5.1: Media File Serving via HTTP Range Requests

Status: ready-for-dev

## Story

As a viewer,
I want the server to deliver video and audio files via HTTP range requests,
so that playback starts instantly and seeking is instant without any server-side processing.

## Acceptance Criteria

1. Given a media file is playback-ready (Tier 1 original, Tier 2 original + sidecar, or Tier 3 transcoded), when the frontend requests the file via `GET /api/media/stream/:fileId`, then the server responds with proper HTTP range request support (`Accept-Ranges`, `Content-Range`, `206 Partial Content`).
2. For Tier 1 files, the original file is served directly from its source path.
3. For Tier 2 files, the original video file is served at `GET /api/media/stream/:fileId` and the AAC sidecar is served at `GET /api/media/stream/:fileId/audio`.
4. For Tier 3 files, the transcoded MP4 is served from `transcode_output_path`.
5. Subtitle WebVTT files are served via `GET /api/media/subtitles/:subtitleId` with `Content-Type: text/vtt`.
6. No server-side processing occurs at play time — static file serving only (NFR3).
7. Server CPU stays < 5% per concurrent viewer (NFR3).
8. Range header formats supported: `Range: bytes=START-END` and `Range: bytes=START-`.
9. Response includes `Content-Range: bytes START-END/TOTAL`, `Accept-Ranges: bytes`, correct `Content-Length`, and appropriate `Content-Type`.
10. Only files with status "ready" or transcode_jobs status "completed" are served; all others return 404.
11. Directory traversal attempts are blocked (path validation).

## Tasks / Subtasks

- [ ] Task 1: Create media module structure (AC: #1)
  - [ ] Create `apps/backend/src/media/media.module.ts`
  - [ ] Create `apps/backend/src/media/media.controller.ts`
  - [ ] Create `apps/backend/src/media/media.service.ts`
  - [ ] Register `MediaModule` in `app.module.ts`
- [ ] Task 2: Implement media service with file resolution (AC: #2, #3, #4, #10, #11)
  - [ ] `getFileInfo(fileId)` — query `media_files` + `transcode_jobs` to determine tier and resolve absolute path
  - [ ] `getSubtitleInfo(subtitleId)` — query `subtitles` table for `webvtt_path`
  - [ ] `getAudioSidecarPath(fileId)` — resolve Tier 2 AAC sidecar from `transcode_jobs.output_path`
  - [ ] Path validation: ensure resolved path does not escape expected directories
  - [ ] Status validation: only serve files where `media_files.status = 'ready'` OR `transcode_jobs.status = 'completed'`
- [ ] Task 3: Implement range request streaming in controller (AC: #1, #8, #9)
  - [ ] Parse `Range` header (support `bytes=START-END` and `bytes=START-`)
  - [ ] Use `fs.statSync` for file size, `fs.createReadStream` with `{ start, end }` options
  - [ ] Return `StreamableFile` with 206 status and proper headers via `@Res({ passthrough: true })`
  - [ ] When no Range header: return full file with 200 and `Accept-Ranges: bytes`
- [ ] Task 4: Implement video stream endpoint (AC: #1, #2, #3, #4)
  - [ ] `GET /api/media/stream/:fileId` — serves video based on tier
  - [ ] Set `Content-Type` to appropriate MIME (`video/mp4`, `video/x-matroska`, `video/webm`, etc.)
- [ ] Task 5: Implement audio sidecar endpoint (AC: #3)
  - [ ] `GET /api/media/stream/:fileId/audio` — serves AAC sidecar for Tier 2
  - [ ] Return 404 if file is not Tier 2
  - [ ] Set `Content-Type: audio/aac`
- [ ] Task 6: Implement subtitle endpoint (AC: #5)
  - [ ] `GET /api/media/subtitles/:subtitleId` — serves WebVTT file
  - [ ] Set `Content-Type: text/vtt`
  - [ ] Return 404 if subtitle not found or `webvtt_path` is null
- [ ] Task 7: Write unit tests for media service (AC: all)
  - [ ] Test file resolution for each tier
  - [ ] Test status validation (reject non-ready files)
  - [ ] Test path traversal prevention
  - [ ] Test audio sidecar resolution (Tier 2 only)
  - [ ] Test subtitle resolution
- [ ] Task 8: Write controller integration tests (AC: #1, #8, #9)
  - [ ] Test 206 response with proper range headers
  - [ ] Test 200 response when no Range header
  - [ ] Test 404 for non-existent file IDs
  - [ ] Test 404 for non-ready files
  - [ ] Test 416 Range Not Satisfiable for invalid ranges
  - [ ] Test audio endpoint returns 404 for non-Tier-2 files
  - [ ] Test subtitle endpoint with valid/invalid IDs

## Dev Notes

### Architecture & Design Decisions

**Module Placement:** Create a NEW `media` module (`apps/backend/src/media/`) separate from the existing `library` module. The library module handles scanning, matching, and browsing. Media serving is a distinct concern with different security and performance characteristics.

**Why not add to library module:** The library module already has 15+ providers. Media serving has fundamentally different responsibilities (file I/O, streaming) vs. metadata management. Separate module = cleaner testing, better separation of concerns.

**Streaming approach:** Use Node.js `fs.createReadStream({ start, end })` with NestJS `StreamableFile`. This provides:

- Efficient streaming without loading entire file into memory
- Native backpressure handling via Node streams
- Proper NestJS interceptor/guard compatibility via `StreamableFile` (not raw `res.pipe()`)

**Range request implementation:** Handle manually in the controller using `@Req()` to read the Range header and `@Res({ passthrough: true })` to set response status/headers while still returning `StreamableFile`.

**CRITICAL — No `@Res()` without passthrough:** Using `@Res()` without `{ passthrough: true }` disables NestJS interceptors and exception filters. Always use `@Res({ passthrough: true })`.

### Database Queries

**File resolution query pattern:**

```sql
SELECT mf.id, mf.path, mf.status, mf.tier, mf.filename,
       tj.output_path AS transcode_output_path, tj.status AS transcode_status
FROM media_files mf
LEFT JOIN transcode_jobs tj ON tj.file_id = mf.id
WHERE mf.id = ?
```

**Serving logic by tier:**

- **Tier 1:** Serve `media_files.path` directly (original file is compatible)
- **Tier 2:** Video = `media_files.path` (original), Audio = `transcode_jobs.output_path` (AAC sidecar)
- **Tier 3:** Serve `transcode_jobs.output_path` (transcoded MP4)

**File readiness check:**

- Tier 1: `media_files.status = 'ready'` (no transcode needed)
- Tier 2/3: `transcode_jobs.status = 'completed'` (transcode done)

**Subtitle query:**

```sql
SELECT id, media_file_id, webvtt_path, language, type
FROM subtitles
WHERE id = ? AND webvtt_path IS NOT NULL
```

### MIME Type Detection

Determine Content-Type from file extension:

- `.mp4` → `video/mp4`
- `.mkv` → `video/x-matroska`
- `.webm` → `video/webm`
- `.avi` → `video/x-msvideo`
- `.m4a` / `.aac` → `audio/aac`
- `.vtt` → `text/vtt`

Use a simple lookup map — do NOT add a dependency for this. Keep it minimal.

### Security Considerations

**Path Traversal Prevention:**

- After resolving the file path from the database, validate it starts with an expected base directory (media source paths or cache path)
- Use `path.resolve()` to normalize then check prefix
- NEVER concatenate user input into file paths — all paths come from database only

**File ID validation:**

- Use `ParseIntPipe` on all `:fileId` and `:subtitleId` parameters
- Return `NotFoundException` for missing/invalid IDs (do not leak path info)

**No authentication required** (architecture decision: LAN-only, no auth).

### Performance Requirements

- **Zero processing:** No transcoding, no re-encoding, no filtering at serve time
- **Stream, don't buffer:** Use `createReadStream` with start/end, never `readFileSync`
- **Efficient stat:** Call `fs.statSync` once per request for file size
- **Chunk size:** Let the browser decide via Range header; do not impose artificial chunk sizes

### Project Structure Notes

**New files to create:**

```
apps/backend/src/media/
├── media.module.ts
├── media.controller.ts
├── media.controller.spec.ts
├── media.service.ts
└── media.service.spec.ts
```

**Files to modify:**

- `apps/backend/src/app.module.ts` — add `MediaModule` import

**Naming convention:** Follows existing pattern (library/, config/, database/, health/).

**Controller prefix:** `@Controller('media')` → routes under `/api/media/...` (NestJS global prefix is `api` set in `main.ts` or implied by ServeStatic exclude pattern `/api/{*path}`).

**IMPORTANT — Check global prefix:** The existing `browse.controller.ts` uses `@Controller('library')` and is accessed at `/api/library/...`. Verify in `main.ts` if `app.setGlobalPrefix('api')` is set. If NOT, the media controller should use `@Controller('api/media')` to match the existing URL pattern.

### Testing Standards

- Use `@nestjs/testing` `Test.createTestingModule` for unit tests
- Mock `DatabaseService` in service tests (provide mock `getDatabase()`)
- Mock service in controller tests
- Use `better-sqlite3` in-memory database for integration tests if needed
- Test file: `*.spec.ts` co-located with source
- Follow existing pattern from `browse.service.spec.ts` and `browse.controller.spec.ts`

### Previous Story Intelligence (4-6: Library Search)

**Established patterns to follow:**

- Services inject `DatabaseService` → call `this.database.getDatabase()` → use prepared statements
- Controllers use `ParseIntPipe` for numeric params, throw `NotFoundException` for missing resources
- Logger via `new Logger(ClassName.name)`
- Tests mock DatabaseService with in-memory better-sqlite3 or jest mocks
- Code is clean, minimal — no over-engineering

**Git commit pattern:** Single commit per story implementation (e.g., "implement 4-6")

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 5, Story 5.1]
- [Source: _bmad-output/planning-artifacts/architecture.md — Data Architecture (Raw SQLite), API & Communication Design]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Video Playback UX]
- [Source: _bmad-output/planning-artifacts/prd.md — FR22, NFR1, NFR2, NFR3]
- [Source: apps/backend/src/library/browse.controller.ts — Controller patterns]
- [Source: apps/backend/src/library/browse.service.ts — Service/DB patterns]
- [Source: apps/backend/src/database/database.service.ts — Schema definitions]
- [Source: NestJS Docs — Streaming Files (StreamableFile)]

## Dev Agent Record

### Agent Model Used

(to be filled by dev agent)

### Completion Notes List

Story context engine analysis completed — comprehensive developer guide created with full range request implementation guidance, security considerations, and performance requirements.

### File List

**NEW:**

- `apps/backend/src/media/media.module.ts`
- `apps/backend/src/media/media.controller.ts`
- `apps/backend/src/media/media.controller.spec.ts`
- `apps/backend/src/media/media.service.ts`
- `apps/backend/src/media/media.service.spec.ts`

**MODIFIED:**

- `apps/backend/src/app.module.ts`
