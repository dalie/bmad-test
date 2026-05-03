# Story 3.4: Subtitle Extraction and WebVTT Conversion

Status: ready-for-dev

## Story

As an admin,
I want the system to convert all cataloged subtitles to WebVTT format,
So that subtitles are ready for browser-native playback via the `<track>` element.

## Acceptance Criteria

```gherkin
Given a file has subtitle tracks cataloged in the subtitles table (embedded or sidecar .srt/.ass/.sub)
When the subtitle conversion service processes the file
Then each subtitle track is extracted (if embedded) or read (if sidecar) and converted to WebVTT format via FFmpeg
And WebVTT files are saved to the managed cache directory as {CACHE_PATH}/subtitles/{subtitle_id}.vtt
And the WebVTT file path is stored in subtitles.webvtt_path linked to the subtitle row
And conversion failures are logged per-track without blocking other tracks or files (NFR13)
And the source file and sidecar subtitle files are never modified — read-only access only (NFR9)
And a mutex guard prevents concurrent queue execution
And subtitle queue runs are idempotent — rows with webvtt_path already set are skipped
```

## Tasks / Subtasks

- [ ] 1. Create `apps/backend/src/library/subtitle.service.ts` (AC: all)
  - [ ] 1.1 Define class `SubtitleService` with `@Injectable()`, `Logger`, `converting = false` mutex, constructor injecting `DatabaseService` and `ConfigService`
  - [ ] 1.2 Implement `async executeSubtitleConversionQueue(): Promise<void>`:
    - Guard with `this.converting` boolean (same mutex pattern as `executeAudioSidecarQueue()`)
    - Log skip: `'Subtitle conversion already in progress, skipping'` when mutex is held
    - Query all subtitle rows where `webvtt_path IS NULL` (implicit crash recovery — no status column needed):
      ```sql
      SELECT s.id, s.media_file_id, s.track_index, s.type, s.language, s.codec,
             s.sidecar_path, mf.path as file_path
      FROM subtitles s
      JOIN media_files mf ON mf.id = s.media_file_id
      WHERE s.webvtt_path IS NULL
      ORDER BY s.media_file_id ASC, s.id ASC
      ```
    - Log: `Processing ${subtitles.length} subtitles pending WebVTT conversion`
    - Iterate rows, call `await this.processSubtitleConversion(subtitle)` for each in try-catch (log error, continue — per NFR13)
    - Set `this.converting = false` in `finally` block
  - [ ] 1.3 Implement `async processSubtitleConversion(subtitle: SubtitleRow): Promise<void>`:
    - Read `cachePath` from `this.config.get<string>('CACHE_PATH') || '/mnt/cache'`
    - Compute `outputDir = path.join(cachePath, 'subtitles')` — new subdirectory, distinct from `sidecars/` and `transcodes/`
    - Compute `outputPath = path.join(outputDir, '${subtitle.id}.vtt')` — subtitle DB row ID is stable, unique, no escaping needed
    - Create directory with `fs.mkdirSync(outputDir, { recursive: true })` inside a try block
    - Call `await this.runFfmpegSubtitleConvert(subtitle.file_path, outputPath, subtitle.type, subtitle.track_index)` — dispatches to the correct FFmpeg command
    - **On success**: `UPDATE subtitles SET webvtt_path = ?, updated_at = datetime('now') WHERE id = ?` with `[outputPath, subtitle.id]`
    - Log success: `WebVTT conversion completed for subtitle_id ${subtitle.id} (${subtitle.type}, media_file_id=${subtitle.media_file_id}): ${outputPath}`
    - **On failure**: log `WebVTT conversion failed for subtitle_id ${subtitle.id}: ${errorMessage}` then rethrow so outer loop can catch and continue
    - **Do NOT** update media_files.status — subtitle conversion failure should not mark the file as failed
  - [ ] 1.4 Implement `private async runFfmpegSubtitleConvert(filePath: string, outputPath: string, type: string, trackIndex: number | null): Promise<void>`:
    - **For embedded** (`type === 'embedded'` and `trackIndex` is not null):
      ```typescript
      await execFileAsync('ffmpeg', ['-v', 'warning', '-i', filePath, '-map', `0:${trackIndex}`, '-c:s', 'webvtt', '-y', outputPath])
      ```
    - **For sidecar** (`type === 'sidecar'`):
      ```typescript
      await execFileAsync('ffmpeg', ['-v', 'warning', '-i', subtitle.sidecar_path, '-c:s', 'webvtt', '-y', outputPath])
      ```
      Note: Pass `subtitle.sidecar_path` (not `filePath`) as input for sidecar conversions — sidecar input is the subtitle file itself, not the video file. The `filePath` (video path) is irrelevant for sidecars.
    - **IMPORTANT**: `filePath` in the method signature should be renamed to `videoPath` to avoid confusion. For embedded it is the video file; for sidecar, the `sidecar_path` from the subtitle row is used instead — do NOT use the video path as input for sidecar conversions
  - [ ] 1.5 Define the `SubtitleRow` interface locally in `subtitle.service.ts`:
    ```typescript
    interface SubtitleRow {
      id: number;
      media_file_id: number;
      track_index: number | null;
      type: 'embedded' | 'sidecar';
      language: string | null;
      codec: string | null;
      sidecar_path: string | null;
      file_path: string;  // from JOIN with media_files
    }
    ```
  - [ ] 1.6 Add required imports: `Injectable`, `Logger` from `@nestjs/common`; `ConfigService` from `@nestjs/config`; `execFile` from `child_process`; `fs`, `path` from node; `promisify` from `util`; `DatabaseService`

