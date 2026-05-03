# Story 3.5: Unattended Queue Processing and Pipeline Status

Status: ready-for-dev

## Story

As an admin,
I want the transcode queue to process automatically in the background and expose its status via API,
So that I can drop files into a folder and walk away, checking progress whenever I want.

## Acceptance Criteria

```gherkin
Given files have been classified and transcode jobs are queued
When the background worker runs
Then jobs are processed sequentially (one at a time to avoid CPU saturation on modest hardware)
And Tier 1 files are marked "ready" immediately (no processing needed)
And Tier 2 and Tier 3 jobs are processed in FIFO order
And subtitle conversion jobs run after the file's primary transcode job completes
And pipeline status is available via GET /api/pipeline/status returning counts per status (queued, processing, completed, failed)
And individual job details are available via GET /api/pipeline/jobs
And the pipeline does not block or degrade playback of already-processed titles (NFR17)
And the pipeline recovers from crashes — incomplete jobs are reset to "queued" on restart
```

## Tasks / Subtasks

- [ ] 1. Fix Tier 1 "mark ready immediately" in `apps/backend/src/library/classification.service.ts` (AC: Tier 1 files are marked ready)
  - [ ] 1.1 In `classifyFile()`, change the transaction so that Tier 1 files get `status = 'ready'` instead of `'classified'`:
    ```typescript
    const classifyTx = db.transaction(() => {
      if (tier === 1) {
        db.prepare(
          "UPDATE media_files SET tier = 1, status = 'ready', updated_at = datetime('now') WHERE id = ?",
        ).run(file.id);
      } else {
        db.prepare(
          "UPDATE media_files SET tier = ?, status = 'classified', updated_at = datetime('now') WHERE id = ?",
        ).run(tier, file.id);
        db.prepare(
          "INSERT OR IGNORE INTO transcode_jobs (file_id, tier, status) VALUES (?, ?, 'queued')",
        ).run(file.id, tier);
      }
    });
    ```
  - [ ] 1.2 Log message for Tier 1 ready: `Classified ${file.filename} → Tier 1 (ready, no transcode needed)` (to distinguish from Tier 2/3 log)

- [ ] 2. Change queue execution to sequential in `apps/backend/src/library/classification.service.ts` (AC: sequential processing, subtitle after transcode)
  - [ ] 2.1 Replace the fire-and-forget `.catch()` pattern with sequential `await`:
    ```typescript
    // BEFORE (fire-and-forget, concurrent):
    this.transcodeService.executeAudioSidecarQueue().catch((err: unknown) => ...);
    this.transcodeService.executeVideoTranscodeQueue().catch((err: unknown) => ...);
    this.subtitleService.executeSubtitleConversionQueue().catch((err: unknown) => ...);

    // AFTER (sequential, subtitles run after both transcode queues complete):
    await this.transcodeService.executeAudioSidecarQueue();
    await this.transcodeService.executeVideoTranscodeQueue();
    await this.subtitleService.executeSubtitleConversionQueue();
    ```
  - [ ] 2.2 These three `await` calls go inside the existing `try` block AFTER the classification loop — `finally { this.classifying = false; }` already handles cleanup on any thrown error, so no change to error boundary is needed
  - [ ] 2.3 Do NOT add individual `.catch()` wrappers — errors from queue processing are already isolated per-job inside each service; the only way these throw is a systemic DB failure, which should be logged by the outer `.catch()` in `library.service.ts`

- [ ] 3. Create `apps/backend/src/library/pipeline.service.ts` (AC: status endpoint, jobs endpoint)
  - [ ] 3.1 Define class `PipelineService` with `@Injectable()`, `Logger`, constructor injecting `DatabaseService`
  - [ ] 3.2 Implement `getStatus(): PipelineStatus`:
    ```typescript
    interface PipelineStatus {
      queued: number;
      processing: number;
      completed: number;
      failed: number;
      tier1Ready: number;
    }
    ```
    - Query `transcode_jobs` status counts:
      ```sql
      SELECT status, COUNT(*) as count FROM transcode_jobs GROUP BY status
      ```
    - Query Tier 1 ready count:
      ```sql
      SELECT COUNT(*) as count FROM media_files WHERE tier = 1 AND status = 'ready'
      ```
    - Assemble result with defaults of 0 for any status not present in query result
    - Return `{ queued, processing, completed, failed, tier1Ready }`
  - [ ] 3.3 Implement `getJobs(): PipelineJob[]`:
    ```typescript
    interface PipelineJob {
      id: number;
      file_id: number;
      filename: string;
      tier: number;
      status: string;
      output_path: string | null;
      error_details: string | null;
      created_at: string;
      updated_at: string;
    }
    ```
    - Query `transcode_jobs` joined with `media_files` for filename:
      ```sql
      SELECT tj.id, tj.file_id, mf.filename, tj.tier, tj.status,
             tj.output_path, tj.error_details, tj.created_at, tj.updated_at
      FROM transcode_jobs tj
      JOIN media_files mf ON mf.id = tj.file_id
      ORDER BY tj.created_at ASC, tj.id ASC
      ```
    - Return array of job rows (may be empty)
  - [ ] 3.4 Add required imports: `Injectable`, `Logger` from `@nestjs/common`; `DatabaseService` from `../database/database.service`

