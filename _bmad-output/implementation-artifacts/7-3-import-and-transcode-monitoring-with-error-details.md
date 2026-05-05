# Story 7.3: Import and Transcode Monitoring with Error Details

Status: done

## Story

As an admin,
I want to view detailed import and transcode status and drill into errors,
so that I can diagnose and resolve pipeline failures.

## Acceptance Criteria

1. Given the admin is on the admin panel, when the admin views the pipeline section, then the current pipeline status is shown: jobs queued, in-progress, completed, failed.
2. Failed jobs are listed with: filename, failure stage (probe/match/transcode/subtitle), error message, timestamp.
3. The admin can view full error details for any failed job via `GET /api/admin/jobs/:id`.
4. Failed transcode jobs can be retried via `POST /api/admin/jobs/:id/retry`.
5. The "Needs Attention" queue (unmatched files from Epic 2) is accessible from the admin panel with the manual TMDB search and match UI.

## Tasks / Subtasks

- [x] Task 1: Create `AdminJobsService` in backend (AC: #1, #2, #3, #4)
  - [x] Create `apps/backend/src/admin/admin-jobs.service.ts`
  - [x] Inject `DatabaseService`
  - [x] Implement `getFailedJobs()` — query `transcode_jobs` WHERE status='failed' JOIN `media_files` for filename, plus query `scan_errors` for probe/match failures
  - [x] Implement `getJobDetails(id: number)` — full job details with error_details, file path, tier, timestamps
  - [x] Implement `retryJob(id: number)` — reset transcode_job status from 'failed' back to 'queued', clear error_details
  - [x] Implement `getPipelineStatus()` — aggregate counts from `transcode_jobs` by status + scan_errors count
  - [x] Return typed interfaces for all responses

- [x] Task 2: Add admin job endpoints to `AdminController` (AC: #1, #2, #3, #4)
  - [x] UPDATE `apps/backend/src/admin/admin.controller.ts`
  - [x] Add `GET /admin/jobs` — returns failed/errored jobs list (paginated)
  - [x] Add `GET /admin/jobs/:id` — returns full error details for one job
  - [x] Add `POST /admin/jobs/:id/retry` — retries a failed transcode job
  - [x] Add `GET /admin/pipeline` — returns aggregate pipeline status counts
  - [x] All endpoints protected by `LanGuard` (class-level, already applied)

- [x] Task 3: Register `AdminJobsService` in `AdminModule` (AC: #1)
  - [x] UPDATE `apps/backend/src/admin/admin.module.ts` — add `AdminJobsService` to providers

- [x] Task 4: Create frontend `AdminJobsService` (AC: #1, #2, #3, #4)
  - [x] Create `apps/frontend/src/app/admin/admin-jobs.service.ts`
  - [x] Inject `HttpClient`
  - [x] Implement methods: `getPipelineStatus()`, `getFailedJobs()`, `getJobDetails(id)`, `retryJob(id)`
  - [x] Define typed interfaces matching backend response shapes

- [x] Task 5: Create `PipelineMonitorComponent` (AC: #1, #2, #3, #4)
  - [x] Create `apps/frontend/src/app/admin/pipeline-monitor.component.ts`
  - [x] Display pipeline status summary (queued/processing/completed/failed counts)
  - [x] Display failed jobs table with: filename, failure stage, error message, timestamp
  - [x] Add "View Details" action per failed job (expandable row or inline detail)
  - [x] Add "Retry" button per failed transcode job with loading state
  - [x] Use `toSignal()` pattern, `ChangeDetectionStrategy.OnPush`, standalone component
  - [x] Use project CSS variables, minimal styling (UX-DR14)

- [x] Task 6: Create `NeedsAttentionComponent` (AC: #5)
  - [x] Create `apps/frontend/src/app/admin/needs-attention.component.ts`
  - [x] Call existing `GET /api/library/unmatched` endpoint (already exists from story 2-5)
  - [x] Display list of unmatched files with: filename, source type, error message
  - [x] Add TMDB search UI: search input + call `GET /api/tmdb/search?query=X&type=movie|tv`
  - [x] Display search results with poster, title, year, overview
  - [x] Add "Match" button per result → calls `POST /api/library/files/:id/match` with selected tmdbId
  - [x] Show success/error feedback after match attempt
  - [x] Support pagination for unmatched files list

- [x] Task 7: Integrate monitoring components into `AdminComponent` (AC: #1, #5)
  - [x] UPDATE `apps/frontend/src/app/admin/admin.component.ts`
  - [x] Add `PipelineMonitorComponent` and `NeedsAttentionComponent` below existing stats sections
  - [x] Import both components in the standalone component's `imports` array

- [x] Task 8: Write backend unit tests for `AdminJobsService` (AC: #1, #2, #3, #4)
  - [x] Create `apps/backend/src/admin/admin-jobs.service.spec.ts`
  - [x] Test: `getFailedJobs()` returns transcode failures with filename, stage, error, timestamp
  - [x] Test: `getFailedJobs()` returns scan/probe/match errors from `scan_errors` table
  - [x] Test: `getJobDetails(id)` returns full details for existing job
  - [x] Test: `getJobDetails(id)` throws NotFoundException for missing job
  - [x] Test: `retryJob(id)` resets status to 'queued' and clears error_details
  - [x] Test: `retryJob(id)` throws NotFoundException for missing job
  - [x] Test: `retryJob(id)` throws BadRequestException for non-failed job
  - [x] Test: `getPipelineStatus()` returns correct aggregate counts
  - [x] Test: returns empty results when no jobs/errors exist

- [x] Task 9: Update `AdminController` tests (AC: #2, #3, #4)
  - [x] UPDATE `apps/backend/src/admin/admin.controller.spec.ts`
  - [x] Test: `GET /admin/jobs` returns jobs list
  - [x] Test: `GET /admin/jobs/:id` returns job details
  - [x] Test: `POST /admin/jobs/:id/retry` returns success
  - [x] Test: `GET /admin/pipeline` returns status counts
  - [x] Test: all new endpoints return 403 for non-LAN clients

- [x] Task 10: Write frontend unit tests (AC: #1, #2, #5)
  - [x] Create `apps/frontend/src/app/admin/pipeline-monitor.component.spec.ts`
  - [x] Test: component renders pipeline status counts
  - [x] Test: component renders failed jobs table
  - [x] Test: retry button triggers service call and refreshes list
  - [x] Create `apps/frontend/src/app/admin/needs-attention.component.spec.ts`
  - [x] Test: component renders unmatched files list
  - [x] Test: TMDB search triggers search and displays results
  - [x] Test: match button calls correct endpoint
  - [x] Create `apps/frontend/src/app/admin/admin-jobs.service.spec.ts`
  - [x] Test: service calls correct endpoints and maps responses

### Review Findings

- [x] [Review][Decision] Missing "View Details" UI for failed jobs — AC3 requires admin can view full error details; added expandable detail row
- [x] [Review][Decision] Missing pagination in NeedsAttentionComponent — added offset/limit pagination controls
- [x] [Review][Patch] Replace `window.location.reload()` with reactive data refresh after retry [pipeline-monitor.component.ts]
- [x] [Review][Patch] Add error feedback to user on retry failure [pipeline-monitor.component.ts]
- [x] [Review][Patch] Fix match() concurrency — per-file in-flight tracking [needs-attention.component.ts]
- [x] [Review][Patch] Add try/catch to getJobDetails() and retryJob() for DB error consistency [admin-jobs.service.ts]
- [x] [Review][Patch] Guard against undefined file in search() after find() [needs-attention.component.ts]
- [x] [Review][Defer] No pagination/limit on getFailedJobs() backend query — unbounded result set [admin-jobs.service.ts] — deferred, pre-existing pattern
- [x] [Review][Defer] No CSRF/auth beyond LanGuard for destructive operations — deferred, architectural
- [x] [Review][Defer] Subtitle failures have no query path in getFailedJobs() — deferred, no subtitle extraction exists yet

## Dev Notes

### Database Schema (Existing — DO NOT modify)

**`transcode_jobs`** table:

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

**`scan_errors`** table:

```sql
CREATE TABLE IF NOT EXISTS scan_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL,
  error_type TEXT NOT NULL,
  error_message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**`media_files`** table (relevant columns):

- `id`, `filename`, `path`, `source_id`, `status`, `tier`, `created_at`, `updated_at`
- `status` values: `'discovered'`, `'probed'`, `'matched'`, `'classified'`, `'ready'`, `'completed'`, `'probe_failed'`, `'match_failed'`

**Error types in `scan_errors.error_type`**: `'SCAN_ERROR'`, `'PROBE_FAILED'`, `'MATCH_FAILED'`

### Failure Stage Mapping

Map error sources to user-facing "failure stage":

- `scan_errors` with `error_type = 'SCAN_ERROR'` → stage: **scan**
- `scan_errors` with `error_type = 'PROBE_FAILED'` → stage: **probe**
- `scan_errors` with `error_type = 'MATCH_FAILED'` → stage: **match**
- `transcode_jobs` with `status = 'failed'` → stage: **transcode**
- Subtitle extraction failures (if stored in `scan_errors`) → stage: **subtitle**

### Response Interfaces

```typescript
// Pipeline status aggregate
interface PipelineMonitorStatus {
  transcode: {
    queued: number;
    processing: number;
    completed: number;
    failed: number;
  };
  scanErrors: number; // total scan_errors rows
  probeFailures: number; // scan_errors WHERE error_type = 'PROBE_FAILED'
  matchFailures: number; // media_files WHERE status = 'match_failed'
}

// Failed job list item
interface FailedJobSummary {
  id: number;
  filename: string;
  stage: "scan" | "probe" | "match" | "transcode" | "subtitle";
  errorMessage: string;
  timestamp: string; // ISO datetime
  retryable: boolean; // true only for transcode failures
}

// Full job detail (for GET /admin/jobs/:id)
interface JobDetail {
  id: number;
  filename: string;
  filePath: string;
  stage: "scan" | "probe" | "match" | "transcode" | "subtitle";
  tier: number | null;
  status: string;
  errorMessage: string;
  errorDetails: string | null; // full stack trace for transcode jobs
  createdAt: string;
  updatedAt: string;
}
```

### SQL Queries (Reference Implementation)

```sql
-- Pipeline status (transcode job counts by status)
SELECT status, COUNT(*) as count FROM transcode_jobs GROUP BY status;

-- Scan error counts by type
SELECT error_type, COUNT(*) as count FROM scan_errors GROUP BY error_type;

-- Match failure count
SELECT COUNT(*) as count FROM media_files WHERE status = 'match_failed';

-- Failed transcode jobs with filename
SELECT tj.id, mf.filename, 'transcode' as stage, tj.error_details as error_message,
       tj.updated_at as timestamp, 1 as retryable
FROM transcode_jobs tj
JOIN media_files mf ON mf.id = tj.file_id
WHERE tj.status = 'failed'
ORDER BY tj.updated_at DESC;

-- Scan/probe/match errors (from scan_errors table)
SELECT se.id, se.file_path as filename,
       CASE se.error_type
         WHEN 'SCAN_ERROR' THEN 'scan'
         WHEN 'PROBE_FAILED' THEN 'probe'
         WHEN 'MATCH_FAILED' THEN 'match'
         ELSE 'scan'
       END as stage,
       se.error_message, se.created_at as timestamp, 0 as retryable
FROM scan_errors se
ORDER BY se.created_at DESC;

-- Full job detail (transcode job)
SELECT tj.id, mf.filename, mf.path as file_path, tj.tier, tj.status,
       tj.error_details, tj.created_at, tj.updated_at
FROM transcode_jobs tj
JOIN media_files mf ON mf.id = tj.file_id
WHERE tj.id = ?;

-- Retry: reset failed transcode job
UPDATE transcode_jobs
SET status = 'queued', error_details = NULL, updated_at = datetime('now')
WHERE id = ? AND status = 'failed';
```

### Retry Logic

- Only **transcode** failures are retryable (they have a `transcode_jobs` row with status = 'failed')
- Scan/probe/match errors are NOT retryable via this endpoint — they require a rescan (story 7-4) or manual match
- Retry resets: `status = 'queued'`, `error_details = NULL`, `updated_at = now`
- The `TranscodeService` (tier 2/3 queue processor) will pick up retried jobs automatically on next queue check
- Return 404 if job doesn't exist, 400 if job is not in 'failed' status

### Job ID disambiguation

The `GET /admin/jobs/:id` and `POST /admin/jobs/:id/retry` use `transcode_jobs.id` for transcode failures. For scan_errors, use a prefixed scheme to avoid collision:

- Transcode job IDs: raw integer (e.g., `42`)
- Scan error IDs: prefix with `se-` (e.g., `se-15`) — detail view only, not retryable

Frontend distinguishes by checking `retryable` flag. Backend routes parse accordingly.

### Existing Endpoints to Reuse (DO NOT duplicate)

These endpoints already exist and are working — reuse them from the frontend for the Needs Attention queue:

| Endpoint                                      | Controller        | Purpose                   |
| --------------------------------------------- | ----------------- | ------------------------- |
| `GET /api/library/unmatched`                  | LibraryController | Paginated unmatched files |
| `GET /api/tmdb/search?query=X&type=movie\|tv` | TmdbController    | TMDB search proxy         |
| `POST /api/library/files/:id/match`           | LibraryController | Assign manual TMDB match  |

**CRITICAL**: Do NOT create new backend endpoints for the Needs Attention queue. The frontend `NeedsAttentionComponent` calls existing library endpoints directly. These endpoints are NOT admin-guarded (they're on `/api/library/` and `/api/tmdb/`) — this is acceptable because the Needs Attention UI is only rendered inside the admin panel which is already route-guarded.

### Existing Code to Modify

**`apps/backend/src/admin/admin.controller.ts`** (UPDATE):

- Add new endpoints to existing `AdminController` class (already has `@UseGuards(LanGuard)` at class level)
- Inject `AdminJobsService` alongside existing `AdminStatsService`
- New routes: `GET /admin/jobs`, `GET /admin/jobs/:id`, `POST /admin/jobs/:id/retry`, `GET /admin/pipeline`

**`apps/backend/src/admin/admin.module.ts`** (UPDATE):

- Add `AdminJobsService` to providers array
- No new imports needed (DatabaseModule already imported)

**`apps/frontend/src/app/admin/admin.component.ts`** (UPDATE):

- Import `PipelineMonitorComponent` and `NeedsAttentionComponent` into standalone component
- Add them to template below existing stats sections

### Frontend Component Patterns

Follow patterns established in stories 7-1 and 7-2:

- **Standalone components** with `ChangeDetectionStrategy.OnPush`
- **`inject()`** for DI (no constructor injection)
- **`toSignal()`** from `@angular/core/rxjs-interop` for async data
- **`@if` / `@for`** modern Angular control flow (NOT `*ngIf` / `*ngFor`)
- **Project CSS variables**: `--color-bg`, `--color-surface`, `--color-text`, `--color-text-muted`, `--color-accent`, `--color-error`, `--color-success`
- **Error handling**: pipe with `catchError(() => of(fallbackValue))` before `toSignal()`
- **No external CSS frameworks** — inline `styles` array in component decorator

### PipelineMonitorComponent Template Structure

```html
<section class="monitor-section">
  <h2>Pipeline Status</h2>
  <div class="status-grid">
    <!-- Queued / Processing / Completed / Failed counts as stat cards -->
  </div>

  <h3>Failed Jobs</h3>
  @if (failedJobs()?.length) {
  <table class="jobs-table">
    <thead>
      <tr>
        <th>File</th>
        <th>Stage</th>
        <th>Error</th>
        <th>Time</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      @for (job of failedJobs(); track job.id) {
      <tr>
        <td>{{ job.filename }}</td>
        <td>{{ job.stage }}</td>
        <td>{{ job.errorMessage }}</td>
        <td>{{ job.timestamp }}</td>
        <td>
          @if (job.retryable) {
          <button (click)="retry(job.id)">Retry</button>
          }
        </td>
      </tr>
      }
    </tbody>
  </table>
  } @else {
  <p class="empty-state">No failed jobs</p>
  }
</section>
```

### NeedsAttentionComponent Template Structure

```html
<section class="attention-section">
  <h2>Needs Attention (Unmatched Files)</h2>
  @if (unmatchedFiles()?.items?.length) { @for (file of unmatchedFiles()!.items;
  track file.id) {
  <div class="attention-item">
    <div class="file-info">
      <span class="filename">{{ file.filename }}</span>
      <span class="error-msg">{{ file.error_message }}</span>
    </div>
    <!-- Search + match UI per file -->
    <div class="match-controls">
      <input
        (keyup.enter)="search(file.id, $event)"
        placeholder="Search TMDB..."
      />
      @if (searchResults()[file.id]?.length) { @for (result of
      searchResults()[file.id]; track result.id) {
      <div class="search-result">
        <span>{{ result.title }} ({{ result.release_date }})</span>
        <button (click)="match(file.id, result.id)">Match</button>
      </div>
      } }
    </div>
  </div>
  } } @else {
  <p class="empty-state">No unmatched files</p>
  }
</section>
```

### Backend Service Pattern

Follow existing `AdminStatsService` pattern:

- `@Injectable()` decorator
- Inject `DatabaseService` via constructor
- Use `this.database.getDatabase()` for sync `better-sqlite3` operations
- Use `.prepare(sql).all()` for arrays, `.prepare(sql).get()` for single rows
- Use `.prepare(sql).run()` for UPDATE/INSERT

### Testing Patterns

**Backend tests** — in-memory SQLite pattern:

```typescript
const module = await Test.createTestingModule({
  imports: [DatabaseModule],
  providers: [AdminJobsService],
}).compile();
// DatabaseService auto-creates schema in ':memory:' mode
// Insert test data via db.prepare(...).run(...)
```

**Frontend tests** — Angular TestBed with HTTP mocking:

```typescript
TestBed.configureTestingModule({
  imports: [PipelineMonitorComponent],
  providers: [provideHttpClient(), provideHttpClientTesting()],
});
const httpTesting = TestBed.inject(HttpTestingController);
// Flush expected requests with mock data
```

### Security Considerations

- All new admin endpoints are class-level guarded by `LanGuard` (already in place)
- Retry endpoint uses `POST` (state-changing) — correct HTTP verb
- Job ID parsing: validate as integer via `ParseIntPipe` for transcode IDs
- For scan_error prefixed IDs (`se-XX`): validate format and extract numeric part safely
- No user-controlled SQL input — all queries use parameterized prepared statements
- Do NOT expose full file system paths to non-admin clients (these endpoints are admin-only, acceptable)

### Previous Story Intelligence (from 7-2)

**Review findings to incorporate:**

- Add error handling in backend service (DB exceptions should be caught gracefully, not raw 500s)
- Add `catchError` in frontend HTTP calls to prevent `toSignal()` crashes
- AdminStats interface is duplicated between frontend/backend — this is the established pattern, continue it (deferred concern)
- No caching needed for admin endpoints (LAN-only, low traffic)

**Patterns established:**

- `AdminStatsService` in backend injects `DatabaseService`, uses raw SQL, returns typed interface
- Frontend `AdminStatsService` mirrors backend interface locally
- `AdminComponent` uses `toSignal()` with `catchError(() => of(undefined))` for graceful error handling
- Tests use in-memory SQLite (backend) and `HttpTestingController` (frontend)

### Project Structure Notes

**New files:**

- `apps/backend/src/admin/admin-jobs.service.ts`
- `apps/backend/src/admin/admin-jobs.service.spec.ts`
- `apps/frontend/src/app/admin/admin-jobs.service.ts`
- `apps/frontend/src/app/admin/admin-jobs.service.spec.ts`
- `apps/frontend/src/app/admin/pipeline-monitor.component.ts`
- `apps/frontend/src/app/admin/pipeline-monitor.component.spec.ts`
- `apps/frontend/src/app/admin/needs-attention.component.ts`
- `apps/frontend/src/app/admin/needs-attention.component.spec.ts`

**Modified files:**

- `apps/backend/src/admin/admin.controller.ts`
- `apps/backend/src/admin/admin.controller.spec.ts`
- `apps/backend/src/admin/admin.module.ts`
- `apps/frontend/src/app/admin/admin.component.ts`

### References

- [Source: epics.md — Epic 7, Story 7.3: Import and Transcode Monitoring with Error Details]
- [Source: architecture.md — Data Architecture: Raw SQLite (No ORM), better-sqlite3]
- [Source: architecture.md — API: REST, NestJS, global prefix 'api', standard exception filters]
- [Source: architecture.md — Frontend: Angular Signals, standalone components, OnPush]
- [Source: architecture.md — Error isolation: individual file failures must never block pipeline]
- [Source: prd.md — FR36: Admin can monitor import/transcode pipeline status]
- [Source: prd.md — FR37: Admin can view error details for failed pipeline jobs]
- [Source: prd.md — NFR10: Admin routes only accessible from LAN]
- [Source: ux-design-specification.md — UX-DR14: pipeline visibility without polish overhead]
- [Source: 7-2 story — AdminStatsService pattern, SQL query patterns, frontend component patterns]
- [Source: 7-2 story — Review findings: add error handling, catchError in frontend]
- [Source: 2-5 story — Existing unmatched/match endpoints: GET /api/library/unmatched, POST /api/library/files/:id/match, GET /api/tmdb/search]
- [Source: pipeline.service.ts — PipelineService.getStatus(), PipelineService.getJobs(), job reset on startup]
- [Source: database.service.ts — scan_errors schema, transcode_jobs schema, media_files schema]
- [Source: matching.service.ts — setMatchFailed(), applyManualMatch() patterns]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Backend admin tests: 5 suites, 44 tests passed
- Frontend tests: 14 suites, 173 tests passed (all existing + 12 new)
- Pre-existing failure in classification.service.spec.ts (unrelated, 2 tests)
- TypeScript compiles clean (no errors)

### Completion Notes List

- Implemented `AdminJobsService` with `getPipelineStatus()`, `getFailedJobs()`, `getJobDetails()`, and `retryJob()` methods
- Job IDs use prefixed scheme: raw integers for transcode jobs, `se-` prefix for scan errors
- Added 4 new endpoints to `AdminController`: GET /admin/pipeline, GET /admin/jobs, GET /admin/jobs/:id, POST /admin/jobs/:id/retry
- All endpoints protected by class-level `LanGuard`
- Frontend `AdminJobsService` mirrors backend interfaces
- `PipelineMonitorComponent` displays status grid + failed jobs table with retry capability
- `NeedsAttentionComponent` reuses existing library/tmdb endpoints for unmatched file management
- Both frontend components follow established patterns: standalone, OnPush, toSignal(), inject()
- Comprehensive test coverage: backend service (12 tests), controller (5 new tests), frontend service (4 tests), pipeline component (4 tests), needs-attention component (4 tests)

### File List

New:

- apps/backend/src/admin/admin-jobs.service.ts
- apps/backend/src/admin/admin-jobs.service.spec.ts
- apps/frontend/src/app/admin/admin-jobs.service.ts
- apps/frontend/src/app/admin/admin-jobs.service.spec.ts
- apps/frontend/src/app/admin/pipeline-monitor.component.ts
- apps/frontend/src/app/admin/pipeline-monitor.component.spec.ts
- apps/frontend/src/app/admin/needs-attention.component.ts
- apps/frontend/src/app/admin/needs-attention.component.spec.ts

Modified:

- apps/backend/src/admin/admin.controller.ts
- apps/backend/src/admin/admin.controller.spec.ts
- apps/backend/src/admin/admin.module.ts
- apps/frontend/src/app/admin/admin.component.ts

### Change Log

- 2026-05-05: Implemented story 7-3 — Pipeline monitoring with error details, retry capability, and needs-attention queue integration into admin panel
