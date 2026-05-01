# Story 2.3: Video File Probing with FFmpeg

Status: review

## Story

As an admin,
I want the system to probe each discovered file for codec and format information,
so that the transcode pipeline knows how to process each file.

## Acceptance Criteria

```gherkin
Given a file exists in the media_files table with status "discovered"
When the probe service processes the file
Then FFmpeg (ffprobe) extracts: video codec, audio codec(s), container format, duration, resolution, and embedded subtitle tracks
And probe results are stored in the media_files table (probe_data JSON column)
And the file status is updated to "probed"
And embedded subtitle tracks and sidecar subtitle files (.srt, .ass, .sub) are cataloged in a subtitles table (FR7)
And probe failures are logged with error details and the file status is set to "probe_failed" (NFR13)
```

## Tasks / Subtasks

- [x] 1. Database schema additions (AC: all)
  - [x] 1.1 Add `subtitles` table to `DatabaseService.runMigrations()`: id, media_file_id (FK), track_index, type (embedded|sidecar), language, codec, webvtt_path, created_at
  - [x] 1.2 Verify `probe_data` TEXT column already exists on `media_files` (it does — used for JSON storage)
- [x] 2. Create `ProbeService` in library module (AC: 1,2,3)
  - [x] 2.1 Implement `probeFile(filePath: string): Promise<ProbeResult>` — executes `ffprobe` via `child_process.execFile` with JSON output
  - [x] 2.2 Parse ffprobe JSON output to extract: video codec, audio codec(s), container format, duration, resolution, embedded subtitle tracks
  - [x] 2.3 Define `ProbeResult` interface with typed fields
- [x] 3. Implement probe orchestration in `LibraryService` or new `ProbeOrchestrationService` (AC: 1,2,3,5)
  - [x] 3.1 Query media_files with status "discovered" to find files needing probing (includes newly discovered AND modified files reset to "discovered" by scanner)
  - [x] 3.2 Call `ProbeService.probeFile()` for each file
  - [x] 3.3 On success: store probe_data JSON in media_files, update status to "probed"
  - [x] 3.4 On failure: update status to "probe_failed", log error to `scan_errors` table with details (NFR13)
  - [x] 3.5 Process files sequentially to avoid CPU saturation
- [x] 4. Sidecar subtitle detection (AC: 4)
  - [x] 4.1 After probing, scan the same directory for sidecar subtitle files (.srt, .ass, .sub) matching the video filename
  - [x] 4.2 Insert embedded subtitle tracks (from ffprobe output) into `subtitles` table with type "embedded"
  - [x] 4.3 Insert discovered sidecar subtitle files into `subtitles` table with type "sidecar"
- [x] 5. Integrate probing into scan pipeline (AC: all)
  - [x] 5.1 After `executeScan()` completes in `LibraryService`, trigger probing of newly discovered files
  - [x] 5.2 Ensure probing runs asynchronously and doesn't block API responses (NFR17)
- [x] 6. Add API endpoint for probe status visibility (AC: all)
  - [x] 6.1 Extend `GET /api/library/files` response to include probe_data and status
  - [x] 6.2 Add `GET /api/library/files/:id` for single file detail with subtitles list
- [x] 7. Unit tests (AC: all)
  - [x] 7.1 Test `ProbeService` with mocked `child_process.execFile` — success and failure paths
  - [x] 7.2 Test probe orchestration — status transitions, error handling
  - [x] 7.3 Test sidecar subtitle detection with mocked filesystem
  - [x] 7.4 Test subtitles table insertion for both embedded and sidecar types

## Dev Notes

### Technical Implementation: Running ffprobe Directly

**Do NOT use fluent-ffmpeg.** Run `ffprobe` directly via Node.js `child_process.execFile`:

```typescript
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

async function probeFile(filePath: string): Promise<ProbeResult> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "quiet",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    filePath,
  ]);
  const data = JSON.parse(stdout);
  // Parse streams by codec_type: 'video', 'audio', 'subtitle'
  return parseProbeOutput(data);
}
```

**Key ffprobe flags:**