- [ ] 4. Create `apps/backend/src/library/pipeline.controller.ts` (AC: GET /api/pipeline/status, GET /api/pipeline/jobs)
  - [ ] 4.1 Define `@Controller('pipeline')` class `PipelineController` with constructor injecting `PipelineService`
  - [ ] 4.2 Add `@Get('status')` handler `getStatus()` → calls and returns `this.pipelineService.getStatus()`
  - [ ] 4.3 Add `@Get('jobs')` handler `getJobs()` → calls and returns `this.pipelineService.getJobs()`
  - [ ] 4.4 No error handling needed — queries are read-only against SQLite, failures are truly exceptional and should propagate as 500
  - [ ] 4.5 No input validation needed — these are read-only GET endpoints with no query parameters or request bodies

- [ ] 5. Register in `apps/backend/src/library/library.module.ts`
  - [ ] 5.1 Add `import { PipelineService } from './pipeline.service';`
  - [ ] 5.2 Add `import { PipelineController } from './pipeline.controller';`
  - [ ] 5.3 Add `PipelineService` to `providers` array
  - [ ] 5.4 Add `PipelineController` to `controllers` array (no export needed — controller is consumed by NestJS routing, not injected elsewhere)
  - [ ] 5.5 Add `PipelineService` to `exports` array (makes it injectable in other modules if needed in future)

- [ ] 6. Update `apps/backend/src/library/classification.service.spec.ts` (AC: Tier 1 → 'ready')
  - [ ] 6.1 Test 4.2 (Tier 1 — web-compatible video + audio): change `expect(file.status).toBe("classified")` → `expect(file.status).toBe("ready")`
  - [ ] 6.2 Test 4.6 (Tier 1 — no audio tracks): change `expect(file.status).toBe("classified")` → `expect(file.status).toBe("ready")`
  - [ ] 6.3 Test 4.10 (error isolation): `file1` and `file3` are Tier 1 — change both `expect(f1.status).toBe("classified")` and `expect(f3.status).toBe("classified")` → `"ready"`
  - [ ] 6.4 Test 4.11 (integration): `tier1Id` file — change `expect(f1.status).toBe("classified")` → `expect(f1.status).toBe("ready")`
  - [ ] 6.5 Test codec case-insensitivity (Tier 1): change `expect(file.status).toBe("classified")` → `expect(file.status).toBe("ready")`
  - [ ] 6.6 Do NOT change tests for Tier 2 or Tier 3 files — they still get `status = 'classified'` (set to 'ready' later by TranscodeService on completion)

- [ ] 7. Create `apps/backend/src/library/pipeline.service.spec.ts` (AC: status and jobs)
  - [ ] 7.1 Set up test module using actual `DatabaseService` with `CACHE_PATH = ':memory:'` (same pattern as `transcode.service.spec.ts` and `subtitle.service.spec.ts`)
  - [ ] 7.2 Define helpers: `insertSource()`, `insertMediaFile(sourceId, filename, status?, tier?)`, `insertTranscodeJob(fileId, tier, status)`
  - [ ] 7.3 Test `getStatus()` — empty DB: returns `{ queued: 0, processing: 0, completed: 0, failed: 0, tier1Ready: 0 }`
  - [ ] 7.4 Test `getStatus()` — mixed statuses: insert jobs with varied statuses, verify correct counts per status
  - [ ] 7.5 Test `getStatus()` — `tier1Ready` count: insert Tier 1 files with `status='ready'`, verify `tier1Ready` count; Tier 1 files with other statuses (e.g. 'classified' — edge case) should NOT count
  - [ ] 7.6 Test `getJobs()` — empty DB: returns `[]`
  - [ ] 7.7 Test `getJobs()` — jobs with files: verify returned objects contain expected fields (`id`, `file_id`, `filename`, `tier`, `status`, `output_path`, `error_details`, `created_at`, `updated_at`)
  - [ ] 7.8 Test `getJobs()` — ordering: multiple jobs returned in `created_at ASC, id ASC` order

