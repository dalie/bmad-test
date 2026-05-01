# Story 2.2: Folder Scanning and File Detection

**Epic:** 2. Library Scanning & Metadata Matching
**Story Key:** 2-2-folder-scanning-and-file-detection
**Status:** ready-for-dev

## Story Requirements

### User Story Statement

As an admin,
I want the system to scan configured media folders and detect video files,
So that all my media is discovered and tracked in the library.

### Acceptance Criteria

```gherkin
Given media source folders are configured with video files present
When a library scan is triggered (on startup or via API endpoint POST /api/library/scan)
Then the system recursively scans all configured folders for video files (mkv, mp4, avi, etc.)

And new files are added to the media_files table with status "discovered"
And removed files are marked as "missing" in the database (not deleted)
And modified files (changed size/mtime) are flagged for re-processing
And the scan recovers gracefully from individual file access errors without halting (NFR13)
And partially written files (in-progress downloads) are skipped via stability checks (NFR16)
And source files are accessed read-only — never modified (NFR9)
```

## Developer Context

### Technical Requirements

#### File Detection & Tracking

1. **Recursive Scanning:** Traverse all configured media_sources folders recursively for common video container types (`.mkv`, `.mp4`, `.avi`, etc.).
2. **File Tracking Table (`media_files`):**
   - New files should be inserted with status `discovered`.
   - `created_at` and `updated_at` timestamps should be managed.
3. **File Stability Detection (NFR16):**
   - Skip files that are actively being downloaded or modified. Use a stability check (e.g., verifying mtime/size remains consistent across a short time window, such as 2 seconds).
   - Only add stable files to `media_files`.
4. **Modified File Handling:**
   - If an existing file in `media_files` has changed (size or mtime), reset its status to `discovered` and update `updated_at` to trigger re-processing.
5. **Removed File Handling:**
   - If a file is in `media_files` (for a scanned source) but no longer on disk, mark its status as `missing`. Do _not_ delete the record (preserves playback history, NFR14).
6. **Scan Triggers:**
   - On application startup: automatically trigger a full scan of all media_sources.
   - Manual API Trigger: `POST /api/library/scan`

#### API Contract

**Endpoint:** `POST /api/library/scan`

- **Request:** `{ "full": false }` (optional boolean, default `false`)
- **Response:** `202 Accepted` with a scan ID and status.
- Trigger an async background process to perform scanning.

**Endpoint:** `GET /api/library/scan/:scanId`

- **Response:** Return current scan status (`in_progress`, `completed`, `failed`), `startedAt`, `completedAt`, counts of discovered/processed/failed files, and any error details.

**Endpoint:** `GET /api/library/files`

- **Response:** Paginated list of files in `media_files` with offset, limit, and total count.

#### Error Logging

- Introduce a new table `scan_errors` to log errors (permissions, corrupted file, missing etc.) that happen during the scan.

### Architecture Compliance

1. **Read-Only Access (NFR9):** All operations on media volumes must be read-only (`O_RDONLY`).
2. **Graceful Degradation (NFR13):** Individual file access errors (`EACCES`, `ENOENT`, etc.) must be caught and logged (in `scan_errors`), allowing the rest of the scan to continue.
3. **Performance & Memory:**
   - Avoid loading massive file lists entirely into memory.
   - Use SQLite transactions/batching (`db.transaction` or grouped `.run()`) for inserting bulk database records to maximize better-sqlite3 performance.
   - Keep long-running tasks non-blocking, so other API endpoints (playback) stay responsive (NFR17).

### Library/Framework Requirements

- NestJS modules and dependency injection: create a new `LibraryModule` / `LibraryService` or `ScannerService` to house this logic.
- Node.js `fs` access should use async/await API like `fs.promises` to not block the Node event loop during the traversal, but better-sqlite3 inserts remain synchronous!
- Use `better-sqlite3` strictly synchronously, exactly as used in database service pattern.

### Testing Requirements

- Unit tests mocking `fs` operations (permission errors, file stability changing).
- Test scan logic in isolation (recursive logic, ignoring symlink loops).
- Test database interaction handling missing/modified files.

### Previous Story Intelligence (Learnings from 2.1)

- better-sqlite3 uses **synchronous API**! All database calls should be blocking and NOT wrapped in async/await. Example: `const stmt = this.db.prepare("SELECT * FROM media_files"); stmt.all();`
- There is no ORM. Schema additions should use `CREATE TABLE IF NOT EXISTS` directly in `DatabaseService`'s `onModuleInit()` or a new initialization step.
- Ensure that unit tests checking database use `:memory:` as the database filepath rather than creating local files.

## Status Update

Ultimate context engine analysis completed - comprehensive developer guide created.
