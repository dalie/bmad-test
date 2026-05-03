# Story 3.1: Transcode Tier Classification

Status: done

## Story

As an admin,
I want the system to classify each probed and matched file into the correct transcode tier,
so that only the minimum necessary processing is applied to each file.

## Acceptance Criteria

```gherkin
Given a file has been probed and matched (status "matched", probe_data populated)
When the classification service evaluates the file
Then Tier 1 (serve original) is assigned when video codec is web-compatible AND all audio codecs are web-compatible (AAC, Opus)
And Tier 2 (audio sidecar) is assigned when video codec is web-compatible BUT the primary audio codec is incompatible (AC3, DTS, TrueHD, etc.)
And Tier 3 (full transcode) is assigned when the video codec is not web-compatible
And the assigned tier is stored in the media_files table (tier column)
And the file status is updated to "classified"
And a transcode_jobs table exists with columns: file_id, tier, status (queued/processing/completed/failed), error_details, created_at, updated_at
And Tier 2 and Tier 3 files have a transcode_jobs row inserted with status "queued"
And Tier 1 files have no transcode_jobs row (no processing needed)
```

## Tasks / Subtasks

- [x] 1. Update `DatabaseService.runMigrations()` — add `tier` column and `transcode_jobs` table (AC: 5, 7)
  - [x] 1.1 In the existing `CREATE TABLE IF NOT EXISTS media_files` statement in `database.service.ts`, add `tier INTEGER` as a new column (after `probe_data TEXT`)
  - [x] 1.2 In the main `db.exec()` block, add `CREATE TABLE IF NOT EXISTS transcode_jobs` with columns: `id INTEGER PRIMARY KEY AUTOINCREMENT`, `file_id INTEGER NOT NULL REFERENCES media_files(id) ON DELETE CASCADE`, `tier INTEGER NOT NULL CHECK (tier IN (1,2,3))`, `status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','completed','failed'))`, `error_details TEXT`, `created_at TEXT NOT NULL DEFAULT (datetime('now'))`, `updated_at TEXT NOT NULL DEFAULT (datetime('now'))`
  - [x] 1.3 Add index: `CREATE INDEX IF NOT EXISTS idx_transcode_jobs_file_id ON transcode_jobs(file_id)`
  - [x] 1.4 Add index: `CREATE INDEX IF NOT EXISTS idx_transcode_jobs_status ON transcode_jobs(status)`

- [x] 2. Create `ClassificationService` (AC: 1–6)
  - [x] 2.1 Create `apps/backend/src/library/classification.service.ts` — `@Injectable()` class with `DatabaseService` injected
  - [x] 2.2 Define `WEB_COMPATIBLE_VIDEO_CODECS` constant: `['h264', 'vp8', 'vp9', 'av1', 'theora']` (lowercase)
  - [x] 2.3 Define `WEB_COMPATIBLE_AUDIO_CODECS` constant: `['aac', 'opus', 'mp3', 'vorbis']` (lowercase)
  - [x] 2.4 Implement `classifyFile(file: { id: number; filename: string; probe_data: string | null })` method that:
    - Returns early (logs warning) if `probe_data` is null
    - Parses `probe_data` as `ProbeResult` (JSON.parse)
    - Determines tier using `determineTier(probeResult)` helper
    - Stores tier in `media_files.tier` and updates status to `'classified'` within a transaction
    - For Tier 2 and Tier 3 only: inserts a `transcode_jobs` row with `{ file_id, tier, status: 'queued' }`
    - Logs tier assignment: `Classified ${file.filename} → Tier ${tier}`
  - [x] 2.5 Implement `determineTier(probe: ProbeResult): 1 | 2 | 3` helper (private):
    - If no video stream (`probe.video === null`) → Tier 3 (cannot serve as-is)
    - Get video codec: `probe.video.codec.toLowerCase()`
    - If video codec NOT in `WEB_COMPATIBLE_VIDEO_CODECS` → Tier 3
    - If video codec IS web-compatible: check all audio tracks (`probe.audioTracks`)
    - If no audio tracks OR all audio codecs (lowercased) are in `WEB_COMPATIBLE_AUDIO_CODECS` → Tier 1
    - If any audio codec is NOT web-compatible → Tier 2
  - [x] 2.6 Implement `executeClassification()` method — same mutex pattern as `executeProbing()`/`executeMatching()`:
    - Guard with `this.classifying` flag to prevent concurrent runs
    - Query all `media_files` with `status = 'matched'`
    - Call `classifyFile()` for each, wrapped in try-catch (log error, continue to next file)
    - Logs: `Classifying ${files.length} matched files`