- [ ] 8. Create `apps/backend/src/library/pipeline.controller.spec.ts`
  - [ ] 8.1 Set up test module using mock `PipelineService` (follow `tmdb.controller.spec.ts` pattern)
  - [ ] 8.2 Test `GET /api/pipeline/status`: mock `getStatus()` returns a known object; verify controller returns it
  - [ ] 8.3 Test `GET /api/pipeline/jobs`: mock `getJobs()` returns a known array; verify controller returns it

- [ ] 9. Run full backend test suite to verify no regressions
  - [ ] 9.1 Target: all existing passing tests still pass with the Tier 1 spec updates applied; the 2 pre-existing failures in `classification.service.spec.ts` (HEVC description mismatch, pre-existing) remain but no new failures are introduced
  - [ ] 9.2 Verify: `npm test -w apps/backend` passes

## Dev Notes

### Pipeline Flow After This Story

```
discovered → [ProbeService] → probed → [MatchingService] → matched → [ClassificationService] → classified
  → Tier 1: status = 'ready' immediately (no transcode job created)
  → await [TranscodeService.executeAudioSidecarQueue()]    (Tier 2) → status='ready' on complete
  → await [TranscodeService.executeVideoTranscodeQueue()]  (Tier 3) → status='ready' on complete
  → await [SubtitleService.executeSubtitleConversionQueue()] → webvtt_path set after transcodes complete
```

All three queue calls are now **sequential** (not concurrent/fire-and-forget). Subtitle conversion starts only after both transcode queues have fully drained. This satisfies the AC "subtitle conversion jobs run after the file's primary transcode job completes".

The `this.classifying` mutex in `ClassificationService` remains `true` for the entire duration including all three queue runs. This is intentional — it prevents double-invocation of the pipeline (WatcherService or scan trigger is dropped if pipeline already running). Files newly scanned during a long transcode run will be picked up on the next pipeline trigger after the current run completes.

### Why Sequential (not Concurrent)?

- AC explicitly states "one at a time to avoid CPU saturation on modest hardware"
- Subtitle conversion produces incorrect output if video transcode is still writing the `.mp4` file it needs to read embedded tracks from
- The existing per-queue mutex flags (`transcoding`, `videoTranscoding`, `converting`) only prevent the SAME queue from running twice — they do not prevent all three from running simultaneously
- Sequential `await` is simpler and more predictable than coordinating concurrent queues

### Key Code Changes: `ClassificationService`

**Tier 1 change in `classifyFile()`** — BEFORE:
```typescript
const classifyTx = db.transaction(() => {
  db.prepare(
    "UPDATE media_files SET tier = ?, status = 'classified', updated_at = datetime('now') WHERE id = ?",
  ).run(tier, file.id);

  if (tier === 2 || tier === 3) {
    db.prepare(
      "INSERT OR IGNORE INTO transcode_jobs (file_id, tier, status) VALUES (?, ?, 'queued')",
    ).run(file.id, tier);
  }
});
```

**AFTER** (Tier 1 goes directly to 'ready'):
```typescript
const classifyTx = db.transaction(() => {
  if (tier === 1) {
    db.prepare(
      "UPDATE media_files SET tier = 1, status = 'ready', updated_at = datetime('now') WHERE id = ?",
    ).run(file.id);
  } else {
    db.prepare(
      "UPDATE media_files SET tier = ?, status = 'classified', updated_at = datetime('now') WHERE id = ?",
    ).run(tier, file.id);
    db.prepare(
      "INSERT OR IGNORE INTO transcode_jobs (file_id, tier, status) VALUES (?, ?, 'queued')",
    ).run(file.id, tier);
  }
});
```

**Sequential queue calls in `executeClassification()`** — BEFORE:
```typescript
this.transcodeService.executeAudioSidecarQueue().catch((err: unknown) =>
  this.logger.error(`Transcode queue failed: ${err instanceof Error ? err.message : String(err)}`),
);
this.transcodeService.executeVideoTranscodeQueue().catch((err: unknown) =>
  this.logger.error(`Video transcode queue failed: ${err instanceof Error ? err.message : String(err)}`),
);
this.subtitleService.executeSubtitleConversionQueue().catch((err: unknown) =>
  this.logger.error(`Subtitle conversion queue failed: ${err instanceof Error ? err.message : String(err)}`),
);
```

