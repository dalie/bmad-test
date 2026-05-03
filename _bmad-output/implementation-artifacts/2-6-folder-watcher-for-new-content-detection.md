# Story 2.6: Folder Watcher for New Content Detection

Status: done

## Story

As an admin,
I want the system to automatically detect when new files are added to my media folders,
so that new content appears in the library without manual intervention.

## Acceptance Criteria

```gherkin
Given the application is running and media source folders are configured
When new video files are added to a monitored folder
Then the folder watcher detects the new files (via filesystem events or polling)
And new files are automatically queued for probing and matching
And the watcher handles partially written files by waiting for file stability before processing (NFR16)
And the watcher does not interfere with ongoing playback of existing titles (NFR17)
And watcher errors (permissions, disconnected volumes) are logged without crashing the application
```

## Tasks / Subtasks

- [x] 1. Create `WatcherService` (AC: 1, 5)
  - [x] 1.1 Create `apps/backend/src/library/watcher.service.ts` — `@Injectable()` with `OnModuleInit` and `OnModuleDestroy` lifecycle hooks
  - [x] 1.2 Inject `DatabaseService` to query media sources (for source IDs), and `LibraryService` for pipeline triggering
  - [x] 1.3 On `onModuleInit()`: query `media_sources` table for all source paths and IDs, start a recursive `fs.watch()` on each source path with `{ recursive: true }` option
  - [x] 1.4 On `onModuleDestroy()`: call `.close()` on all `fs.FSWatcher` instances
  - [x] 1.5 On `fs.watch` `rename` event (which fires for new files on Linux): validate the filename has a video extension, then `fs.stat()` the full path to confirm it exists (rename fires for both creates and deletes), then queue for stability check
  - [x] 1.6 Handle watcher errors: wrap `fs.watch()` in try-catch for initial setup failures (missing dir, permissions), and listen for `error` event on the watcher instance — log without crashing
- [x] 2. Implement file stability check for watched files (AC: 3)
  - [x] 2.1 After detecting a new video file, wait for stability using the same pattern as `ScannerService.checkFileStability()` — stat the file, wait 2 seconds, stat again, compare size/mtime
  - [x] 2.2 If the file is unstable (still being written), re-queue for another stability check after 2 seconds (retry up to 30 times = 60s max wait)
  - [x] 2.3 If stability check fails after max retries, log a warning and skip the file
- [x] 3. Process detected files through existing pipeline (AC: 2, 3)
  - [x] 3.1 Once a file passes stability check: call existing `LibraryService.syncFiles()` to register it, then trigger `executeProbing()` followed by `executeMatching()` — reuse the exact same pipeline as startup scan
  - [x] 3.2 Debounce/batch: accumulate stable files for 3 seconds before calling `syncFiles()` once with the batch (prevents excessive DB writes when many files arrive simultaneously, e.g., a torrent dropping a full season)
  - [x] 3.3 For each detected file, resolve its `source_id` from the media source whose path is a prefix of the file path
- [x] 4. Register WatcherService in LibraryModule (AC: all)
  - [x] 4.1 Add `WatcherService` to `providers` array in `library.module.ts`
  - [x] 4.2 No additional module imports needed — `WatcherService` queries `media_sources` directly via `DatabaseService` (already available in `LibraryModule`)
- [x] 5. Add watcher status API (AC: 5)
  - [x] 5.1 Add `GET /api/library/watcher/status` endpoint to `LibraryController` — returns `{ watching: boolean, paths: string[], errors: string[] }`
  - [x] 5.2 Expose a `getStatus()` method on `WatcherService` that returns current state
