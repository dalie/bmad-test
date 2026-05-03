# Story 3.2: AAC Audio Sidecar Generation (Tier 2)

Status: done

## Story

As an admin,
I want the system to extract and transcode incompatible audio to AAC sidecar files,
so that video files with AC3/DTS/TrueHD audio can play in browsers without modifying the source.

## Acceptance Criteria

```gherkin
Given a file is classified as Tier 2 with a transcode job in status "queued"
When the transcode worker processes the job
Then FFmpeg extracts the primary audio track and transcodes it to AAC format
And the AAC sidecar file is saved to the managed cache directory (configured in .env)
And the sidecar file path is stored in the database (transcode_jobs.output_path) linked to the media file
And the source file is never modified — read-only filesystem access only (NFR9)
And the transcode job status updates to "completed" on success
And media_files.status updates to "ready" on success
And on failure, the job status updates to "failed" with error details stored (NFR15)
And media_files.status remains "classified" on failure (not clobbered)
And jobs stuck in "processing" state are reset to "queued" on service startup (crash recovery, NFR15)
And the transcode worker uses a mutex guard to prevent concurrent execution
```

## Tasks / Subtasks

- [x] 1. DB Schema: add `output_path` column to `transcode_jobs` in `database.service.ts` (AC: sidecar path stored)
  - [x] 1.1 In the `CREATE TABLE IF NOT EXISTS transcode_jobs` DDL, add `output_path TEXT` column after `error_details TEXT`
  - [x] 1.2 No migration needed — `CREATE TABLE IF NOT EXISTS` re-runs automatically; `output_path` defaults to NULL for existing rows (safe addition)

- [x] 2. Create `TranscodeService` (AC: all)
  - [x] 2.1 Create `apps/backend/src/library/transcode.service.ts` as `@Injectable()` with `DatabaseService` and `ConfigService` (from `@nestjs/config`) injected
  - [x] 2.2 Import `{ execFile } from 'child_process'` and `{ promisify } from 'util'`; define `const execFileAsync = promisify(execFile);` at module level (same pattern as `probe.service.ts`)
  - [x] 2.3 Implement `executeAudioSidecarQueue(): Promise<void>`:
    - Guard with `this.transcoding` boolean flag (mutex pattern, identical to `this.classifying` in `ClassificationService`)
    - On entry: reset any stuck `'processing'` rows back to `'queued'` via: `UPDATE transcode_jobs SET status = 'queued', updated_at = datetime('now') WHERE status = 'processing'` (crash recovery)
    - Query all Tier 2 queued jobs: `SELECT tj.id, tj.file_id, mf.path as file_path FROM transcode_jobs tj JOIN media_files mf ON mf.id = tj.file_id WHERE tj.tier = 2 AND tj.status = 'queued' ORDER BY tj.created_at ASC`
    - Iterate jobs, calling `await this.processAudioSidecar(job)` for each, wrapped in try-catch (log error, continue — error isolation per NFR13)
    - Log: `Processing ${jobs.length} queued Tier 2 audio sidecar jobs`
  - [x] 2.4 Implement `async processAudioSidecar(job: { id: number; file_id: number; file_path: string }): Promise<void>`:
    - Read `cachePath` from `this.config.get<string>('CACHE_PATH') || '/mnt/cache'`
    - Compute output directory: `path.join(cachePath, 'sidecars')` — create it with `fs.mkdirSync(outputDir, { recursive: true })`
    - Compute output filename: `${job.file_id}.m4a` (file_id is stable and unique)
    - Compute `outputPath = path.join(outputDir, outputFilename)`
    - Mark job processing: `UPDATE transcode_jobs SET status = 'processing', updated_at = datetime('now') WHERE id = ?` with `job.id`
    - Call `await this.runFfmpegAudioExtract(job.file_path, outputPath)` — if it throws, catch, write failure path (see below)
    - **On success** (inside `db.transaction()`):
      - `UPDATE transcode_jobs SET status = 'completed', output_path = ?, updated_at = datetime('now') WHERE id = ?`
      - `UPDATE media_files SET status = 'ready', updated_at = datetime('now') WHERE id = ?` with `job.file_id`
    - **On failure**:
      - `UPDATE transcode_jobs SET status = 'failed', error_details = ?, updated_at = datetime('now') WHERE id = ?` (do NOT update media_files — status stays "classified")
      - Log: `Audio sidecar failed for file_id ${job.file_id}: ${errorMessage}`
      - Rethrow so the outer loop can catch and continue to next job
  - [x] 2.5 Implement private `async runFfmpegAudioExtract(inputPath: string, outputPath: string): Promise<void>`:
    - Call: `await execFileAsync('ffmpeg', ['-v', 'error', '-i', inputPath, '-vn', '-map', '0:a:0', '-c:a', 'aac', '-b:a', '192k', '-ac', '2', '-y', outputPath])`
    - No stdout/stderr processing needed — FFmpeg exit code non-zero triggers rejection automatically
    - See Dev Notes for FFmpeg flag rationale