- [x] 3. Register `ClassificationService` in `LibraryModule` and integrate into pipeline (AC: all)
  - [x] 3.1 Add `ClassificationService` to `providers` and `exports` arrays in `library.module.ts`
  - [x] 3.2 Inject `ClassificationService` into `LibraryService` constructor
  - [x] 3.3 At the end of `executeMatching()` (after the `do...while` loop, before setting `this.matching = false`), add: `this.classificationService.executeClassification().catch(err => this.logger.error(...))`
    - Use the same non-blocking fire-and-forget pattern that `executeProbing()` uses to call `executeMatching()`

- [x] 4. Unit tests for `ClassificationService` (AC: all)
  - [x] 4.1 Create `apps/backend/src/library/classification.service.spec.ts`
  - [x] 4.2 Test Tier 1: web-compatible video + web-compatible audio → tier = 1, no `transcode_jobs` row inserted
  - [x] 4.3 Test Tier 2: web-compatible video (h264) + incompatible audio (ac3) → tier = 2, `transcode_jobs` row with status `queued`
  - [x] 4.4 Test Tier 3: non-web-compatible video (hevc) → tier = 3, `transcode_jobs` row with status `queued`
  - [x] 4.5 Test Tier 3: null video stream → tier = 3
  - [x] 4.6 Test Tier 1: web-compatible video + no audio tracks → tier = 1
  - [x] 4.7 Test null probe_data: logs warning, no DB update, no crash
  - [x] 4.8 Test malformed probe_data JSON: logs error, no crash (JSON.parse in try-catch)
  - [x] 4.9 Test `executeClassification()` mutex: a second concurrent call is a no-op while first runs
  - [x] 4.10 Test `executeClassification()` error isolation: classifyFile throws for one file, remaining files still processed
  - [x] 4.11 Use in-memory SQLite (`:memory:`) via `DatabaseService` mock or test helper — mock `DatabaseService.getDatabase()` to return a real in-memory DB so SQL assertions can be verified
  - [x] 4.12 Run full backend test suite to verify no regressions (target: all existing tests pass)

## Dev Notes

### Pipeline Flow After This Story

```
discovered → [ProbeService] → probed → [MatchingService] → matched → [ClassificationService] → classified
```

The existing `LibraryService.executeMatching()` already chains probing → matching. This story extends the chain:
- `executeMatching()` → fires `executeClassification()` non-blocking (same pattern as probing fires matching)
- Classification runs for all files with `status = 'matched'`

### Codec Classification Logic

```typescript
// Constants (module-level, not class members — simpler to test and mock)
const WEB_COMPATIBLE_VIDEO_CODECS = new Set(['h264', 'vp8', 'vp9', 'av1', 'theora']);
const WEB_COMPATIBLE_AUDIO_CODECS = new Set(['aac', 'opus', 'mp3', 'vorbis']);

private determineTier(probe: ProbeResult): 1 | 2 | 3 {
  // No video stream → cannot serve as-is, needs full transcode
  if (!probe.video) return 3;

  const videoCodec = probe.video.codec.toLowerCase();
  if (!WEB_COMPATIBLE_VIDEO_CODECS.has(videoCodec)) return 3;

  // Video is web-compatible — check audio
  const allAudioCompatible = probe.audioTracks.every(track =>
    WEB_COMPATIBLE_AUDIO_CODECS.has(track.codec.toLowerCase())
  );

  // No audio tracks or all audio is web-compatible → serve original
  return allAudioCompatible ? 1 : 2;
}
```

**Common codecs in practice:**
- Tier 1 typical: H.264 + AAC (most modern downloads), VP9 + Opus (WebM)
- Tier 2 typical: H.264 + AC3/DTS (Blu-ray remuxes), H.264 + TrueHD (4K content)
- Tier 3 typical: HEVC/H.265 + any audio (most 4K HEVC encodes), VC1 + anything

**Codecs to classify as incompatible audio:** ac3, eac3, dts, truehd, mlp, mp2, flac, pcm_s16le, pcm_s24le, wmav2 — anything not in the web-compatible set above. The `every()` check handles this: if NOT in the allow-set, it's incompatible.