- [x] 6. Unit tests (AC: all)
  - [x] 6.1 Test `WatcherService` creation and lifecycle: mock `fs.watch`, verify called with correct paths on init, verify `.close()` called on destroy
  - [x] 6.2 Test file detection: simulate `fs.watch` callback with `rename` event and a video filename, verify stability check runs and `syncFiles()` is called
  - [x] 6.3 Test stability check: mock `fs.promises.stat` to return same size/mtime on both calls, verify file proceeds to pipeline
  - [x] 6.4 Test unstable file: mock `fs.promises.stat` to return different sizes, verify retry behavior
  - [x] 6.5 Test error resilience: simulate watcher `error` event, verify logged but not thrown
  - [x] 6.6 Test filtering: simulate event for non-video file (.txt, .nfo), verify no pipeline call
  - [x] 6.7 Test debouncing: simulate multiple rapid events, verify `syncFiles()` is called once with all files
  - [x] 6.8 Test `GET /api/library/watcher/status` returns correct structure
  - [x] 6.9 Use `jest.mock('fs')` for watcher and `jest.useFakeTimers()` for stability/debounce — do NOT use real filesystem watchers in tests

## Dev Notes

### Technical Implementation: Watcher Service

**Using native `fs.watch` (zero dependencies):**

- Docker deployment is always Linux → inotify is the only platform that matters
- `fs.watch` with `{ recursive: true }` uses inotify on Linux and works reliably for recursive directory watching (Node 20+)
- No external dependencies needed — lighter image, fewer supply-chain risks
- Trade-off: no built-in `awaitWriteFinish` — must implement stability check manually (pattern already exists in `ScannerService.checkFileStability()`)

**Key `fs.watch` behavior on Linux:**

- Event types: `'rename'` fires when a file is created OR deleted; `'change'` fires when file content changes
- For new file detection: listen for `'rename'` events, then `fs.stat()` to confirm the file exists (distinguishes create from delete)
- The callback receives `(eventType, filename)` where `filename` is relative to the watched directory
- Recursive mode: the watcher sees events in all subdirectories, `filename` includes the relative subdirectory path

**Integration pattern with existing pipeline:**

```typescript
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import { DatabaseService } from "../database/database.service";
import { LibraryService } from "./library.service";

@Injectable()
export class WatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WatcherService.name);
  private watchers: fs.FSWatcher[] = [];
  private errors: string[] = [];
  private watching = false;
  private pendingFiles: Map<
    number,
    { path: string; filename: string; stats: fs.Stats }[]
  > = new Map();
  private debounceTimers: Map<number, NodeJS.Timeout> = new Map();
  private stabilityChecks: Map<string, number> = new Map(); // filePath → retry count

  private readonly videoExtensions = new Set([
    ".mkv",
    ".mp4",
    ".avi",
    ".webm",
    ".mov",
    ".wmv",
    ".flv",
  ]);
  private readonly DEBOUNCE_MS = 3000;
  private readonly STABILITY_INTERVAL_MS = 2000;
  private readonly MAX_STABILITY_RETRIES = 30;

  private sources: { id: number; path: string; type: string }[] = [];

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly libraryService: LibraryService,
  ) {}

  onModuleInit() {
    this.startWatching();
  }

  onModuleDestroy() {
    this.stopWatching();
  }

  // ... implementation
}
```

**Critical: Stability check for partially written files (NFR16):**

`fs.watch` fires immediately when a file appears — even if it's mid-copy. Implement the same 2-second stability check as the scanner:

```typescript
private async checkStabilityAndQueue(filePath: string) {
  const retries = this.stabilityChecks.get(filePath) || 0;

  try {
    const stat1 = await fs.promises.stat(filePath);
    await new Promise(resolve => setTimeout(resolve, this.STABILITY_INTERVAL_MS));
    const stat2 = await fs.promises.stat(filePath);

    if (stat1.size === stat2.size && stat1.mtimeMs === stat2.mtimeMs) {
      // File is stable — queue for processing
      this.stabilityChecks.delete(filePath);
      this.queueStableFile(filePath, stat2);
    } else if (retries < this.MAX_STABILITY_RETRIES) {
      // Still being written — retry
      this.stabilityChecks.set(filePath, retries + 1);
      this.checkStabilityAndQueue(filePath);
    } else {
      this.stabilityChecks.delete(filePath);
      this.logger.warn(`File never stabilized after ${this.MAX_STABILITY_RETRIES} retries: ${filePath}`);
    }
  } catch (err: any) {
    this.stabilityChecks.delete(filePath);
    this.logger.error(`Stability check failed for ${filePath}: ${err.message}`);
  }
}
```