- [x] 3. Register `TranscodeService` in `LibraryModule` and wire into pipeline (AC: all)
  - [x] 3.1 Import and add `TranscodeService` to `providers` and `exports` arrays in `library.module.ts`
  - [x] 3.2 Inject `TranscodeService` into `ClassificationService` constructor as the LAST parameter: `private readonly transcodeService: TranscodeService`
  - [x] 3.3 At the end of `executeClassification()` (after the `for` loop, inside the `try` block before `finally`), add non-blocking fire: `this.transcodeService.executeAudioSidecarQueue().catch((err) => this.logger.error(...))`
  - [x] 3.4 Use the same error string pattern: `err instanceof Error ? err.message : String(err)`

- [x] 4. Unit tests for `TranscodeService` (AC: all)
  - [x] 4.1 Create `apps/backend/src/library/transcode.service.spec.ts`
  - [x] 4.2 Test setup: mock `ConfigService` (`CACHE_PATH: ':memory:'` for in-memory DB), mock `execFileAsync` via `jest.mock('child_process')`
  - [x] 4.3 Test successful audio sidecar: mock `execFileAsync` resolves → `transcode_jobs.status = 'completed'`, `output_path` set, `media_files.status = 'ready'`
  - [x] 4.4 Test FFmpeg failure: mock `execFileAsync` rejects with Error → `transcode_jobs.status = 'failed'`, `error_details` populated, `media_files.status` stays `'classified'`
  - [x] 4.5 Test crash recovery: insert a job with `status = 'processing'`, call `executeAudioSidecarQueue()` → verify it resets to `'queued'` before processing
  - [x] 4.6 Test mutex guard: call `executeAudioSidecarQueue()` twice concurrently → second call is a no-op (logs skip message)
  - [x] 4.7 Test error isolation: two jobs, first `execFileAsync` rejects, second resolves → second job still completes successfully
  - [x] 4.8 Test no Tier-2 jobs: `executeAudioSidecarQueue()` with no queued Tier 2 jobs → no FFmpeg calls, no errors
  - [x] 4.9 Test output path construction: verify sidecar output path is `${cachePath}/sidecars/${fileId}.m4a`
  - [x] 4.10 Run full backend test suite to verify no regressions (target: all 136+ existing tests pass)

## Dev Notes

### Pipeline Flow After This Story

```
discovered → [ProbeService] → probed → [MatchingService] → matched → [ClassificationService] → classified
  → [TranscodeService] → (Tier 2: audio sidecar) → ready
                       → (Tier 3: queued, handled in 3-3)
```

`ClassificationService.executeClassification()` fires `transcodeService.executeAudioSidecarQueue()` non-blocking at the end of the `try` block (same fire-and-forget pattern that `LibraryService.executeMatching()` uses for classification).

### FFmpeg Command for Audio Sidecar

```bash
ffmpeg -v warning -i <input> -vn -map 0:a:0 -c:a aac -b:a 192k -ac 2 -movflags +faststart -y <output.m4a>
```