**Probe codec names from ffprobe (as returned by `ProbeService`):**
- `h264` (not `avc`), `hevc` (not `h265`), `vp9`, `av1`, `mpeg4`, `vc1`
- `aac`, `ac3`, `eac3`, `dts`, `truehd`, `opus`, `mp3`, `vorbis`, `flac`
- These are the `codec_name` values from `ffprobe -print_format json -show_streams`

### DB Schema Changes (Direct, No Migration)

Add `tier INTEGER` directly to the existing `CREATE TABLE IF NOT EXISTS media_files` DDL in `database.service.ts`. Add the `transcode_jobs` table and its indexes to the same `db.exec()` block. Both use `IF NOT EXISTS` so they are safe on any re-run. No `ALTER TABLE` or `PRAGMA` introspection needed — just edit the schema script in place.

### ClassificationService Structure

```typescript
// apps/backend/src/library/classification.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ProbeResult } from './probe.service';

const WEB_COMPATIBLE_VIDEO_CODECS = new Set(['h264', 'vp8', 'vp9', 'av1', 'theora']);
const WEB_COMPATIBLE_AUDIO_CODECS = new Set(['aac', 'opus', 'mp3', 'vorbis']);

@Injectable()
export class ClassificationService {
  private readonly logger = new Logger(ClassificationService.name);
  private classifying = false;

  constructor(private readonly database: DatabaseService) {}

  async executeClassification(): Promise<void> {
    if (this.classifying) {
      this.logger.log('Classification already in progress, skipping');
      return;
    }
    this.classifying = true;
    try {
      const db = this.database.getDatabase();
      const files = db.prepare("SELECT id, filename, probe_data FROM media_files WHERE status = 'matched'").all() as any[];
      this.logger.log(`Classifying ${files.length} matched files`);
      for (const file of files) {
        try {
          this.classifyFile(file);
        } catch (err: any) {
          this.logger.error(`Classification failed for ${file.filename}: ${err.message}`);
        }
      }
    } finally {
      this.classifying = false;
    }
  }

  classifyFile(file: { id: number; filename: string; probe_data: string | null }): void {
    if (!file.probe_data) {
      this.logger.warn(`No probe_data for file ${file.filename}, skipping classification`);
      return;
    }

    let probe: ProbeResult;
    try {
      probe = JSON.parse(file.probe_data) as ProbeResult;
    } catch (err: any) {
      this.logger.error(`Failed to parse probe_data for ${file.filename}: ${err.message}`);
      return;
    }

    const tier = this.determineTier(probe);
    const db = this.database.getDatabase();

    const classifyTx = db.transaction(() => {
      db.prepare("UPDATE media_files SET tier = ?, status = 'classified', updated_at = datetime('now') WHERE id = ?")
        .run(tier, file.id);

      if (tier === 2 || tier === 3) {
        db.prepare("INSERT INTO transcode_jobs (file_id, tier, status) VALUES (?, ?, 'queued')")
          .run(file.id, tier);
      }
    });

    classifyTx();
    this.logger.log(`Classified ${file.filename} → Tier ${tier}`);
  }

  private determineTier(probe: ProbeResult): 1 | 2 | 3 {
    if (!probe.video) return 3;

    if (!WEB_COMPATIBLE_VIDEO_CODECS.has(probe.video.codec.toLowerCase())) return 3;

    const allAudioCompatible = probe.audioTracks.every(
      track => WEB_COMPATIBLE_AUDIO_CODECS.has(track.codec.toLowerCase())
    );
    return allAudioCompatible ? 1 : 2;
  }
}
```

### Integration into LibraryService.executeMatching()

The classification must be triggered AFTER the matching do-while loop completes. The `LibraryService` already imports `MatchingService` — add `ClassificationService` injection:

```typescript
// In executeMatching() — add at end of do...while, INSIDE finally block equivalent:
// After:  } while (this.matchingQueued);
// Before: } finally { this.matching = false; }

// Fire classification non-blocking, same pattern as executeProbing fires executeMatching
this.classificationService.executeClassification().catch((err) =>
  this.logger.error(`Classification failed: ${err.message}`)
);
```

Important: Place the call INSIDE the `do...while` block's body (after the loop exits) but BEFORE `this.matching = false`. This ensures classification fires once after the final match pass.