- `-v quiet` — suppress stderr noise
- `-print_format json` — structured output for parsing
- `-show_format` — container format, duration, bitrate
- `-show_streams` — per-stream codec info (video, audio, subtitle)

**ProbeResult interface:**

```typescript
interface ProbeResult {
  format: {
    container: string; // e.g., "matroska,webm" or "mov,mp4,m4a,3gp,3g2,mj2"
    duration: number; // seconds (float)
    bitrate: number; // bits/second
  };
  video: {
    codec: string; // e.g., "h264", "hevc", "vp9"
    width: number;
    height: number;
    profile?: string;
  } | null;
  audioTracks: Array<{
    index: number;
    codec: string; // e.g., "aac", "ac3", "dts", "truehd"
    channels: number;
    language?: string;
  }>;
  subtitleTracks: Array<{
    index: number;
    codec: string; // e.g., "subrip", "ass", "hdmv_pgs_subtitle"
    language?: string;
  }>;
}
```

### Architecture Compliance

1. **Read-Only Access (NFR9):** `ffprobe` only reads files — no modification risk. But ensure no write flags are passed.
2. **Graceful Degradation (NFR13):** Each file probe is independent. A failure on one file must NOT stop probing of remaining files. Log error to `scan_errors` and set status to `probe_failed`.
3. **Non-blocking (NFR17):** Probing runs asynchronously after scan. Playback and API endpoints remain responsive.
4. **No new dependencies:** `child_process` is built-in Node.js. FFmpeg/ffprobe is already bundled in the Docker image (see Dockerfile: `apt-get install -y ffmpeg`).

### Library/Framework Requirements

- **NestJS patterns:** Create `ProbeService` as an `@Injectable()` provider in `LibraryModule`
- **child_process:** Use `promisify(execFile)` for async execution — NOT `exec` (avoids shell injection risk with untrusted filenames)
- **better-sqlite3:** All DB operations remain synchronous per established pattern
- **Error handling:** Wrap `execFileAsync` in try/catch. ffprobe returns non-zero exit code for corrupt/unreadable files

### Database Schema Addition

```sql
CREATE TABLE IF NOT EXISTS subtitles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  media_file_id INTEGER NOT NULL REFERENCES media_files(id) ON DELETE CASCADE,
  track_index INTEGER,
  type TEXT NOT NULL CHECK (type IN ('embedded', 'sidecar')),
  language TEXT,
  codec TEXT,
  sidecar_path TEXT,
  webvtt_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_subtitles_media_file_id ON subtitles(media_file_id);
```

### Sidecar Subtitle Detection Logic

After probing a video file, look for subtitle files in the same directory that share the base filename:

- `Movie.Name.2024.mkv` → look for `Movie.Name.2024.srt`, `Movie.Name.2024.en.srt`, `Movie.Name.2024.ass`, etc.
- Pattern: `${baseNameWithoutExt}*.{srt,ass,sub}`
- Use `fs.promises.readdir` on the parent directory and filter by matching base name and subtitle extensions
- Extract language from filename suffix if present (e.g., `.en.srt` → language "en")

### File Structure Requirements

```
apps/backend/src/library/
├── probe.service.ts          # NEW: ffprobe execution and parsing
├── probe.service.spec.ts     # NEW: unit tests for probe service
├── library.module.ts         # UPDATE: add ProbeService to providers
├── library.service.ts        # UPDATE: add probe orchestration after scan
├── library.controller.ts     # UPDATE: minor - file detail might expose probe_data
├── scanner.service.ts        # NO CHANGE
└── scanner.service.spec.ts   # NO CHANGE
apps/backend/src/database/
└── database.service.ts       # UPDATE: add subtitles table migration
```

### Testing Requirements

- Mock `child_process.execFile` via jest — return sample ffprobe JSON output for success cases
- Test with sample ffprobe output for common containers: MKV with H.264+AC3+subtitles, MP4 with AAC, AVI with DivX
- Test probe failure: simulate non-zero exit code, verify status → "probe_failed" and error logged
- Test sidecar detection: mock filesystem with `.srt` and `.ass` files alongside video
- Use `:memory:` database for all DB tests (established pattern from stories 2.1/2.2)