- [ ] 2. Register `SubtitleService` in `apps/backend/src/library/library.module.ts`
  - [ ] 2.1 Add `SubtitleService` to `providers` array
  - [ ] 2.2 Add `SubtitleService` to `exports` array
  - [ ] 2.3 Add the import at the top of the file

- [ ] 3. Wire `SubtitleService` into `ClassificationService` (AC: subtitle queue fires after classification)
  - [ ] 3.1 Import `SubtitleService` in `classification.service.ts`
  - [ ] 3.2 Add `SubtitleService` to `ClassificationService` constructor
  - [ ] 3.3 In `executeClassification()` try block, add fire-and-forget call after the two existing transcode queue calls:
    ```typescript
    this.subtitleService.executeSubtitleConversionQueue().catch((err: unknown) =>
      this.logger.error(
        `Subtitle conversion queue failed: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
    ```

- [ ] 4. Update `classification.service.spec.ts` to add `SubtitleService` mock
  - [ ] 4.1 Add `SubtitleService` to the mock providers `useValue` object:
    ```typescript
    {
      provide: SubtitleService,
      useValue: {
        executeAudioSidecarQueue: jest.fn().mockResolvedValue(undefined),
        executeVideoTranscodeQueue: jest.fn().mockResolvedValue(undefined),
        executeSubtitleConversionQueue: jest.fn().mockResolvedValue(undefined),
      },
    }
    ```
    **Wait** — the `SubtitleService` is a new separate mock; `TranscodeService` mock stays as-is. The SubtitleService mock only needs `executeSubtitleConversionQueue`.
    - Correct: add a **new** `{ provide: SubtitleService, useValue: { executeSubtitleConversionQueue: jest.fn().mockResolvedValue(undefined) } }` to providers — do NOT touch the TranscodeService mock
  - [ ] 4.2 Add `import { SubtitleService } from './subtitle.service';` to spec imports

- [ ] 5. Create `apps/backend/src/library/subtitle.service.spec.ts` (AC: all)
  - [ ] 5.1 Set up test module following `transcode.service.spec.ts` pattern:
    - Mock `child_process.execFile` with `jest.mock('child_process', ...)`
    - Use `:memory:` as `CACHE_PATH` — subtitle dir becomes `:memory:/subtitles`
    - Clean up subtitle dir in `afterEach` (same `fs.rmSync` pattern as transcode spec)
    - Helpers: `insertSource()`, `insertMediaFile(sourceId, filename, status?)`, `insertSubtitle(mediaFileId, type, trackIndex?, sidecarcPath?, language?, codec?)`, `getSubtitle(id)`, `mockFfmpegSuccess()`, `mockFfmpegFailure()`
  - [ ] 5.2 Test successful embedded subtitle conversion:
    - Insert media file with embedded subtitle (`track_index = 2`, `type = 'embedded'`)
    - Call `executeSubtitleConversionQueue()`
    - Assert `webvtt_path` = `path.join(':memory:/subtitles', '${subtitleId}.vtt')`
    - Assert `execFile` called with `-map 0:2` and output path ending in `.vtt`
    - Assert `-i` arg is the video file path (not sidecar path)
  - [ ] 5.3 Test successful sidecar subtitle conversion:
    - Insert media file with sidecar subtitle (`track_index = NULL`, `type = 'sidecar'`, `sidecar_path = '/media/Movie.en.srt'`)
    - Call `executeSubtitleConversionQueue()`
    - Assert `webvtt_path` set to expected `.vtt` path
    - Assert `-i` arg is `/media/Movie.en.srt` (the sidecar file), NOT the video file path
    - Assert no `-map` flag in FFmpeg args
  - [ ] 5.4 Test FFmpeg failure for one subtitle (error isolation, NFR13):
    - Insert two subtitle rows for the same file
    - Mock: first FFmpeg call fails, second succeeds
    - Call `executeSubtitleConversionQueue()`
    - Assert first subtitle's `webvtt_path` remains NULL (not updated on failure)
    - Assert second subtitle's `webvtt_path` is set (processing continued)
  - [ ] 5.5 Test mutex guard:
    - Set `(service as any).converting = true`
    - Call `executeSubtitleConversionQueue()`
    - Assert log message contains `'already in progress'`
    - Assert `execFile` not called
  - [ ] 5.6 Test idempotency — rows with `webvtt_path` already set are skipped:
    - Insert subtitle with `webvtt_path = '/some/path.vtt'` already populated
    - Call `executeSubtitleConversionQueue()`
    - Assert `execFile` NOT called (row already converted)
  - [ ] 5.7 Test empty queue:
    - No subtitle rows in DB
    - Call `executeSubtitleConversionQueue()`
    - Assert `execFile` not called
  - [ ] 5.8 Test output path construction:
    - Verify output path is `path.join(':memory:/subtitles', '${subtitleId}.vtt')`
  - [ ] 5.9 Test no media_files.status change on FFmpeg failure:
    - Insert file with `status = 'ready'`, subtitle row for it
    - Mock FFmpeg failure
    - Call queue
    - Assert `media_files.status` still `'ready'` (not changed to 'failed' or anything else)
  - [ ] 5.10 Run full backend test suite — target: all currently-passing tests still pass; 2 pre-existing failures in `classification.service.spec.ts` (hevc description mismatch) are expected and unrelated

### Review Findings

(None yet — story not yet implemented)

## Dev Notes

### Pipeline Flow After This Story

```
discovered → [ProbeService] → probed → [MatchingService] → matched → [ClassificationService] → classified
  → [TranscodeService.executeAudioSidecarQueue()]    → (Tier 2: audio sidecar) → ready
  → [TranscodeService.executeVideoTranscodeQueue()]  → (Tier 3: full video transcode) → ready
  → [SubtitleService.executeSubtitleConversionQueue()] → (all tiers: subtitle WebVTT) → webvtt_path set
