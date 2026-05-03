# Story 3.3: Full Video Transcode (Tier 3)

Status: done

## Story

As an admin,
I want the system to perform a full video transcode to H.264 MP4 for files with incompatible video codecs,
so that every file in the library is playable in web browsers regardless of source codec.

## Acceptance Criteria

```gherkin
Given a file is classified as Tier 3 with a transcode job in status "queued"
When the transcode worker processes the job
Then FFmpeg transcodes the video stream to H.264 (libx264) in an MP4 container with faststart flag enabled
And audio is transcoded to AAC stereo (192k) in the same output file
And the transcoded file is saved to the managed cache directory as {CACHE_PATH}/transcodes/{file_id}.mp4
And the transcoded file path is stored in the database (transcode_jobs.output_path) linked to the media file
And the source file is never modified — read-only filesystem access only (NFR9)
And the transcode job status updates to "completed" on success
And media_files.status updates to "ready" on success
And on failure, the job status updates to "failed" with error details stored (NFR15)
And media_files.status remains "classified" on failure (not clobbered)
And jobs stuck in "processing" state for Tier 3 are reset to "queued" on service startup (crash recovery, NFR15)
And the video transcode worker uses its own mutex guard to prevent concurrent execution
And the video transcode queue runs independently from the audio sidecar queue (separate mutex)
```

## Tasks / Subtasks

- [x] 1. Add `executeVideoTranscodeQueue()` method to `TranscodeService` (AC: all)
  - [x] 1.1 Add private flag `videoTranscoding = false` as a class member in `transcode.service.ts` (separate from the existing `this.transcoding` audio flag)
  - [x] 1.2 Implement `async executeVideoTranscodeQueue(): Promise<void>`:
    - Guard with `this.videoTranscoding` boolean flag (same mutex pattern as `executeAudioSidecarQueue()`)
    - Log skip: `'Video transcode already in progress, skipping'` when mutex is held
    - On entry: reset stuck Tier-3 `'processing'` rows back to `'queued'` via: `UPDATE transcode_jobs SET status = 'queued', updated_at = datetime('now') WHERE status = 'processing' AND tier = 3` (tier-specific crash recovery — prevents interfering with Tier 2 jobs)
    - Query all Tier 3 queued jobs: `SELECT tj.id, tj.file_id, mf.path as file_path FROM transcode_jobs tj JOIN media_files mf ON mf.id = tj.file_id WHERE tj.tier = 3 AND tj.status = 'queued' ORDER BY tj.created_at ASC`
    - Iterate jobs, calling `await this.processVideoTranscode(job)` for each, wrapped in try-catch (log error, continue — error isolation per NFR13)
    - Log: `Processing ${jobs.length} queued Tier 3 video transcode jobs`
    - Set `this.videoTranscoding = false` in finally block

- [x] 2. Add `processVideoTranscode()` method to `TranscodeService` (AC: all)
  - [x] 2.1 Implement `async processVideoTranscode(job: { id: number; file_id: number; file_path: string }): Promise<void>` — same structure as `processAudioSidecar()`:
    - Read `cachePath` from `this.config.get<string>('CACHE_PATH') || '/mnt/cache'`
    - Compute output directory: `path.join(cachePath, 'transcodes')` — different from sidecars (`'sidecars'` vs `'transcodes'`)
    - Create it with `fs.mkdirSync(outputDir, { recursive: true })` inside the try block (after the 'processing' status update, so failures here are caught and marked 'failed')
    - Compute output filename: `${job.file_id}.mp4` (file_id is stable and unique, `.mp4` for video transcode)
    - Compute `outputPath = path.join(outputDir, outputFilename)`
    - Mark job processing: `UPDATE transcode_jobs SET status = 'processing', updated_at = datetime('now') WHERE id = ?` with `job.id` (BEFORE try block, same as audio sidecar)
    - Call `await this.runFfmpegVideoTranscode(job.file_path, outputPath)` — if throws, catch writes failure
    - **On success** (inside `db.transaction()`):
      - `UPDATE transcode_jobs SET status = 'completed', output_path = ?, updated_at = datetime('now') WHERE id = ?`
      - `UPDATE media_files SET status = 'ready', updated_at = datetime('now') WHERE id = ?` with `job.file_id`
    - **On failure**:
      - `UPDATE transcode_jobs SET status = 'failed', error_details = ?, updated_at = datetime('now') WHERE id = ?` (do NOT update media_files — status stays 'classified')
      - Log: `Video transcode failed for file_id ${job.file_id}: ${errorMessage}`
      - Rethrow so the outer loop can catch and continue to next job
    - **On success** log: `Video transcode completed for file_id ${job.file_id}: ${outputPath}`