**Flag rationale:**
- `-v warning` — show warnings so stream/encoding issues surface in logs (implementation uses `warning` rather than `error`; acceptable trade-off for diagnostics)
- `-vn` — no video in output (audio-only sidecar)
- `-map 0:a:0` — select only the FIRST audio stream (index 0 = primary track); prevents multi-track inputs from producing multiple audio streams in the sidecar
- `-c:a aac` — FFmpeg built-in AAC encoder. Do NOT use `libfdk_aac` — it is NOT available in standard `ffmpeg` builds; using it would silently fail with a codec not found error
- `-b:a 192k` — 192 kbps CBR bitrate; well above audible quality ceiling for AAC stereo
- `-ac 2` — downmix to stereo. Critical for browser compatibility: AC-3/DTS 5.1 source audio transcoded to multi-channel AAC may not decode correctly in all browsers. Stereo is universally supported by the Web Audio API
- `-movflags +faststart` — writes the moov atom at the start of the file; required for reliable progressive playback in browsers before the full file is downloaded
- `-y` — overwrite existing output (makes the operation idempotent; safe for retries on failed jobs)
- Output: `.m4a` (AAC in MPEG-4 Audio container) — better browser `<audio>` element support than raw ADTS `.aac`; supports HTTP range requests

**Important — FFmpeg binary availability:** The `Dockerfile` must have `ffmpeg` installed (already confirmed via story 2-3 which uses `ffprobe`; same binary package provides both).

### Output File Storage

- Sidecar files go to: `{CACHE_PATH}/sidecars/{file_id}.m4a`
- `CACHE_PATH` env var (default `/mnt/cache`) — same as database path root; read from NestJS `ConfigService`
- Directory is created with `fs.mkdirSync(outputDir, { recursive: true })` before FFmpeg runs
- `file_id` (integer PK from `media_files`) is used as filename — stable, unique, no filesystem escaping needed
- Path is stored in `transcode_jobs.output_path` (TEXT column added in Task 1)
- NFR9 (read-only source): `TranscodeService` reads `file_path` from DB — NEVER writes to the source media directory

### DB Schema Change

Add `output_path TEXT` to the `transcode_jobs` CREATE TABLE DDL in `database.service.ts`:

```sql
CREATE TABLE IF NOT EXISTS transcode_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id INTEGER NOT NULL REFERENCES media_files(id) ON DELETE CASCADE,
  tier INTEGER NOT NULL CHECK (tier IN (1,2,3)),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','completed','failed')),
  error_details TEXT,
  output_path TEXT,    -- NEW: path to generated sidecar/transcode file
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(file_id)
);
```

This resolves deferred item W2 from story 3-1: "`error_details` column defined but never populated — future transcode stories 3-2/3-3 own population of this field."

### media_files Status After Transcode

- **Success (Tier 2):** `media_files.status → 'ready'` — this is the terminal state that makes a file visible to viewer-facing library endpoints (story 4.1 AC: "only titles with status 'ready' appear")
- **Failure (Tier 2):** `media_files.status` stays `'classified'` — job is retryable (NFR15); a future retry mechanism (story 3-5) can reset `transcode_jobs.status` back to `'queued'`
- **Tier 1 files → 'ready':** Tier 1 files (no transcode needed) are NOT handled by this story — that is explicitly owned by story 3-5 ("Tier 1 files are marked 'ready' immediately"). Do NOT add Tier 1 handling here.

### TranscodeService Structure