```

All three queues fire non-blocking (fire-and-forget) from `ClassificationService.executeClassification()` end of `try` block. All run concurrently. Story 3-5 ("Unattended Queue Processing") will own proper sequencing if subtitle conversion must strictly follow primary transcode completion.

**Tier 1 files**: No transcode job is created, but subtitle conversion still fires. This is correct behavior — Tier 1 files serve the original video directly and still need WebVTT subtitles for browser playback.

### FFmpeg Commands

**Embedded subtitle extraction (type = 'embedded'):**
```bash
ffmpeg -v warning -i <video_file_path> -map 0:<track_index> -c:s webvtt -y <output.vtt>
```
- `-map 0:<track_index>`: selects stream by absolute stream index (e.g. `0:3` for stream index 3)
- `track_index` is the `subtitles.track_index` column (populated from ffprobe's `streams[n].index`)
- `-c:s webvtt`: encode subtitle stream to WebVTT format
- `-v warning`: consistent verbosity with other FFmpeg calls in this codebase
- `-y`: overwrite existing output (idempotent for retries)
- **Input is the VIDEO FILE** — not the subtitle file — for embedded track extraction

**Sidecar subtitle conversion (type = 'sidecar'):**
```bash
ffmpeg -v warning -i <sidecar_path> -c:s webvtt -y <output.vtt>
```
- **Input is the SIDECAR SUBTITLE FILE** (`subtitles.sidecar_path`) — NOT the video file
- No `-map` needed: sidecar file contains a single subtitle stream (stream 0)
- Supported input formats: `.srt` (subrip), `.ass` (Advanced SubStation Alpha), `.sub` (SubRip or MicroDVD text format)
- **Note on bitmap `.sub` files**: VobSub `.sub` files (bitmap subtitles from DVD VOB) CANNOT be converted to WebVTT by FFmpeg — FFmpeg will exit non-zero. These will be logged as failures per NFR13 and their `webvtt_path` will stay NULL. This is acceptable — bitmap subtitles require OCR to convert to text and are out of scope.
- **Note on embedded bitmap codecs** (`dvd_subtitle`, `hdmv_pgs_subtitle`, `dvbsub`): Same limitation — FFmpeg will fail, error logged, processing continues for other tracks.

### Output File Storage

- WebVTT files go to: `{CACHE_PATH}/subtitles/{subtitle_id}.vtt`
- `subtitle_id` is the integer PK from the `subtitles` table (stable, unique, no filesystem escaping needed)
- Subdirectory `subtitles/` — distinct from `sidecars/` (audio m4a) and `transcodes/` (video mp4)
- `CACHE_PATH` env var (default `/mnt/cache`) — same env var as other transcode services
- Directory created with `fs.mkdirSync(outputDir, { recursive: true })` inside the try block (consistent with `processVideoTranscode` post-review fix from story 3-3)
- Path stored in `subtitles.webvtt_path` (TEXT column — already exists in schema, see `database.service.ts` line ~100)

### `subtitles` Table Schema (Existing — DO NOT MODIFY)

```sql
CREATE TABLE IF NOT EXISTS subtitles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  media_file_id INTEGER NOT NULL REFERENCES media_files(id) ON DELETE CASCADE,
  track_index INTEGER,          -- NULL for sidecar, absolute stream index for embedded
  type TEXT NOT NULL CHECK (type IN ('embedded', 'sidecar')),
  language TEXT,                -- e.g. 'eng', 'en', 'fra' — may be NULL
  codec TEXT,                   -- e.g. 'subrip', 'ass', 'srt' — may be NULL
  sidecar_path TEXT,            -- full fs path for sidecar, NULL for embedded
  webvtt_path TEXT,             -- NULL until conversion completed; set by this story
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**No `updated_at` column on subtitles table** — the schema does not have `updated_at`. Use `created_at` semantics only. The `processSubtitleConversion()` UPDATE statement in task 1.3 must NOT include `updated_at = datetime('now')` — that column does not exist and the query will fail.