**AFTER** (sequential, inside `try` block):
```typescript
await this.transcodeService.executeAudioSidecarQueue();
await this.transcodeService.executeVideoTranscodeQueue();
await this.subtitleService.executeSubtitleConversionQueue();
```

### Spec Test File Changes: `classification.service.spec.ts`

The following tests currently expect Tier 1 files to have `status = 'classified'` — all must be updated to `status = 'ready'`:

| Test | Location | Current value | Required value |
|------|----------|---------------|----------------|
| Tier 1: web-compat video + audio | ~line 113 | `"classified"` | `"ready"` |
| Tier 1: no audio tracks | ~line 240 | `"classified"` | `"ready"` |
| Error isolation (file1 = Tier 1) | ~line 337 | `"classified"` | `"ready"` |
| Error isolation (file3 = Tier 1) | ~line 341 | `"classified"` | `"ready"` |
| Integration test (tier1 file) | ~line 394 | `"classified"` | `"ready"` |
| Codec case-insensitivity | ~line 456 | `"classified"` | `"ready"` |

Do NOT update any Tier 2/3 assertions — they are correct.

### Crash Recovery Design (Existing — Not Changed)

`TranscodeService` already implements crash recovery at the start of each queue:
- `executeAudioSidecarQueue()`: Resets all `status = 'processing'` transcode_jobs to `'queued'`
- `executeVideoTranscodeQueue()`: Resets tier-3 `status = 'processing'` rows to `'queued'`

These are called at the start of each queue run, every time `executeClassification()` fires — including after application restart. No changes needed to crash recovery logic for this story.

Known deferred issue: `executeAudioSidecarQueue()` crash recovery resets ALL processing rows (not just tier 2), which incorrectly includes any tier 3 rows. This is pre-existing, documented in `deferred-work.md`, and NOT in scope for this story.

### `transcode_jobs` Schema (Existing — DO NOT MODIFY)

```sql
CREATE TABLE IF NOT EXISTS transcode_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id INTEGER NOT NULL REFERENCES media_files(id) ON DELETE CASCADE,
  tier INTEGER NOT NULL CHECK (tier IN (1,2,3)),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','completed','failed')),
  error_details TEXT,
  output_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(file_id)
);
```

**Pipeline status counts from this table:**
- `queued`: COUNT WHERE `status = 'queued'`
- `processing`: COUNT WHERE `status = 'processing'`
- `completed`: COUNT WHERE `status = 'completed'`
- `failed`: COUNT WHERE `status = 'failed'`
- `tier1Ready`: COUNT FROM `media_files` WHERE `tier = 1 AND status = 'ready'` (Tier 1 files never get a transcode_jobs row)

### `media_files` Status Flow (Complete Reference)

```
discovered → probed → matched → classified (Tier 2/3) OR ready (Tier 1)
                                                               ↑ (new in this story)
classified → [TranscodeService] → ready
missing (file disappeared from filesystem)
probe_failed (ffprobe error)
```

**After this story:** Tier 1 files skip `classified` entirely and go directly to `ready`.

### Existing Services — Do NOT Modify

The following services are used but not changed by this story:
- `TranscodeService` — unchanged; `executeAudioSidecarQueue()` and `executeVideoTranscodeQueue()` already work correctly
- `SubtitleService` — unchanged; `executeSubtitleConversionQueue()` already works correctly
- `LibraryService` — unchanged; still calls `classificationService.executeClassification().catch(...)` fire-and-forget (the fire-and-forget is at the LibraryService→ClassificationService boundary, not the ClassificationService→queues boundary)
- `WatcherService` — unchanged
- `DatabaseService` — schema not modified

### NestJS Module Registration Pattern

Follow the exact pattern established in `library.module.ts`. The `PipelineController` goes into `controllers: []`, not `providers: []`. Controllers are not exported. Services go into both `providers: []` and `exports: []`.

The `AppModule` does not need changes — `LibraryModule` is already imported and its controllers are auto-registered.

### API Endpoint Routing

Global prefix `api` is set in `main.ts` via `app.setGlobalPrefix("api")`.

`@Controller('pipeline')` → `/api/pipeline`
- `@Get('status')` → `GET /api/pipeline/status`
- `@Get('jobs')` → `GET /api/pipeline/jobs`

### Test Module Pattern for PipelineService Spec