- [x] 3. Add private `runFfmpegVideoTranscode()` to `TranscodeService` (AC: FFmpeg H.264 encoding)
  - [x] 3.1 Implement `private async runFfmpegVideoTranscode(inputPath: string, outputPath: string): Promise<void>`:
    - Call: `await execFileAsync('ffmpeg', ['-v', 'warning', '-i', inputPath, '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-ac', '2', '-movflags', '+faststart', '-y', outputPath])`
    - No stdout/stderr processing needed — FFmpeg exit code non-zero triggers rejection automatically
    - See Dev Notes for FFmpeg flag rationale

- [x] 4. Wire `executeVideoTranscodeQueue()` into `ClassificationService` pipeline (AC: pipeline integration)
  - [x] 4.1 In `classification.service.ts`, immediately after the existing `this.transcodeService.executeAudioSidecarQueue().catch(...)` fire-and-forget call, add an identical call for the video queue:
    ```typescript
    this.transcodeService.executeVideoTranscodeQueue().catch((err: unknown) =>
      this.logger.error(
        `Video transcode queue failed: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
    ```
  - [x] 4.2 Update the TranscodeService mock in `classification.service.spec.ts` to add `executeVideoTranscodeQueue: jest.fn().mockResolvedValue(undefined)` to the mock's `useValue` object — this prevents `TypeError: ... is not a function` when the classification service calls the new method during tests

- [x] 5. Unit tests for Tier 3 in `transcode.service.spec.ts` (AC: all)
  - [x] 5.1 Add helpers to existing spec: `insertClassifiedFile(..., tier = 3)` already supports any tier; no helper changes needed
  - [x] 5.2 Test successful video transcode: mock `execFileAsync` resolves → `transcode_jobs.status = 'completed'`, `output_path` set to `{cachePath}/transcodes/{fileId}.mp4`, `media_files.status = 'ready'`
  - [x] 5.3 Test FFmpeg failure: mock `execFileAsync` rejects → `transcode_jobs.status = 'failed'`, `error_details` populated, `media_files.status` stays `'classified'`
  - [x] 5.4 Test Tier-3-specific crash recovery: insert a Tier 3 job with `status = 'processing'`, call `executeVideoTranscodeQueue()` → job resets to `'queued'` then processes to `'completed'`
  - [x] 5.5 Test crash recovery Tier isolation: insert Tier 2 job with `status = 'processing'`, call `executeVideoTranscodeQueue()` → Tier 2 job is NOT reset (stays `'processing'`)
  - [x] 5.6 Test mutex guard (`videoTranscoding`): set `(service as any).videoTranscoding = true` → second call is no-op, logs 'already in progress'
  - [x] 5.7 Test error isolation: two Tier 3 jobs, first fails, second succeeds → second job completes
  - [x] 5.8 Test no Tier 3 jobs: `executeVideoTranscodeQueue()` with no queued Tier 3 jobs → no FFmpeg calls
  - [x] 5.9 Test output path construction: verify output path is `${cachePath}/transcodes/${fileId}.mp4`
  - [x] 5.10 Test tier filtering: Tier 2 queued job present → `executeVideoTranscodeQueue()` does NOT process it (status stays `'queued'`)
  - [x] 5.11 Run full backend test suite — target: all 142 currently-passing tests still pass; 2 pre-existing failures in `classification.service.spec.ts` (hevc description mismatch) are expected and unrelated to this story

### Review Findings

- [x] [Review][Patch] Syntax error in test 5.9 — extra `)` in `path.join(TRANSCODE_DIR, ...)` prevents test file from compiling [apps/backend/src/library/transcode.service.spec.ts] — false positive; staged file had correct syntax, no action needed
- [x] [Review][Patch] Test 5.7 ordering is non-deterministic — `ORDER BY tj.created_at ASC` has 1-second SQLite resolution; two jobs inserted in the same second get identical timestamps, making queue order undefined and the test potentially flaky [apps/backend/src/library/transcode.service.ts + transcode.service.spec.ts]
- [x] [Review][Defer] `processVideoTranscode` is public, callers can bypass `videoTranscoding` mutex [apps/backend/src/library/transcode.service.ts] — deferred, pre-existing (same as `processAudioSidecar`; explicit in story notes)
- [x] [Review][Defer] Crash recovery races in multi-instance deployments — `videoTranscoding` is in-process only; two instances can both reset and re-queue the same job [apps/backend/src/library/transcode.service.ts] — deferred, pre-existing
- [x] [Review][Defer] No retry path for `failed` transcode jobs — permanently stuck without DB intervention [apps/backend/src/library/transcode.service.ts] — deferred, pre-existing
- [x] [Review][Defer] `processVideoTranscode` 'processing' update before try block — DB error loops job forever without a retry cap [apps/backend/src/library/transcode.service.ts] — deferred, pre-existing (same pattern as audio sidecar)
- [x] [Review][Defer] Unbounded `.all()` query materializes full queue into memory [apps/backend/src/library/transcode.service.ts] — deferred, pre-existing systemic pattern
- [x] [Review][Defer] Video with no audio stream transcodes silently to audio-less MP4 with no warning — out of scope [apps/backend/src/library/transcode.service.ts] — deferred, pre-existing

## Dev Notes

### Pipeline Flow After This Story

```
discovered → [ProbeService] → probed → [MatchingService] → matched → [ClassificationService] → classified
  → [TranscodeService.executeAudioSidecarQueue()] → (Tier 2: audio sidecar) → ready
  → [TranscodeService.executeVideoTranscodeQueue()] → (Tier 3: full video transcode) → ready