Actually, place it right after `} while (this.matchingQueued);` and before `} finally {`:

```typescript
async executeMatching(): Promise<void> {
  if (this.matching) {
    this.matchingQueued = true;
    return;
  }
  this.matching = true;
  try {
    do {
      this.matchingQueued = false;
      // ... existing matching loop ...
    } while (this.matchingQueued);

    // Trigger classification after all matching passes complete (non-blocking)
    this.classificationService.executeClassification().catch((err) =>
      this.logger.error(`Classification failed: ${err.message}`)
    );
  } finally {
    this.matching = false;
  }
}
```

### Architecture Compliance

- **NFR9 (Read-only source files):** Classification only reads `probe_data` from DB — never touches source files
- **NFR13 (Error isolation):** try-catch per file in `executeClassification()` — one failure never blocks others
- **NFR17 (Non-blocking playback):** Classification operates only on `matched` files in the DB; no interaction with playback paths
- **Import/serve separation:** Classification is pure DB-to-DB work (read probe_data, write tier+status) — completely separate from the static file serving path

### File Structure

```
apps/backend/src/library/
├── classification.service.ts        # NEW: Tier classification logic
├── classification.service.spec.ts   # NEW: Unit tests
├── library.module.ts                # UPDATE: add ClassificationService to providers + exports
├── library.service.ts               # UPDATE: inject ClassificationService, call executeClassification() after matching

apps/backend/src/database/
├── database.service.ts              # UPDATE: add tier column to media_files CREATE TABLE + add transcode_jobs CREATE TABLE
```

### Library/Framework Requirements

- **No new npm dependencies** — pure NestJS/TypeScript/better-sqlite3 (already installed)
- `better-sqlite3` synchronous API — all DB operations are synchronous (no async/await needed in `classifyFile`)
- `db.transaction()` — wraps UPDATE + INSERT atomically so tier assignment + job creation are never partial

### Testing Requirements

- Follow the exact same test patterns used in `probe.service.spec.ts` and `matching.service.spec.ts`
- Mock `DatabaseService.getDatabase()` to return a real better-sqlite3 in-memory DB (`:memory:`) — this gives you a real SQLite instance to assert against without filesystem side-effects
- Create the tables in the in-memory DB before each test (run the relevant `CREATE TABLE` DDL in `beforeEach`)
- Do NOT mock SQLite operations — use real in-memory SQLite for integration-quality unit tests (pattern established in prior stories)
- Use `jest.spyOn(service['logger'], 'warn')` / `'error'` to assert logging behavior for null probe_data, malformed JSON, etc.

### Previous Story Intelligence (from 2-6)

- **better-sqlite3 synchronous API** — `classifyFile()` can be a plain synchronous method (no `async`), since all DB ops are sync. The `executeClassification()` outer method is `async` only for interface consistency with the pipeline pattern.
- **Mutex pattern (classifying guard):** Copy the `this.probing` flag pattern from `LibraryService.executeProbing()` exactly
- **Transaction pattern:** `db.transaction(() => { ... })()` — the returned function is called immediately. Used in prior stories (see `LibraryService.syncFiles()`)
- **Error logging pattern:** `this.logger.error(\`Operation failed for ${file.filename}: ${err.message}\`)`  — do NOT rethrow from per-file loops, just log and continue
- **Module registration:** `ClassificationService` goes in `providers` AND `exports` in `LibraryModule` (match the pattern of all other services in the module)
- **NestJS injection:** Add `private readonly classificationService: ClassificationService` as the LAST constructor parameter in `LibraryService` to avoid disrupting existing injection order
- **All 123+ tests must pass** — run `npm test -w apps/backend` before finalizing

### Existing Code Patterns to Follow (DO NOT REINVENT)