Follow `transcode.service.spec.ts` pattern exactly:
```typescript
// Use :memory: CACHE_PATH so DB is ephemeral and isolated per test
{
  provide: ConfigService,
  useValue: {
    get: (key: string) => {
      if (key === 'CACHE_PATH') return ':memory:';
      return undefined;
    },
  },
}
```
Call `dbService.onModuleInit()` in `beforeEach` to run migrations. Call `dbService.onModuleDestroy()` in `afterEach`.

### Test Module Pattern for PipelineController Spec

Follow `tmdb.controller.spec.ts` pattern — mock `PipelineService` with `useValue`:
```typescript
const module: TestingModule = await Test.createTestingModule({
  controllers: [PipelineController],
  providers: [
    {
      provide: PipelineService,
      useValue: {
        getStatus: jest.fn(),
        getJobs: jest.fn(),
      },
    },
  ],
}).compile();
```

### Previous Story Learnings (from Story 3-4)

- The `subtitles` table has NO `updated_at` column — only `created_at`. Do not attempt to SET `updated_at` on that table.
- Review findings from 3-4 introduced two runtime safety guards: `track_index === null` check for embedded subtitles, and `!subtitle.sidecar_path` check for sidecar subtitles — both are already in `subtitle.service.ts`. No changes needed.
- Pattern for new services: `execFileAsync = promisify(execFile)` at module level, `private readonly logger = new Logger(ClassName.name)` inside class.
- `PipelineService` does NOT use `execFile` — it only queries the DB. Simpler than prior services.

### Previous Story Learnings (from Story 3-3)

- `mkdirSync` with `{ recursive: true }` inside the `try` block — consistent pattern across all services.
- `output_path` column was added to `transcode_jobs` in story 3-2/3-3; it exists in the schema in `database.service.ts`.

### Pre-Existing Failures (Do NOT Fix)

The test suite has 2 pre-existing failures in `classification.service.spec.ts`:
- HEVC codec description mismatch — test expects one string, code produces another
These are documented and deferred. They are NOT introduced by this story and must NOT be fixed as part of this implementation.

### Project Structure Notes

- New files: `pipeline.service.ts`, `pipeline.controller.ts`, `pipeline.service.spec.ts`, `pipeline.controller.spec.ts` — all go in `apps/backend/src/library/` (same module as all other services/controllers)
- No new NestJS modules needed — `PipelineController` and `PipelineService` register in the existing `LibraryModule`
- No `@nestjs/schedule` package needed — the "background" processing is already handled by the fire-and-forget→sequential refactor in `ClassificationService`. No separate cron job or interval timer is required. The pipeline runs as part of the existing scan→probe→match→classify chain already triggered by `LibraryModule.onModuleInit()` and `WatcherService`.
- No frontend changes in this story — pipeline status is backend-only (consumed by admin panel in Epic 7)

### References

- Story requirements: [_bmad-output/planning-artifacts/epics.md](_bmad-output/planning-artifacts/epics.md) — Epic 3, Story 3.5
- ClassificationService: [apps/backend/src/library/classification.service.ts](apps/backend/src/library/classification.service.ts)
- TranscodeService: [apps/backend/src/library/transcode.service.ts](apps/backend/src/library/transcode.service.ts)
- SubtitleService: [apps/backend/src/library/subtitle.service.ts](apps/backend/src/library/subtitle.service.ts)
- LibraryModule: [apps/backend/src/library/library.module.ts](apps/backend/src/library/library.module.ts)
- Classification spec: [apps/backend/src/library/classification.service.spec.ts](apps/backend/src/library/classification.service.spec.ts)
- TmdbController (pattern reference): [apps/backend/src/library/tmdb.controller.ts](apps/backend/src/library/tmdb.controller.ts)
- TmdbController spec (pattern reference): [apps/backend/src/library/tmdb.controller.spec.ts](apps/backend/src/library/tmdb.controller.spec.ts)
- Database schema: [apps/backend/src/database/database.service.ts](apps/backend/src/database/database.service.ts)
- Deferred work log: [_bmad-output/implementation-artifacts/deferred-work.md](_bmad-output/implementation-artifacts/deferred-work.md)
- Story 3-4 (previous): [_bmad-output/implementation-artifacts/3-4-subtitle-extraction-and-webvtt-conversion.md](_bmad-output/implementation-artifacts/3-4-subtitle-extraction-and-webvtt-conversion.md)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.6

### Debug Log References

### Completion Notes List

### File List