**Critical: Debounce pattern for batch processing:**

When many files arrive in rapid succession (e.g., a torrent drops 10 episodes), collect them per source and flush after `DEBOUNCE_MS` idle:

```typescript
private queueStableFile(filePath: string, stats: fs.Stats) {
  const sourceId = this.resolveSourceId(filePath);
  if (!sourceId) {
    this.logger.warn(`No matching source for watched file: ${filePath}`);
    return;
  }

  const pending = this.pendingFiles.get(sourceId) || [];
  pending.push({ path: filePath, filename: path.basename(filePath), stats });
  this.pendingFiles.set(sourceId, pending);

  // Reset debounce timer for this source
  const existing = this.debounceTimers.get(sourceId);
  if (existing) clearTimeout(existing);

  this.debounceTimers.set(sourceId, setTimeout(() => {
    this.flushPending(sourceId);
  }, this.DEBOUNCE_MS));
}

private flushPending(sourceId: number) {
  const files = this.pendingFiles.get(sourceId);
  if (!files || files.length === 0) return;

  this.pendingFiles.delete(sourceId);
  this.debounceTimers.delete(sourceId);

  this.libraryService.syncFiles(sourceId, files);
  this.libraryService.executeProbing().catch(err =>
    this.logger.error(`Probing after watch event failed: ${err.message}`)
  );
}
```

**Resolving source_id from file path:**

```typescript
private sources: { id: number; path: string; type: string }[] = [];

private loadSources() {
  const db = this.databaseService.getDatabase();
  this.sources = db.prepare('SELECT id, path, type FROM media_sources').all() as any[];
}

private resolveSourceId(filePath: string): number | null {
  for (const source of this.sources) {
    if (filePath.startsWith(source.path)) return source.id;
  }
  return null;
}
```

### Architecture Compliance

1. **NFR16 (Partially written files):** Handled via manual stability check (stat → wait 2s → re-stat) — same pattern as `ScannerService.checkFileStability()`. Retries up to 30 times (60s max) for large files being copied.
2. **NFR17 (Non-blocking playback):** The watcher only inserts new file rows and triggers the async pipeline. No playback paths are affected. The existing `executeProbing()` / `executeMatching()` are non-blocking async operations with mutex guards.
3. **NFR9 (Read-only source files):** `fs.watch` only monitors filesystem events via inotify — never modifies source files. All writes go to the SQLite DB and managed cache.
4. **NFR13 (Error isolation):** Watcher `error` event is caught and logged. Individual file failures in the pipeline are already isolated by `probeAndStore()` and `matchFile()` try-catch blocks.
5. **Import/serve separation:** The watcher feeds into the import pipeline (scan → probe → match) which is strictly separated from the playback path (static file serving).

### File Structure

```
apps/backend/src/library/
├── watcher.service.ts              # NEW: Folder watcher using native fs.watch
├── watcher.service.spec.ts         # NEW: Unit tests for watcher
├── library.controller.ts           # UPDATE: add watcher status endpoint
├── library.controller.spec.ts      # UPDATE: test watcher status endpoint
├── library.module.ts               # UPDATE: register WatcherService, ensure ConfigModule imported
```

### Dependencies on Previous Stories

- **2-1 (Database + Config):** Provides `ConfigService.getSources()` to discover media source paths, DB schema for `media_files` and `media_sources`
- **2-2 (Scanner):** Provides `ScannerService.checkFileStability()` pattern (reuse for watch events), `syncFiles()` for registering discovered files, video extensions list
- **2-3 (Probe):** Provides `executeProbing()` pipeline step
- **2-4c (Matching):** Provides `executeMatching()` pipeline step