- `LibraryService.executeProbing()` — exact mutex + loop + fire-and-forget pattern to replicate for `executeClassification()`
- `db.transaction()` pattern — see `LibraryService.syncFiles()` (line ~120 in library.service.ts)
- `ProbeResult` interface — imported from `./probe.service`; `probe_data` in DB is `JSON.stringify(ProbeResult)` stored as TEXT

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 3.1 acceptance criteria, Story 3.5 pipeline flow]
- [Source: _bmad-output/planning-artifacts/epics.md — Epic 3 business context]
- [Source: apps/backend/src/library/probe.service.ts — ProbeResult interface, codec field names from ffprobe]
- [Source: apps/backend/src/library/library.service.ts — executeProbing/executeMatching mutex pattern, syncFiles transaction pattern]
- [Source: apps/backend/src/database/database.service.ts — runMigrations(), table schemas, PRAGMA pattern]
- [Source: apps/backend/src/library/library.module.ts — module providers/exports pattern]
- [Source: _bmad-output/implementation-artifacts/2-6-folder-watcher-for-new-content-detection.md — transaction pattern, error isolation, mutex, test approach]
- [Source: _bmad-output/implementation-artifacts/deferred-work.md — known deferred items (none directly impact this story)]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.6

### Debug Log References

### Completion Notes List

- Implemented `ClassificationService` with `classifyFile()` and `executeClassification()` using the established mutex/fire-and-forget pipeline pattern.
- Added `tier INTEGER` column to `media_files` CREATE TABLE DDL and created `transcode_jobs` table with two indexes, all via `IF NOT EXISTS` — no migration scripts needed.
- `determineTier()` uses `Set`-based lookup for O(1) codec matching; handles null video, no audio, and mixed audio tracks correctly.
- `classifyFile()` wraps DB UPDATE + optional INSERT in a `db.transaction()` — tier assignment and job creation are atomic.
- Tier 1 files (serve original) produce no `transcode_jobs` row; Tier 2 and Tier 3 produce one row with `status = 'queued'`.
- `executeClassification()` is wired into `executeMatching()` as a non-blocking fire-and-forget call after the `do...while` loop, exactly matching the probing→matching pipeline pattern.
- `ClassificationService` added to `LibraryModule` providers and exports; injected as last constructor parameter in `LibraryService`.
- 12 new unit tests cover all ACs: Tier 1/2/3 classification, null video, no audio, null probe_data warning, malformed JSON error, mutex guard, error isolation per file, and full integration run.
- All 136 backend tests pass (124 prior + 12 new). Zero regressions.

### File List

- apps/backend/src/database/database.service.ts
- apps/backend/src/library/classification.service.ts
- apps/backend/src/library/classification.service.spec.ts
- apps/backend/src/library/library.module.ts
- apps/backend/src/library/library.service.ts
- apps/backend/src/library/library.service.spec.ts

## Change Log

- 2026-05-03: Story 3-1 implemented. Added `tier` column + `transcode_jobs` table to DB schema; created `ClassificationService` with tier 1/2/3 logic; wired classification pipeline after matching; 12 new unit tests. All 136 tests pass.

### Review Findings

- [x] [Review][Patch] P1: `probe.audioTracks` null/undefined crashes `determineTier` [classification.service.ts:determineTier] — add guard `if (!probe.audioTracks) return 3;` before `.every()` call
- [x] [Review][Patch] P2: `probe.video.codec` null/undefined crashes `.toLowerCase()` [classification.service.ts:determineTier] — add guard `if (!probe.video.codec) return 3;`
- [x] [Review][Patch] P3: individual `track.codec` null/undefined crashes inside `.every()` [classification.service.ts:determineTier] — use `(track.codec ?? '').toLowerCase()`
- [x] [Review][Patch] P4: no `UNIQUE` constraint on `transcode_jobs(file_id)` — re-runs insert duplicate job rows [database.service.ts] — add `UNIQUE(file_id)` constraint or use `INSERT OR IGNORE`
- [x] [Review][Patch] P5: `err.message` access when rejection is not an Error instance [library.service.ts:executeMatching] — use `err instanceof Error ? err.message : String(err)`
- [x] [Review][Patch] P6: test asserts `toHaveBeenCalled()` instead of `toHaveBeenCalledTimes(1)` [library.service.spec.ts] — tighten assertion
- [x] [Review][Defer] W1: existing deployments — `tier` column never added to live `media_files` table [database.service.ts] — deferred, pre-existing schema migration strategy
- [x] [Review][Defer] W2: `error_details` column defined but never populated [database.service.ts] — deferred, owned by future transcode stories 3-2/3-3
- [x] [Review][Defer] W3: no retry/attempts tracking on `transcode_jobs` — `failed` status is a dead end [database.service.ts] — deferred, future story scope
- [x] [Review][Defer] W4: `executeClassification` loads all matched files with an unbounded query [classification.service.ts] — deferred, pre-existing pipeline pattern