```

Both queues fire non-blocking from `ClassificationService.executeClassification()` at the end of the `try` block:
```typescript
// Existing (story 3-2)
this.transcodeService.executeAudioSidecarQueue().catch((err: unknown) =>
  this.logger.error(`Transcode queue failed: ${err instanceof Error ? err.message : String(err)}`),
);
// New (story 3-3)
this.transcodeService.executeVideoTranscodeQueue().catch((err: unknown) =>
  this.logger.error(`Video transcode queue failed: ${err instanceof Error ? err.message : String(err)}`),
);
```

Both queues run concurrently with each other (different mutex flags). On modest hardware this means one audio job and one video job could run simultaneously. Story 3-5 ("Unattended Queue Processing") will own the unified sequential scheduler if needed.

### FFmpeg Command for Full Video Transcode

```bash
ffmpeg -v warning -i <input> -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p -c:a aac -b:a 192k -ac 2 -movflags +faststart -y <output.mp4>
```

**Flag rationale:**
- `-v warning` — same verbosity as audio sidecar (show warnings, suppress progress noise) — consistent with `runFfmpegAudioExtract()`
- `-c:v libx264` — H.264 encoder. Do NOT use `libx265` (HEVC — not universally supported in browsers without MSE), `libvpx-vp9` (requires WebM container), or `copy` (input codec may be non-web-compatible, this IS the full-transcode case)
- `-preset medium` — FFmpeg's default libx264 preset; balances encoding speed vs. file size. `slow` gives marginally better compression but doubles CPU time; `fast` noticeably reduces quality. `medium` is the correct default for a home server
- `-crf 23` — Constant Rate Factor: FFmpeg's default for libx264, visually transparent quality. Range 0 (lossless) to 51 (worst); 18–28 is typical. 23 is the right default for archival quality without excessive file size
- `-pix_fmt yuv420p` — **CRITICAL for browser compatibility**: Forces 4:2:0 chroma subsampling. Source files (especially HEVC, AV1, ProRes) may use 4:2:2 or 4:4:4 which most browser H.264 decoders do NOT support. Without this flag, high-chroma source files produce MP4s that fail to play in browsers
- `-c:a aac` — Transcode audio to AAC (same as Tier 2 sidecar). Required even if source audio is AAC — the MP4 container requires re-muxing, and some AAC-in-MKV encodings need remuxing anyway
- `-b:a 192k` — Same 192 kbps CBR bitrate as audio sidecar (consistent, browser-safe quality)
- `-ac 2` — Downmix to stereo (same rationale as audio sidecar: browser AAC decoders are stereo-first)
- `-movflags +faststart` — Moves the moov atom to the start of the MP4 file. **REQUIRED** for web playback: without this, the browser cannot start decoding until the full file is downloaded. The equivalent for streaming
- `-y` — Overwrite existing output (idempotent; safe for retries on failed jobs)
- Output: `.mp4` container — only container that guarantees browser-native H.264 playback without MSE; `.mkv` with H.264 requires MSE and is not universally playable via `<video src>`

**Important:** `libx264` is standard in all `ffmpeg` builds. Do NOT use `libx264rgb`, `libx264_10bit`, or any variant.

### Output File Storage

- Transcoded files go to: `{CACHE_PATH}/transcodes/{file_id}.mp4`
- Different subdirectory from Tier 2 sidecars (`sidecars/` vs `transcodes/`) — keeps artifacts organized
- `CACHE_PATH` env var (default `/mnt/cache`) — same env var as audio sidecar; read from NestJS `ConfigService`
- Directory created with `fs.mkdirSync(outputDir, { recursive: true })` inside the try block (same fixed location as story 3-2's post-review fix)
- `file_id` (integer PK from `media_files`) used as filename — stable, unique, no filesystem escaping needed
- Path stored in `transcode_jobs.output_path` (TEXT column already added in story 3-2)
- NFR9 (read-only source): `TranscodeService` reads `file_path` from DB — NEVER writes to source media directories

### Mutex Design: Separate Flags for Audio vs Video

The `TranscodeService` now has two independent queue methods:

| Method | Mutex Flag | Tier Filter | Crash Recovery |
|---|---|---|---|
| `executeAudioSidecarQueue()` | `this.transcoding` (existing) | `tier = 2` in SELECT | `WHERE status = 'processing'` (broad, no tier filter — pre-existing, do not change) |
| `executeVideoTranscodeQueue()` | `this.videoTranscoding` (new) | `tier = 3` in SELECT | `WHERE status = 'processing' AND tier = 3` (tier-specific) |

**Why tier-specific crash recovery for video:** The audio queue's broad crash recovery (no tier filter) means if a new audio queue starts after a crash, it will reset ANY stuck processing jobs — including Tier 3. This is acceptable given single-process node.js execution. The video queue's tier-specific recovery avoids the reverse interference problem (video resetting Tier 2 jobs). This asymmetry is intentional — modifying the existing audio queue's crash recovery is out of scope.

**Deferred note:** The audio queue's broad `WHERE status = 'processing'` crash recovery could theoretically reset a Tier 3 job that is legitimately 'processing' if a new classification cycle fires a new audio queue while the video queue is mid-job. In practice this is unlikely (audio crash recovery runs only at the top of queue execution, not mid-run). Story 3-5 should address this by implementing a proper unified queue scheduler.

### `processVideoTranscode()` Structure

```typescript
// apps/backend/src/library/transcode.service.ts — new method
async processVideoTranscode(job: {
  id: number;
  file_id: number;
  file_path: string;
}): Promise<void> {
  const cachePath = this.config.get<string>('CACHE_PATH') || '/mnt/cache';
  const outputDir = path.join(cachePath, 'transcodes');
  const outputPath = path.join(outputDir, `${job.file_id}.mp4`);

  const db = this.database.getDatabase();
  db.prepare(
    "UPDATE transcode_jobs SET status = 'processing', updated_at = datetime('now') WHERE id = ?",
  ).run(job.id);

  try {
    fs.mkdirSync(outputDir, { recursive: true });
    await this.runFfmpegVideoTranscode(job.file_path, outputPath);

    const completeTx = db.transaction(() => {
      db.prepare(
        "UPDATE transcode_jobs SET status = 'completed', output_path = ?, updated_at = datetime('now') WHERE id = ?",
      ).run(outputPath, job.id);
      db.prepare(
        "UPDATE media_files SET status = 'ready', updated_at = datetime('now') WHERE id = ?",
      ).run(job.file_id);
    });
    completeTx();

    this.logger.log(`Video transcode completed for file_id ${job.file_id}: ${outputPath}`);
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    db.prepare(
      "UPDATE transcode_jobs SET status = 'failed', error_details = ?, updated_at = datetime('now') WHERE id = ?",
    ).run(errorMessage, job.id);
    this.logger.error(`Video transcode failed for file_id ${job.file_id}: ${errorMessage}`);
    throw err; // rethrow so the outer loop can catch and continue to next job
  }
}
```

### `runFfmpegVideoTranscode()` Structure

```typescript
// apps/backend/src/library/transcode.service.ts — new private method
private async runFfmpegVideoTranscode(
  inputPath: string,
  outputPath: string,
): Promise<void> {
  await execFileAsync('ffmpeg', [
    '-v', 'warning',
    '-i', inputPath,
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',   // REQUIRED: forces 4:2:0 for browser H.264 support
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ac', '2',
    '-movflags', '+faststart',
    '-y',
    outputPath,
  ]);
}
```

### `executeVideoTranscodeQueue()` Structure

```typescript
// apps/backend/src/library/transcode.service.ts — new method
async executeVideoTranscodeQueue(): Promise<void> {
  if (this.videoTranscoding) {
    this.logger.log('Video transcode already in progress, skipping');
    return;
  }
  this.videoTranscoding = true;
  try {
    const db = this.database.getDatabase();

    // Crash recovery: reset stuck Tier 3 'processing' jobs (tier-specific to avoid interfering with Tier 2)
    db.prepare(
      "UPDATE transcode_jobs SET status = 'queued', updated_at = datetime('now') WHERE status = 'processing' AND tier = 3",
    ).run();

    const jobs = db
      .prepare(
        `SELECT tj.id, tj.file_id, mf.path as file_path
         FROM transcode_jobs tj
         JOIN media_files mf ON mf.id = tj.file_id
         WHERE tj.tier = 3 AND tj.status = 'queued'
         ORDER BY tj.created_at ASC`,
      )
      .all() as { id: number; file_id: number; file_path: string }[];

    this.logger.log(`Processing ${jobs.length} queued Tier 3 video transcode jobs`);

    for (const job of jobs) {
      try {
        await this.processVideoTranscode(job);
      } catch (err: unknown) {
        this.logger.error(
          `Video transcode queue error for job ${job.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  } finally {
    this.videoTranscoding = false;
  }
}
```

### `TranscodeService` Class Member Changes

Add alongside existing `private transcoding = false`:
```typescript
// existing
private transcoding = false;
// new
private videoTranscoding = false;
```

### ClassificationService Update

In `classification.service.ts`, `executeClassification()` try block currently ends with:
```typescript
      this.transcodeService.executeAudioSidecarQueue().catch((err: unknown) =>
        this.logger.error(
          `Transcode queue failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    } finally {
```

Add immediately after (before `} finally`):
```typescript
      this.transcodeService.executeVideoTranscodeQueue().catch((err: unknown) =>
        this.logger.error(
          `Video transcode queue failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
```

### classification.service.spec.ts Mock Update

The TranscodeService mock currently provides only `executeAudioSidecarQueue`. Add `executeVideoTranscodeQueue` to prevent `TypeError: this.transcodeService.executeVideoTranscodeQueue is not a function`:

```typescript
{
  provide: TranscodeService,
  useValue: {
    executeAudioSidecarQueue: jest.fn().mockResolvedValue(undefined),
    executeVideoTranscodeQueue: jest.fn().mockResolvedValue(undefined),  // ADD
  },
},
```

### Architecture Compliance

- **NFR9 (Read-only source):** `processVideoTranscode()` reads `file_path` from DB, only writes to `{CACHE_PATH}/transcodes/`. Never touches source media directories
- **NFR13 (Error isolation):** try-catch per job in `executeVideoTranscodeQueue()` — one FFmpeg failure never blocks subsequent Tier 3 jobs
- **NFR15 (Retryable failures):** `failed` status + `error_details` enables future retry (story 3-5); crash recovery resets `processing` → `queued` on restart
- **NFR20 (Bundled FFmpeg):** `libx264` is a standard part of all `ffmpeg` binary builds including the bundled Docker image from story 1-2

### Library/Framework Requirements

- **No new npm dependencies** — same Node.js built-ins (`child_process`, `fs`, `path`, `util`) and existing NestJS/better-sqlite3 as story 3-2
- **`execFileAsync`** — same module-level promisified `execFile` constant already in `transcode.service.ts`. Do NOT re-declare it; it's already defined at the top of the file
- **`better-sqlite3` synchronous API** — all DB operations are synchronous (no async/await on DB calls)
- **`db.transaction()`** — wraps the completion UPDATE pair atomically (output_path + media_files.status)

### File Structure

```
apps/backend/src/library/
├── transcode.service.ts          # UPDATE: add videoTranscoding flag, executeVideoTranscodeQueue(),
│                                 #         processVideoTranscode(), runFfmpegVideoTranscode()
├── transcode.service.spec.ts     # UPDATE: add ~9 Tier 3 unit tests
├── classification.service.ts     # UPDATE: fire executeVideoTranscodeQueue() non-blocking at end of try block
└── classification.service.spec.ts # UPDATE: add executeVideoTranscodeQueue mock to TranscodeService mock
```

No new files. No changes to `library.module.ts`, `database.service.ts`, or any other file.

### Testing Requirements

- **Test setup pattern:** Use the EXACT same test helpers in `transcode.service.spec.ts` — `insertSource()`, `insertClassifiedFile()`, `insertTranscodeJob()`, `getJob()`, `getFile()`, `mockFfmpegSuccess()`, `mockFfmpegFailure()` are all reusable for Tier 3 tests
- **Output dir cleanup:** The `afterEach` in `transcode.service.spec.ts` currently cleans up `{SIDECAR_DIR}` only. Add cleanup for the transcodes dir: `const TRANSCODE_DIR = path.join(TEST_CACHE_PATH, 'transcodes')` and add `if (fs.existsSync(TRANSCODE_DIR)) { fs.rmSync(TRANSCODE_DIR, { recursive: true, force: true }); }` in `afterEach`
- **Crash recovery isolation test (5.5):** Critical test — verify `executeVideoTranscodeQueue()` does NOT reset a Tier 2 'processing' job. Insert a Tier 2 job with `status = 'processing'`, run `executeVideoTranscodeQueue()`, verify the Tier 2 job still has `status = 'processing'`
- **Tier filtering test (5.10):** Insert a Tier 2 queued job, run `executeVideoTranscodeQueue()`, verify Tier 2 job status stays `'queued'` and `mockExecFile` was not called for it

### Previous Story Intelligence (from 3-2)

From the story 3-2 review findings:
- **Review fix (applied in 3-2):** `fs.mkdirSync` must be inside the `try` block (AFTER the `processing` status update) so filesystem failures are caught and the job is marked `'failed'`. The `processVideoTranscode()` method MUST follow this fixed pattern — not the original story spec pattern
- **`processAudioSidecar` is public** (deferred from 3-2 review) — replicate this: `processVideoTranscode()` will also be public. The deferred item applies equally to the new method — document it as deferred
- **`-movflags +faststart` applied in 3-2** — already in the audio sidecar FFmpeg command and confirmed kept. Include in video transcode command as well (independently required)
- **Error string pattern:** `err instanceof Error ? err.message : String(err)` — used consistently throughout this service
- **Test count baseline:** 144 total tests (142 pass, 2 pre-existing failures in classification.service.spec.ts). New story adds ~9 tests → expect ~153 total (151 passing)

### Deferred Items This Story Creates

- `processVideoTranscode()` is public (same as `processAudioSidecar()`) — callers can bypass mutex. Defer to future refactor story
- No FFmpeg execution timeout for video transcode (full transcodes can take minutes on large files — even higher risk than audio sidecars). Deferred pre-existing pattern
- Audio queue crash recovery (no tier filter) could theoretically reset a running Tier 3 'processing' job if a new classification cycle fires. Low probability in single-process Node.js. Story 3-5 should add a unified queue scheduler with proper locking

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 3.3 acceptance criteria]
- [Source: _bmad-output/planning-artifacts/epics.md — Story 3.5 pipeline flow, sequential processing]
- [Source: _bmad-output/planning-artifacts/epics.md — Story 4.1 "only titles with status 'ready' appear in viewer-facing endpoints"]
- [Source: _bmad-output/implementation-artifacts/3-2-aac-audio-sidecar-generation-tier-2.md — TranscodeService patterns, mutex, transaction, error isolation, test patterns]
- [Source: _bmad-output/implementation-artifacts/3-2-aac-audio-sidecar-generation-tier-2.md — Review findings: mkdirSync inside try block]
- [Source: _bmad-output/implementation-artifacts/deferred-work.md — deferred items from 3-2: processAudioSidecar public, no timeout, crash-recovery unguarded]
- [Source: apps/backend/src/library/transcode.service.ts — full existing implementation, execFileAsync pattern, mutex pattern]
- [Source: apps/backend/src/library/transcode.service.spec.ts — test helpers, mock patterns, afterEach cleanup]
- [Source: apps/backend/src/library/classification.service.ts — existing fire-and-forget call pattern at end of executeClassification()]
- [Source: apps/backend/src/library/classification.service.spec.ts — TranscodeService mock structure]
- [Source: apps/backend/src/database/database.service.ts — transcode_jobs DDL, output_path column confirmed present]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.6

### Debug Log References

### Completion Notes List

- Implemented `executeVideoTranscodeQueue()` with tier-specific crash recovery (`WHERE status = 'processing' AND tier = 3`) and separate `videoTranscoding` mutex flag
- Implemented `processVideoTranscode()` following the fixed pattern from story 3-2 review: `fs.mkdirSync` inside the try block, atomic completion transaction updating both `transcode_jobs` and `media_files`, failure does NOT update `media_files.status`
- Implemented `runFfmpegVideoTranscode()` with H.264 libx264, `-pix_fmt yuv420p` (critical for browser compatibility), `-movflags +faststart`, AAC 192k stereo audio
- Wired `executeVideoTranscodeQueue()` as fire-and-forget in `ClassificationService.executeClassification()` alongside the existing audio queue call; both queues run concurrently with independent mutex flags
- Updated `classification.service.spec.ts` TranscodeService mock to include `executeVideoTranscodeQueue`
- Added 9 Tier 3 unit tests covering: success, FFmpeg failure, crash recovery, Tier isolation, mutex guard, error isolation, no-jobs no-op, output path, tier filtering
- `processVideoTranscode()` is public (consistent with `processAudioSidecar()`) — deferred to future refactor story
- Test results: 153 total (151 passing, 2 pre-existing HEVC description failures in classification.service.spec.ts — unrelated to this story)

### File List

apps/backend/src/library/transcode.service.ts
apps/backend/src/library/transcode.service.spec.ts
apps/backend/src/library/classification.service.ts
apps/backend/src/library/classification.service.spec.ts

## Change Log

- 2026-05-03: Story 3-3 implemented — added full video transcode (Tier 3) to TranscodeService with H.264/AAC MP4 output, tier-specific crash recovery, separate mutex, and 9 new unit tests; wired into ClassificationService pipeline