### Crash Recovery Design

Unlike `transcode_jobs` (which has explicit `status = 'processing'`), the `subtitles` table has no status column. Crash recovery is implicit: if the service crashes mid-conversion, `webvtt_path` stays NULL and the row is re-queued on the next call to `executeSubtitleConversionQueue()`. No crash recovery SQL needed at the start of the queue method — the `WHERE webvtt_path IS NULL` query naturally handles restarts.

### Mutex Design

| Method | Mutex Flag | Query Filter | Crash Recovery |
|---|---|---|---|
| `executeAudioSidecarQueue()` | `this.transcoding` | `tier = 2 AND status = 'queued'` in transcode_jobs | Reset `processing` → `queued` at start |
| `executeVideoTranscodeQueue()` | `this.videoTranscoding` | `tier = 3 AND status = 'queued'` in transcode_jobs | Reset tier-3 `processing` → `queued` at start |
| `executeSubtitleConversionQueue()` | `this.converting` | `webvtt_path IS NULL` in subtitles | None needed (implicit via NULL check) |

### Service Structure Pattern (Follow Exactly)

`SubtitleService` follows the `TranscodeService` pattern:
- `execFileAsync = promisify(execFile)` — module-level, same as transcode service
- `private readonly logger = new Logger(SubtitleService.name)` — inside class
- `private converting = false` — mutex flag (analogous to `this.transcoding` and `this.videoTranscoding`)
- Constructor: `private readonly database: DatabaseService, private readonly config: ConfigService`
- `db = this.database.getDatabase()` — called per method (not stored in constructor)