### Previous Story Intelligence (Learnings from 2.2)

- better-sqlite3 uses **synchronous API** — all DB calls are blocking, NOT async/await
- Use `INSERT OR IGNORE` to handle potential UNIQUE constraint issues gracefully
- Schema additions go in `DatabaseService.runMigrations()` using `CREATE TABLE IF NOT EXISTS`
- `ScannerService` already handles file discovery — probe service only processes files already in `media_files` table
- Use `db.transaction()` for batch operations on better-sqlite3
- Error logging goes to `scan_errors` table (already exists) — reuse same pattern
- `LibraryService.executeScan()` is the existing async pipeline — probe step hooks in after scan completes
- The `LibraryModule` already triggers a startup scan via `OnModuleInit` — probing will naturally follow

### Project Structure Notes

- ProbeService follows the same Injectable pattern as ScannerService
- Stays within the `library` module — no new module needed
- Exports ProbeService from LibraryModule for future use by Epic 3 (transcode classification)
- The `probe_data` column already exists on `media_files` — just needs to be populated

### References

- [Source: _bmad-output/planning-artifacts/epics.md - Story 2.3 acceptance criteria]
- [Source: _bmad-output/planning-artifacts/architecture.md - Data Architecture: Raw SQLite, no ORM]
- [Source: Dockerfile - FFmpeg bundled via `apt-get install -y ffmpeg`]
- [Source: apps/backend/src/database/database.service.ts - migration pattern, probe_data column]
- [Source: apps/backend/src/library/scanner.service.ts - ScannerService pattern reference]
- [Source: _bmad-output/implementation-artifacts/2-2-folder-scanning-and-file-detection.md - learnings]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

None — clean implementation with no blockers.

### Completion Notes List

- Task 1: Added `subtitles` table with FK to `media_files`, CHECK constraint on type, and index. Verified `probe_data` column already exists.
- Task 2: Created `ProbeService` using `child_process.execFile` (no shell injection risk). Parses ffprobe JSON output into typed `ProbeResult` interface with video, audio tracks, subtitle tracks, and format metadata.
- Task 3: Added `executeProbing()` to `LibraryService` — queries discovered files, probes sequentially, stores JSON probe_data on success, sets `probe_failed` and logs to `scan_errors` on failure.
- Task 4: Implemented sidecar subtitle detection — scans directory for .srt/.ass/.sub files matching video basename, extracts language from filename suffix (e.g. `.en.srt`), inserts both embedded and sidecar subtitles into `subtitles` table.
- Task 5: Probing triggers asynchronously after `executeScan()` completes — doesn't block API responses.
- Task 6: `GET /api/library/files` already returns probe_data and status. Added `GET /api/library/files/:id` endpoint returning file detail with subtitles list.
- Task 7: 20 unit tests covering ProbeService (7), probe orchestration (3), sidecar detection (3), getFile (2), and existing tests updated (5). All 37 tests pass.

### File List

- `apps/backend/src/database/database.service.ts` (UPDATE) — added subtitles table migration
- `apps/backend/src/library/probe.service.ts` (NEW) — ffprobe execution and ProbeResult parsing
- `apps/backend/src/library/probe.service.spec.ts` (NEW) — 7 unit tests for ProbeService
- `apps/backend/src/library/library.module.ts` (UPDATE) — added ProbeService to providers/exports
- `apps/backend/src/library/library.service.ts` (UPDATE) — probe orchestration, sidecar detection, getFile method
- `apps/backend/src/library/library.service.spec.ts` (UPDATE) — added ProbeService mock + 8 new tests
- `apps/backend/src/library/library.controller.ts` (UPDATE) — added GET /api/library/files/:id endpoint

## Change Log

- 2026-05-01: Story implemented — all 7 tasks completed. ProbeService created, probe orchestration integrated into scan pipeline, sidecar subtitle detection, API endpoints added, 37 tests passing.