```typescript
// apps/backend/src/library/transcode.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { DatabaseService } from '../database/database.service';

const execFileAsync = promisify(execFile);

@Injectable()
export class TranscodeService {
  private readonly logger = new Logger(TranscodeService.name);
  private transcoding = false;

  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  async executeAudioSidecarQueue(): Promise<void> {
    if (this.transcoding) {
      this.logger.log('Transcode already in progress, skipping');
      return;
    }
    this.transcoding = true;
    try {
      const db = this.database.getDatabase();

      // Crash recovery: reset stuck 'processing' jobs back to 'queued'
      db.prepare(
        "UPDATE transcode_jobs SET status = 'queued', updated_at = datetime('now') WHERE status = 'processing'"
      ).run();

      const jobs = db
        .prepare(
          `SELECT tj.id, tj.file_id, mf.path as file_path
           FROM transcode_jobs tj
           JOIN media_files mf ON mf.id = tj.file_id
           WHERE tj.tier = 2 AND tj.status = 'queued'
           ORDER BY tj.created_at ASC`
        )
        .all() as { id: number; file_id: number; file_path: string }[];

      this.logger.log(`Processing ${jobs.length} queued Tier 2 audio sidecar jobs`);

      for (const job of jobs) {
        try {
          await this.processAudioSidecar(job);
        } catch (err: any) {
          this.logger.error(
            `Audio sidecar queue error for job ${job.id}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    } finally {
      this.transcoding = false;
    }
  }

  async processAudioSidecar(job: { id: number; file_id: number; file_path: string }): Promise<void> {
    const cachePath = this.config.get<string>('CACHE_PATH') || '/mnt/cache';
    const outputDir = path.join(cachePath, 'sidecars');
    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `${job.file_id}.m4a`);

    const db = this.database.getDatabase();
    db.prepare(
      "UPDATE transcode_jobs SET status = 'processing', updated_at = datetime('now') WHERE id = ?"
    ).run(job.id);

    try {
      await this.runFfmpegAudioExtract(job.file_path, outputPath);

      const completeTx = db.transaction(() => {
        db.prepare(
          "UPDATE transcode_jobs SET status = 'completed', output_path = ?, updated_at = datetime('now') WHERE id = ?"
        ).run(outputPath, job.id);
        db.prepare(
          "UPDATE media_files SET status = 'ready', updated_at = datetime('now') WHERE id = ?"
        ).run(job.file_id);
      });
      completeTx();

      this.logger.log(`Audio sidecar generated for file_id ${job.file_id}: ${outputPath}`);
    } catch (err: any) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      db.prepare(
        "UPDATE transcode_jobs SET status = 'failed', error_details = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(errorMessage, job.id);
      this.logger.error(`Audio sidecar failed for file_id ${job.file_id}: ${errorMessage}`);
      throw err; // rethrow so the outer loop catches and continues to next job
    }
  }

  private async runFfmpegAudioExtract(inputPath: string, outputPath: string): Promise<void> {
    await execFileAsync('ffmpeg', [
      '-v', 'error',    // suppress progress, show only errors
      '-i', inputPath,
      '-vn',            // no video in output
      '-map', '0:a:0',  // primary audio stream only
      '-c:a', 'aac',    // built-in FFmpeg AAC encoder (NOT libfdk_aac)
      '-b:a', '192k',   // 192 kbps bitrate
      '-ac', '2',       // downmix to stereo for universal browser support
      '-y',             // overwrite existing output (idempotent)
      outputPath,
    ]);
  }
}
```

### Wiring ClassificationService → TranscodeService

**IMPORTANT — circular dependency risk:** `ClassificationService` will inject `TranscodeService`. `TranscodeService` must NOT inject `ClassificationService`. This is a one-way dependency — no cycle exists.

```typescript
// classification.service.ts — updated constructor
constructor(
  private readonly database: DatabaseService,
  private readonly transcodeService: TranscodeService,  // ADD AS LAST PARAM
) {}

// At end of executeClassification() try block, after the for loop:
this.transcodeService.executeAudioSidecarQueue().catch((err) =>
  this.logger.error(`Transcode queue failed: ${err instanceof Error ? err.message : String(err)}`)
);
```

### Architecture Compliance

- **NFR9 (Read-only source):** `TranscodeService` reads `file_path` from DB, only writes to `{CACHE_PATH}/sidecars/`. Never touches source media directories
- **NFR13 (Error isolation):** try-catch per job in `executeAudioSidecarQueue()` — one FFmpeg failure never blocks subsequent jobs
- **NFR15 (Retryable failures):** `failed` status + `error_details` enables future retry; crash recovery resets `processing` → `queued` on restart
- **Import/serve separation:** `TranscodeService` operates entirely on the DB and cache directory; zero interaction with the static file serving path

### Library/Framework Requirements

- **No new npm dependencies** — uses Node.js built-ins (`child_process`, `fs`, `path`, `util`) and NestJS/better-sqlite3 already installed
- **`execFileAsync`** — same promisified `execFile` pattern as `probe.service.ts`. Do NOT use `exec` (shell injection risk) or `spawn` (more complex, not needed for one-shot FFmpeg jobs)
- **`better-sqlite3` synchronous API** — all DB operations in `processAudioSidecar` are synchronous (no async/await on DB calls)
- **`db.transaction()`** — wraps the completion UPDATE pair atomically (output_path + media_files.status)

### File Structure

```
apps/backend/src/library/
├── transcode.service.ts          # NEW: Tier 2 audio sidecar generation
├── transcode.service.spec.ts     # NEW: Unit tests
├── classification.service.ts     # UPDATE: inject TranscodeService, fire queue at end
├── classification.service.spec.ts # UPDATE: add TranscodeService mock to test setup
├── library.module.ts             # UPDATE: add TranscodeService to providers + exports

