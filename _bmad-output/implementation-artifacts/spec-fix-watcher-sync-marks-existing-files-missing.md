---
title: "Fix watcher marking existing files as missing on new file detection"
type: "bugfix"
created: "2026-05-05"
status: "done"
baseline_commit: "589e7c6"
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** When the file watcher detects a new movie, it calls `syncFiles()` with only the newly discovered files. `syncFiles()` assumes a full directory scan and marks every existing file not in the passed list as `'missing'`, causing the entire library to vanish from browse queries.

**Approach:** Add a dedicated `insertNewFiles()` method to `LibraryService` that only inserts/upserts the provided files without reconciling missing entries. Have `WatcherService.flushPending()` call this new method instead of `syncFiles()`.

## Boundaries & Constraints

**Always:** Existing `syncFiles()` behaviour for full scans (via `executeScan`) must remain unchanged. The new method must still trigger probing for newly inserted files.

**Ask First:** Any schema changes to `media_files`.

**Never:** Do not alter the full-scan reconciliation logic. Do not remove the `'missing'` status concept — it's valid for full rescans detecting deleted files.

## I/O & Edge-Case Matrix

| Scenario               | Input / State                                              | Expected Output / Behavior                                                               | Error Handling |
| ---------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------- |
| New file detected      | 1 new .mkv appears while 10 files already in DB as `ready` | New file inserted as `discovered`; existing 10 remain unchanged                          | N/A            |
| Duplicate detection    | Watcher fires for a file already in DB                     | Existing record checked for modification (size/mtime), updated if changed; no new insert | N/A            |
| Multiple new files     | 3 new files detected in batch                              | All 3 inserted; no existing records touched                                              | N/A            |
| Modified existing file | Watcher detects size/mtime change on known file            | Status reset to `discovered` for re-probing                                              | N/A            |

</frozen-after-approval>

## Code Map

- `apps/backend/src/library/library.service.ts` -- contains `syncFiles()` (full-scan reconciler); will add `insertNewFiles()` method
- `apps/backend/src/library/watcher.service.ts` -- `flushPending()` incorrectly calls `syncFiles()`; will switch to `insertNewFiles()`

## Tasks & Acceptance

**Execution:**

- [x] `apps/backend/src/library/library.service.ts` -- Add `insertNewFiles(sourceId, scannedFiles)` method that inserts new files and updates modified files but does NOT mark remaining files as missing
- [x] `apps/backend/src/library/watcher.service.ts` -- Change `flushPending()` to call `this.libraryService.insertNewFiles()` instead of `this.libraryService.syncFiles()`

**Acceptance Criteria:**

- Given a library with existing matched movies, when a new movie file is detected by the watcher, then all previously matched movies remain visible in the library API
- Given a new file detected by the watcher, when it is processed, then it appears in the database with status `discovered` and triggers probing
- Given a full library rescan triggered via admin, when files have been physically deleted, then those files are still correctly marked as `missing`

## Verification

**Commands:**

- `cd apps/backend && npx tsc --noEmit` -- expected: no type errors
- `npm run start:dev --workspace=apps/backend` -- expected: server starts without errors

**Manual checks:**

- Add a file to the media folder; confirm new file appears in DB as `discovered` and existing entries retain their status

## Suggested Review Order

- New additive-only method: inserts/upserts without orphan marking
  [`library.service.ts:181`](../../apps/backend/src/library/library.service.ts#L181)

- Watcher now calls the safe path instead of full-sync
  [`watcher.service.ts:224`](../../apps/backend/src/library/watcher.service.ts#L224)
