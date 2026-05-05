# Story 7.3: Import and Transcode Monitoring with Error Details

Status: ready-for-dev

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

- [ ] Task 1: Create `AdminJobsService` in backend (AC: #1, #2, #3, #4)
  - [ ] Create `apps/backend/src/admin/admin-jobs.service.ts`
  - [ ] Inject `DatabaseService`
  - [ ] Implement `getFailedJobs()` — query `transcode_jobs` WHERE status='failed' JOIN `media_files` for filename, plus query `scan_errors` for probe/match failures
  - [ ] Implement `getJobDetails(id: number)` — full job details with error_details, file path, tier, timestamps
  - [ ] Implement `retryJob(id: number)` — reset transcode_job status from 'failed' back to 'queued', clear error_details
  - [ ] Implement `getPipelineStatus()` — aggregate counts from `transcode_jobs` by status + scan_errors count
  - [ ] Return typed interfaces for all responses

- [ ] Task 2: Add admin job endpoints to `AdminController` (AC: #1, #2, #3, #4)
  - [ ] UPDATE `apps/backend/src/admin/admin.controller.ts`
  - [ ] Add `GET /admin/jobs` — returns failed/errored jobs list (paginated)
  - [ ] Add `GET /admin/jobs/:id` — returns full error details for one job
  - [ ] Add `POST /admin/jobs/:id/retry` — retries a failed transcode job
  - [ ] Add `GET /admin/pipeline` — returns aggregate pipeline status counts
  - [ ] All endpoints protected by `LanGuard` (class-level, already applied)

- [ ] Task 3: Register `AdminJobsService` in `AdminModule` (AC: #1)
  - [ ] UPDATE `apps/backend/src/admin/admin.module.ts` — add `AdminJobsService` to providers

- [ ] Task 4: Create frontend `AdminJobsService` (AC: #1, #2, #3, #4)
  - [ ] Create `apps/frontend/src/app/admin/admin-jobs.service.ts`
  - [ ] Inject `HttpClient`
  - [ ] Implement methods: `getPipelineStatus()`, `getFailedJobs()`, `getJobDetails(id)`, `retryJob(id)`
  - [ ] Define typed interfaces matching backend response shapes

- [ ] Task 5: Create `PipelineMonitorComponent` (AC: #1, #2, #3, #4)
  - [ ] Create `apps/frontend/src/app/admin/pipeline-monitor.component.ts`
  - [ ] Display pipeline status summary (queued/processing/completed/failed counts)
  - [ ] Display failed jobs table with: filename, failure stage, error message, timestamp
  - [ ] Add "View Details" action per failed job (expandable row or inline detail)
  - [ ] Add "Retry" button per failed transcode job with loading state
  - [ ] Use `toSignal()` pattern, `ChangeDetectionStrategy.OnPush`, standalone component
  - [ ] Use project CSS variables, minimal styling (UX-DR14)

- [ ] Task 6: Create `NeedsAttentionComponent` (AC: #5)
  - [ ] Create `apps/frontend/src/app/admin/needs-attention.component.ts`
  - [ ] Call existing `GET /api/library/unmatched` endpoint (already exists from story 2-5)
  - [ ] Display list of unmatched files with: filename, source type, error message
  - [ ] Add TMDB search UI: search input + call `GET /api/tmdb/search?query=X&type=movie|tv`
  - [ ] Display search results with poster, title, year, overview
  - [ ] Add "Match" button per result → calls `POST /api/library/files/:id/match` with selected tmdbId
  - [ ] Show success/error feedback after match attempt
  - [ ] Support pagination for unmatched files list

- [ ] Task 7: Integrate monitoring components into `AdminComponent` (AC: #1, #5)
  - [ ] UPDATE `apps/frontend/src/app/admin/admin.component.ts`
  - [ ] Add `PipelineMonitorComponent` and `NeedsAttentionComponent` below existing stats sections
  - [ ] Import both components in the standalone component's `imports` array

- [ ] Task 8: Write backend unit tests for `AdminJobsService` (AC: #1, #2, #3, #4)
  - [ ] Create `apps/backend/src/admin/admin-jobs.service.spec.ts`
  - [ ] Test: `getFailedJobs()` returns transcode failures with filename, stage, error, timestamp
  - [ ] Test: `getFailedJobs()` returns scan/probe/match errors from `scan_errors` table
  - [ ] Test: `getJobDetails(id)` returns full details for existing job
  - [ ] Test: `getJobDetails(id)` throws NotFoundException for missing job
  - [ ] Test: `retryJob(id)` resets status to 'queued' and clears error_details
  - [ ] Test: `retryJob(id)` throws NotFoundException for missing job
  - [ ] Test: `retryJob(id)` throws BadRequestException for non-failed job
  - [ ] Test: `getPipelineStatus()` returns correct aggregate counts
  - [ ] Test: returns empty results when no jobs/errors exist

- [ ] Task 9: Update `AdminController` tests (AC: #2, #3, #4)
  - [ ] UPDATE `apps/backend/src/admin/admin.controller.spec.ts`
  - [ ] Test: `GET /admin/jobs` returns jobs list
  - [ ] Test: `GET /admin/jobs/:id` returns job details
  - [ ] Test: `POST /admin/jobs/:id/retry` returns success
  - [ ] Test: `GET /admin/pipeline` returns status counts
  - [ ] Test: all new endpoints return 403 for non-LAN clients

- [ ] Task 10: Write frontend unit tests (AC: #1, #2, #5)
  - [ ] Create `apps/frontend/src/app/admin/pipeline-monitor.component.spec.ts`
  - [ ] Test: component renders pipeline status counts
  - [ ] Test: component renders failed jobs table
  - [ ] Test: retry button triggers service call and refreshes list
  - [ ] Create `apps/frontend/src/app/admin/needs-attention.component.spec.ts`
  - [ ] Test: component renders unmatched files list
  - [ ] Test: TMDB search triggers search and displays results
  - [ ] Test: match button calls correct endpoint
  - [ ] Create `apps/frontend/src/app/admin/admin-jobs.service.spec.ts`
  - [ ] Test: service calls correct endpoints and maps responses

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

### Debug Log References

### Completion Notes List

### File List