apps/backend/src/database/
├── database.service.ts           # UPDATE: add output_path column to transcode_jobs DDL
```

### Testing Requirements

- Follow the exact same test patterns used in `classification.service.spec.ts` (real in-memory SQLite, ConfigService mock with `:memory:`)
- Mock `execFileAsync` by mocking the `child_process.execFile` module, or by spying on the module-level constant — recommended approach: `jest.mock('child_process')` and `(execFile as jest.Mock).mockImplementation(...)` inside `beforeEach`
- Actually: because `execFileAsync = promisify(execFile)` is at module level, the cleanest mock is: spy on the module: `jest.spyOn(require('child_process'), 'execFile').mockImplementation((cmd, args, opts, callback) => ...)` OR use `jest.mock` with a factory. See below pattern.
- Use `os.tmpdir()` as the cache path for integration tests so files can optionally be created/checked without cleanup issues
- **Testing execFileAsync:** Since `execFileAsync` is constructed from `promisify(execFile)` at module import time, mock via `jest.mock('child_process', () => ({ execFile: jest.fn() }))` at the top of the test file, then in tests: `(execFile as jest.Mock).mockImplementation((_, __, ___, cb) => cb(null, '', ''))` for success, `cb(new Error('FFmpeg error'))` for failure

### Previous Story Intelligence (from 3-1)

- **Mutex pattern:** Copy `this.classifying` guard from `ClassificationService.executeClassification()` exactly — identical structure with `this.transcoding` flag
- **Transaction pattern:** `db.transaction(() => { ... })()` for the completion update pair (status + output_path atomically)
- **Error logging pattern:** `err instanceof Error ? err.message : String(err)` — applied throughout (not just `err.message`)
- **Module registration:** Add `TranscodeService` to both `providers` AND `exports` in `LibraryModule`
- **Injection order:** Add as LAST constructor parameter to avoid disrupting NestJS injection order
- **Integration test pattern:** Real in-memory SQLite via `ConfigService` mock returning `:memory:` — DO NOT mock DB operations
- **Total test count baseline:** 136 tests pass after story 3-1 — all must still pass

### Deferred Items Addressed by This Story

From `deferred-work.md` (story 3-1 review):
- **W2:** "`error_details` column defined but never populated — future transcode stories 3-2/3-3 own population of this field." → This story populates `error_details` on Tier 2 transcode failures ✓

### Deferred Items NOT in Scope for This Story

The following remain deferred:
- W3: No retry/attempts tracking — `failed` is still a dead end until story 3-5 adds retry mechanism
- Tier 1 "ready" marking — explicitly owned by story 3-5 ("Tier 1 files are marked 'ready' immediately")
- Subtitle conversion — story 3-4

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 3.2 acceptance criteria]
- [Source: _bmad-output/planning-artifacts/epics.md — Story 3.5 pipeline flow, "Tier 1 files are marked 'ready' immediately"]
- [Source: _bmad-output/planning-artifacts/epics.md — Story 4.1 "only titles with status 'ready' appear in viewer-facing endpoints"]
- [Source: apps/backend/src/library/probe.service.ts — execFileAsync pattern, promisify(execFile)]
- [Source: apps/backend/src/library/classification.service.ts — mutex pattern, executeClassification(), fire-and-forget chain]
- [Source: apps/backend/src/library/library.service.ts — executeMatching() fire-and-forget pattern, transaction pattern]
- [Source: apps/backend/src/database/database.service.ts — CACHE_PATH env var, transcode_jobs DDL]
- [Source: apps/backend/src/library/library.module.ts — module providers/exports pattern]
- [Source: _bmad-output/implementation-artifacts/3-1-transcode-tier-classification.md — all established patterns]
- [Source: _bmad-output/implementation-artifacts/deferred-work.md — deferred items W2, W3 from story 3-1]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.6

### Debug Log References

- Pre-existing: 2 tests in `classification.service.spec.ts` were already failing before story 3-2 (hevc labeled "non-web-compatible" in test description but hevc IS in `WEB_COMPATIBLE_VIDEO_CODECS`). These are not regressions from this story — confirmed by git stash verification.
- `execFileAsync` mock: TypeScript overload resolution with `jest.mocked()` required cast via `as unknown as jest.Mock` to avoid strict type errors.
- `CACHE_PATH` dual-use: `DatabaseService` uses it for DB file path; `TranscodeService` uses it for sidecar dir. Used `:memory:` as CACHE_PATH in tests (consistent with `classification.service.spec.ts`) to ensure in-memory DB isolation per test.

### Completion Notes List

- Implemented `TranscodeService` with `executeAudioSidecarQueue()` (mutex guard, crash recovery, error isolation per NFR13/NFR15), `processAudioSidecar()` (atomic DB transaction on success, failure tracking on error), and `runFfmpegAudioExtract()` (private, uses `execFileAsync` with the specified FFmpeg flags).
- Added `output_path TEXT` column to `transcode_jobs` DDL in `database.service.ts`.
- Wired `TranscodeService` into `LibraryModule` (providers + exports) and `ClassificationService` (constructor injection + fire-and-forget call at end of `executeClassification()` try block).
- 8 unit tests added covering: successful sidecar, FFmpeg failure, crash recovery, mutex guard, error isolation, no-jobs case, output path construction, and tier filtering (Tier 3 skipped).
- Total tests: 144 (was 136). 142 pass; 2 pre-existing failures in `classification.service.spec.ts` are unrelated to this story.

### File List

- `apps/backend/src/library/transcode.service.ts` (NEW)
- `apps/backend/src/library/transcode.service.spec.ts` (NEW)
- `apps/backend/src/database/database.service.ts` (MODIFIED: added `output_path TEXT` to `transcode_jobs` DDL)
- `apps/backend/src/library/library.module.ts` (MODIFIED: added `TranscodeService` to providers and exports)
- `apps/backend/src/library/classification.service.ts` (MODIFIED: inject `TranscodeService`, fire `executeAudioSidecarQueue()` at end of `executeClassification()` try block)
- `apps/backend/src/library/classification.service.spec.ts` (MODIFIED: added `TranscodeService` mock provider)

## Change Log

- (2026-05-03) Story 3-2 implemented: AAC audio sidecar generation for Tier 2 files. Added `TranscodeService`, wired into classification pipeline, added 8 unit tests. DB schema extended with `output_path` column.

### Review Findings

- [x] [Review][Decision] `-movflags +faststart` flag not in spec — resolved: keep and document. Dev Notes FFmpeg command updated to include the flag.
- [x] [Review][Decision] `output_path` column missing migration — resolved: accept as known limitation (fresh-install only; existing DBs require manual drop/recreate). Deferred to schema migration story.
- [x] [Review][Patch] `-v warning` vs `-v error` — moot: D1 resolved to keep `-v warning` and update spec documentation.
- [x] [Review][Patch] `fs.mkdirSync` failure leaves job in permanent retry loop [apps/backend/src/library/transcode.service.ts:69] — fixed: moved `mkdirSync` inside the `try` block after the `processing` UPDATE so the catch block correctly marks the job `failed` on directory creation failures.
- [x] [Review][Defer] No FFmpeg execution timeout [apps/backend/src/library/transcode.service.ts] — deferred, pre-existing pattern
- [x] [Review][Defer] `processAudioSidecar` is public — should be private to prevent mutex bypass [apps/backend/src/library/transcode.service.ts:64] — deferred
- [x] [Review][Defer] Crash-recovery UPDATE unguarded — exception propagates and aborts entire queue for that run [apps/backend/src/library/transcode.service.ts:31] — deferred
- [x] [Review][Defer] No row-count validation on completion transaction — cascade-deleted job produces orphaned sidecar with a false success log [apps/backend/src/library/transcode.service.ts:83] — deferred