### `ClassificationService` Changes

In `classification.service.ts`, `executeClassification()` try block currently ends with:
```typescript
      this.transcodeService.executeAudioSidecarQueue().catch((err: unknown) =>
        this.logger.error(
          `Transcode queue failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
      this.transcodeService.executeVideoTranscodeQueue().catch((err: unknown) =>
        this.logger.error(
          `Video transcode queue failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
```
Add immediately after:
```typescript
      this.subtitleService.executeSubtitleConversionQueue().catch((err: unknown) =>
        this.logger.error(
          `Subtitle conversion queue failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
```
`ClassificationService` constructor currently only injects `DatabaseService` and `TranscodeService`. Add `SubtitleService` as third constructor parameter.

### `SubtitleService` Methods — TypeScript Structures

```typescript
// apps/backend/src/library/subtitle.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { DatabaseService } from '../database/database.service';

const execFileAsync = promisify(execFile);

interface SubtitleRow {
  id: number;
  media_file_id: number;
  track_index: number | null;
  type: 'embedded' | 'sidecar';
  language: string | null;
  codec: string | null;
  sidecar_path: string | null;
  file_path: string;
}

@Injectable()
export class SubtitleService {
  private readonly logger = new Logger(SubtitleService.name);
  private converting = false;

  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  async executeSubtitleConversionQueue(): Promise<void> {
    if (this.converting) {
      this.logger.log('Subtitle conversion already in progress, skipping');
      return;
    }
    this.converting = true;
    try {
      const db = this.database.getDatabase();
      const subtitles = db
        .prepare(
          `SELECT s.id, s.media_file_id, s.track_index, s.type, s.language,
                  s.codec, s.sidecar_path, mf.path as file_path
           FROM subtitles s
           JOIN media_files mf ON mf.id = s.media_file_id
           WHERE s.webvtt_path IS NULL
           ORDER BY s.media_file_id ASC, s.id ASC`,
        )
        .all() as SubtitleRow[];

      this.logger.log(`Processing ${subtitles.length} subtitles pending WebVTT conversion`);

      for (const subtitle of subtitles) {
        try {
          await this.processSubtitleConversion(subtitle);
        } catch (err: unknown) {
          this.logger.error(
            `Subtitle conversion queue error for subtitle_id ${subtitle.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    } finally {
      this.converting = false;
    }
  }

  async processSubtitleConversion(subtitle: SubtitleRow): Promise<void> {
    const cachePath = this.config.get<string>('CACHE_PATH') || '/mnt/cache';
    const outputDir = path.join(cachePath, 'subtitles');
    const outputPath = path.join(outputDir, `${subtitle.id}.vtt`);

    const db = this.database.getDatabase();

    try {
      fs.mkdirSync(outputDir, { recursive: true });
      await this.runFfmpegSubtitleConvert(subtitle, outputPath);

      db.prepare(
        'UPDATE subtitles SET webvtt_path = ? WHERE id = ?',
      ).run(outputPath, subtitle.id);

      this.logger.log(
        `WebVTT conversion completed for subtitle_id ${subtitle.id} (${subtitle.type}, media_file_id=${subtitle.media_file_id}): ${outputPath}`,
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `WebVTT conversion failed for subtitle_id ${subtitle.id}: ${errorMessage}`,
      );
      throw err;  // rethrow so outer loop catches and continues to next subtitle
    }
  }

  private async runFfmpegSubtitleConvert(
    subtitle: SubtitleRow,
    outputPath: string,
  ): Promise<void> {
    if (subtitle.type === 'embedded') {
      await execFileAsync('ffmpeg', [
        '-v', 'warning',
        '-i', subtitle.file_path,          // video file
        '-map', `0:${subtitle.track_index}`, // select by absolute stream index
        '-c:s', 'webvtt',
        '-y',
        outputPath,
      ]);
    } else {
      // sidecar: input is the subtitle file itself
      await execFileAsync('ffmpeg', [
        '-v', 'warning',
        '-i', subtitle.sidecar_path!,       // sidecar subtitle file (.srt/.ass/.sub)
        '-c:s', 'webvtt',
        '-y',
        outputPath,
      ]);
    }
  }
}
```

### `library.module.ts` Change

```typescript
import { SubtitleService } from './subtitle.service';  // add this import

@Module({
  imports: [DatabaseModule],
  controllers: [LibraryController, TmdbController],
  providers: [
    ScannerService,
    ProbeService,
    LibraryService,
    FilenameParserService,
    TmdbService,
    MatchingService,
    WatcherService,
    ClassificationService,
    TranscodeService,
    SubtitleService,  // add
  ],
  exports: [
    ScannerService,
    ProbeService,
    LibraryService,
    FilenameParserService,
    TmdbService,
    MatchingService,
    WatcherService,
    ClassificationService,
    TranscodeService,
    SubtitleService,  // add
  ],
})
```

### `classification.service.spec.ts` Mock Change

```typescript
import { SubtitleService } from './subtitle.service';  // add import

// Inside providers array, add after TranscodeService mock:
{
  provide: SubtitleService,
  useValue: {
    executeSubtitleConversionQueue: jest.fn().mockResolvedValue(undefined),
  },
},
```
**Note**: The TranscodeService mock object is unchanged — do NOT touch it.

### Test Baseline

The backend suite currently has ~142 passing tests with 2 pre-existing failures in `classification.service.spec.ts` (hevc description mismatch — unrelated to this story). After this story, those same 2 failures persist; all other previously-passing tests must continue to pass; new subtitle.service.spec.ts tests are added.

### Key Anti-Patterns to Avoid

1. **DO NOT use the video file path as input for sidecar conversions** — sidecar input MUST be `subtitle.sidecar_path`. Using the video file for sidecar conversion would extract embedded streams, not the sidecar.
2. **DO NOT add `updated_at` to the subtitles UPDATE** — that column does not exist in the schema; the query will throw a runtime error.
3. **DO NOT set media_files.status to 'failed' on subtitle conversion failure** — subtitle failures are per-track, soft failures; they do not invalidate the media file.
4. **DO NOT add a status column to the subtitles table** — story 3-4 does not require it; implicit NULL-based retry is sufficient.
5. **DO NOT handle subtitle conversion as a transcode_jobs entry** — subtitles have their own table with `webvtt_path` for tracking completion; no transcode_jobs row is created.
6. **DO NOT use `execFile` with the video path for sidecar subtitles** even if `subtitle.file_path` is temptingly available in the row — always use `subtitle.sidecar_path!` for sidecar type.

### Learnings from Story 3-3

- `mkdirSync` must be inside the `try` block (not before it) so directory creation failures are caught and marked as failures, consistent with the post-review fix from story 3-2.
- Mutex boolean (`this.converting`) goes in `finally` block — never in the try block — to guarantee reset on any exit path.
- Use `ORDER BY ... ASC, id ASC` to ensure deterministic ordering in tests (story 3-3 review found non-determinism when SQLite timestamps have 1-second resolution).
- Error message for mutex: use exact string `'already in progress'` (tests check `expect.stringContaining('already in progress')`).
- rethrow from `processSubtitleConversion()` so the outer queue loop's `catch` can isolate the failure and continue to the next subtitle.
- `db.prepare().run(...)` synchronous — no `await` needed for SQLite operations.
- Outer queue loop's catch: log the error but do NOT rethrow — allows subsequent subtitles to process.

### Deferred Notes to Carry Forward

- Bitmap subtitle codecs (`dvd_subtitle`, `hdmv_pgs_subtitle`, `dvbsub`) fail silently (FFmpeg error logged, `webvtt_path` stays NULL). No workaround in scope.
- Subtitle conversion runs concurrently with Tier 2/3 transcodes. Story 3-5 owns the scheduler to enforce subtitle-after-transcode ordering.
- `processSubtitleConversion` is public (same pattern as processAudioSidecar and processVideoTranscode); callers can bypass mutex. Deferred to future refactor story.
- No FFmpeg timeout — a hung subtitle conversion permanently holds `this.converting = true`. Pre-existing pattern from other transcode methods.