### Existing Code to Reuse (DO NOT REINVENT)

- `LibraryService.syncFiles(sourceId, files)` — register new files in DB with status `'discovered'`. Accepts `ScannedFile[]` with `{ path, filename, stats }` shape.
- `LibraryService.executeProbing()` — processes all `discovered` files through ffprobe. Has built-in mutex (`this.probing` flag) so safe to call concurrently.
- `LibraryService.executeMatching()` — processes all `probed` files through TMDB matching. Has built-in mutex with queue (`this.matching` / `this.matchingQueued`) so safe to call concurrently.
- `ScannerService.videoExtensions` — the canonical set of supported video extensions. **Note:** This is currently a private field. Either make it accessible (public/exported constant) or duplicate the set in the watcher (acceptable since it's a small static list).
- `ConfigService.getSources()` — returns `MediaSource[]` with `{ path, type }`. **Note:** Does NOT return `id`. You'll need to query `media_sources` directly to get the DB row ID for `syncFiles()`.

### Library/Framework Requirements

- **No new npm dependencies required** — uses only Node.js built-in `fs.watch`
- `fs.watch(path, { recursive: true })` — available since Node 20, uses Linux inotify under the hood
- Key API: `fs.watch(dir, options, callback)` returns `fs.FSWatcher`
  - Callback signature: `(eventType: 'rename' | 'change', filename: string | null)`
  - `'rename'` fires for file creation AND deletion — must `fs.stat()` to disambiguate
  - `filename` is relative to the watched directory (includes subdirectory path)
  - Cleanup: `watcher.close()` (synchronous, no Promise)
- `fs.promises.stat()` — for stability checks and existence confirmation

### Testing Requirements

- **Mock `fs.watch` and `fs.promises.stat`** — use `jest.mock('fs')` to avoid real filesystem operations
- Create a mock `FSWatcher` with `.close()` method and capture the watch callback to simulate events
- Simulate events by calling the captured callback directly with `('rename', 'movie.mkv')`
- Mock `DatabaseService.getDatabase()` to return source rows
- Mock `LibraryService.syncFiles()` and `executeProbing()` to verify they're called
- Use `jest.useFakeTimers()` to test stability check and debounce behavior without real delays
- Follow existing test patterns from `scanner.service.spec.ts` and `library.service.spec.ts`

### Previous Story Intelligence (from 2-5)

**Key learnings:**

- better-sqlite3 uses **synchronous API** — DB reads for source lookup are blocking (fast, no async needed)
- NestJS lifecycle hooks (`OnModuleInit`, `OnModuleDestroy`) are the correct pattern for service setup/teardown
- `LibraryModule.onModuleInit()` already triggers startup scan — the watcher is complementary (detects changes AFTER initial scan)
- Error handling pattern: log and continue, never crash the process
- The existing pipeline already has mutex/queue guards on `executeProbing()` and `executeMatching()` — safe to trigger from watcher without race conditions
- `ConfigModule` from `../config/config.module` provides `ConfigService` — ensure it's imported or accessible in `LibraryModule`

**Code patterns established:**

- Services are `@Injectable()` providers in `LibraryModule`
- Module registration in `providers` array of `@Module` decorator
- All timestamps use `datetime('now')` SQLite function
- Error isolation: try-catch per file, log errors, continue processing
- Lifecycle: `OnModuleInit` for startup logic, `OnModuleDestroy` for cleanup

### ConfigModule Not Required

`WatcherService` does NOT need `ConfigService`. It queries `media_sources` directly via `DatabaseService.getDatabase()` (already imported in `LibraryModule` via `DatabaseModule`). This avoids a circular import concern and keeps the watcher self-contained.

### Critical: Source ID Resolution

`ConfigService.getSources()` returns `{ path, type }` without the database `id`. But `LibraryService.syncFiles()` requires `sourceId: number`. The watcher needs to map file paths to source IDs.

**Solution:** Query `media_sources` table directly in the watcher's `onModuleInit()` to get `{ id, path, type }` rows and cache them. The source list is static during runtime (configured via env vars, seeded once on startup).

### IMPORTANT: Implement Stability Check Inline

Do NOT call `ScannerService.checkFileStability()` directly — it's a private method. Instead, implement the same pattern inline in `WatcherService`: stat → wait 2s → re-stat → compare size/mtime. This is a simple ~10 line helper, not worth making the scanner method public for.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 2.6 acceptance criteria]
- [Source: _bmad-output/planning-artifacts/architecture.md — Technical Constraints: filesystem watchers]
- [Source: _bmad-output/planning-artifacts/architecture.md — Import/serve separation cross-cutting concern]
- [Source: apps/backend/src/library/scanner.service.ts — videoExtensions, checkFileStability pattern]
- [Source: apps/backend/src/library/library.service.ts — syncFiles(), executeProbing(), executeMatching()]
- [Source: apps/backend/src/library/library.module.ts — module structure, OnModuleInit pattern]
- [Source: apps/backend/src/config/config.service.ts — getSources(), MediaSource interface]
- [Source: apps/backend/src/database/database.service.ts — media_sources, media_files schema]
- [Source: _bmad-output/implementation-artifacts/2-5-manual-tmdb-match-and-needs-attention-queue.md — previous story learnings]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

None

### Completion Notes List

- Implemented `WatcherService` using native `fs.watch` with `{ recursive: true }` — zero new dependencies
- File stability check (stat→wait 2s→re-stat) with up to 30 retries (60s max) for partially written files (NFR16)
- Debounce/batch pattern: accumulates stable files per source for 3s before flushing to pipeline
- Pipeline integration reuses existing `LibraryService.syncFiles()` → `executeProbing()` → `executeMatching()` chain
- Error resilience: watcher errors logged without crashing, individual file failures isolated
- Added `GET /api/library/watcher/status` endpoint returning `{ watching, paths, errors }`
- 18 unit tests covering lifecycle, detection, stability, errors, debouncing, and status API
- All 123 backend tests pass with zero regressions

### File List

- apps/backend/src/library/watcher.service.ts (NEW)
- apps/backend/src/library/watcher.service.spec.ts (NEW)
- apps/backend/src/library/library.module.ts (MODIFIED)
- apps/backend/src/library/library.controller.ts (MODIFIED)
- apps/backend/src/library/library.controller.spec.ts (MODIFIED)

### Review Findings

- [x] [Review][Patch] Dead code: `resolveSourceId()` never called [watcher.service.ts:204-209] — removed
- [x] [Review][Patch] `errors` array grows without bound [watcher.service.ts:17] — capped at 100 entries
- [x] [Review][Patch] `loadSources()` unhandled throw in `startWatching()` [watcher.service.ts:55] — wrapped in try-catch
- [x] [Review][Patch] Duplicate stability checks from rapid rename events [watcher.service.ts:107-115] — added dedup guard
- [x] [Review][Patch] Use-after-destroy: stability check continues after `stopWatching()` [watcher.service.ts:123-148] — added `watching` guard
- [x] [Review][Patch] Uncaught exception in `flushPending` [watcher.service.ts:166-178] — wrapped in try-catch
- [x] [Review][Defer] No mechanism to reload sources without restart — deferred, not in story scope
- [x] [Review][Defer] No auth on `GET /library/watcher/status` — deferred, pre-existing architectural pattern

## Change Log

- 2026-05-03: Implemented folder watcher service with native fs.watch, file stability checks, debounced batch processing, watcher status API, and 18 unit tests. All 123 tests pass.
- 2026-05-03: Code review — applied 6 patches (dead code removal, error cap, try-catch guards, dedup, use-after-destroy protection). 2 deferred.
