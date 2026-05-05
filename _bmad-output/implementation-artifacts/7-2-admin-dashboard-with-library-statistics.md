# Story 7.2: Admin Dashboard with Library Statistics

Status: done

## Story

As an admin,
I want to see library statistics at a glance on the admin panel,
so that I know the state of my library without digging through files.

## Acceptance Criteria

1. Given the admin navigates to `/admin`, when the dashboard loads, then library statistics are displayed: total titles, movie count, TV show count.
2. Transcode status breakdown is shown: count per tier (Tier 1/2/3), count per status (ready, queued, processing, failed).
3. Import pipeline summary: files discovered, probed, matched, unmatched (match_failed), total errors (from `scan_errors` table).
4. Statistics are fetched from `GET /api/admin/stats`.
5. The admin page uses functional, no-frills styling (UX-DR14: "pipeline visibility without polish overhead" — use project CSS variables, no new design patterns).

## Tasks / Subtasks

- [x] Task 1: Create `AdminStatsService` in backend (AC: #1, #2, #3)
  - [x] Create `apps/backend/src/admin/admin-stats.service.ts`
  - [x] Inject `DatabaseService`
  - [x] Implement `getStats()` method that runs SQL queries against `media_files`, `metadata`, `transcode_jobs`, and `scan_errors` tables
  - [x] Return a typed `AdminStats` interface with library totals, transcode breakdown, and import pipeline summary

- [x] Task 2: Implement `GET /admin/stats` endpoint with real data (AC: #4)
  - [x] Modify `apps/backend/src/admin/admin.controller.ts` — update `AdminController.getStats()` to inject and call `AdminStatsService.getStats()`
  - [x] Return typed response (replaces the current empty `{}` placeholder)
  - [x] Endpoint remains protected by `LanGuard` (already applied at class level)

- [x] Task 3: Register `AdminStatsService` in `AdminModule` (AC: #4)
  - [x] Update `apps/backend/src/admin/admin.module.ts` to import `DatabaseModule` and register `AdminStatsService` as a provider

- [x] Task 4: Create Angular `AdminStatsService` on frontend (AC: #1, #2, #3)
  - [x] Create `apps/frontend/src/app/admin/admin-stats.service.ts`
  - [x] Inject `HttpClient`, call `GET /api/admin/stats`
  - [x] Return typed observable matching the backend response shape

- [x] Task 5: Update `AdminComponent` with dashboard UI (AC: #1, #2, #3, #5)
  - [x] Replace placeholder template in `apps/frontend/src/app/admin/admin.component.ts`
  - [x] Display three stat sections: Library Totals, Transcode Status, Import Pipeline
  - [x] Use `toSignal()` pattern for async data (matches existing `AdminAccessService` pattern)
  - [x] Add component-scoped CSS for simple grid/table layout using project CSS variables

- [x] Task 6: Write backend unit tests for `AdminStatsService` (AC: #1, #2, #3)
  - [x] Create `apps/backend/src/admin/admin-stats.service.spec.ts`
  - [x] Test: returns correct library totals (movies vs TV via `metadata.media_type`)
  - [x] Test: returns correct transcode breakdown by tier and status
  - [x] Test: returns correct import pipeline counts by `media_files.status`
  - [x] Test: returns scan_errors count
  - [x] Test: returns zeros when database is empty

- [x] Task 7: Update `AdminController` tests (AC: #4)
  - [x] Update `apps/backend/src/admin/admin.controller.spec.ts`
  - [x] Test: `GET /admin/stats` returns full stats object
  - [x] Test: endpoint still returns 403 for non-LAN clients

- [x] Task 8: Write frontend unit tests (AC: #1, #5)
  - [x] Create `apps/frontend/src/app/admin/admin.component.spec.ts`
  - [x] Test: component renders library statistics when data loads
  - [x] Test: component shows transcode breakdown
  - [x] Test: component shows import pipeline summary
  - [x] Create `apps/frontend/src/app/admin/admin-stats.service.spec.ts`
  - [x] Test: service calls correct endpoint and maps response

### Review Findings

- [x] [Review][Decision] `probe_failed` status silently ignored in pipeline stats — resolved: count toward `totalErrors`
- [x] [Review][Patch] No error handling in backend `getStats()` — DB exceptions propagate as raw 500 [admin-stats.service.ts:34]
- [x] [Review][Patch] No error handling in frontend — HTTP errors crash the component via `toSignal()` with no `catchError` [admin.component.ts:185]
- [x] [Review][Defer] Duplicated `AdminStats` interface across frontend/backend with no shared contract — deferred, pre-existing pattern
- [x] [Review][Defer] No caching or rate-limiting on the stats endpoint — deferred, pre-existing (admin-only, LAN-guarded)

## Dev Notes

### Database Schema for Stats Queries

The stats endpoint must query these existing tables (DO NOT create new tables):

**`media_files`** — Pipeline status tracking:

- `status` values: `'discovered'`, `'probed'`, `'matched'`, `'classified'`, `'ready'`, `'completed'`, `'probe_failed'`, `'match_failed'`
- `tier` column: `1`, `2`, or `3` (NULL until classified)
- `source_id` → references `media_sources.type` (`'movies'` or `'tv'`)

**`metadata`** — Title-level information:

- `media_type`: `'movie'` or `'tv'`
- One row per matched media file (joined via `media_file_id`)

**`transcode_jobs`** — Transcode status:

- `status` values: `'queued'`, `'processing'`, `'completed'`, `'failed'`
- `tier`: `1`, `2`, or `3`

**`scan_errors`** — Error log:

- Each row is one error; count all rows for total errors

### Stats Response Shape (TypeScript Interface)

```typescript
interface AdminStats {
  library: {
    totalTitles: number; // COUNT of metadata rows
    movieCount: number; // metadata WHERE media_type = 'movie'
    tvShowCount: number; // metadata WHERE media_type = 'tv' (COUNT DISTINCT tmdb_id for TV since multiple episodes share one show)
  };
  transcode: {
    byTier: { tier1: number; tier2: number; tier3: number };
    byStatus: {
      ready: number;
      queued: number;
      processing: number;
      failed: number;
      completed: number;
    };
  };
  pipeline: {
    discovered: number; // media_files WHERE status = 'discovered'
    probed: number; // media_files WHERE status = 'probed'
    matched: number; // media_files WHERE status IN ('matched','classified','ready','completed')
    unmatched: number; // media_files WHERE status = 'match_failed'
    totalErrors: number; // COUNT(*) FROM scan_errors
  };
}
```

**Important — TV show counting:** For `library.tvShowCount`, count DISTINCT `tmdb_id` in metadata where `media_type = 'tv'`. Each TV episode is a separate `media_file` → `metadata` row but shares the same `tmdb_id`. The user wants to see "how many TV shows" not "how many episodes."

**For `library.totalTitles`:** This is `movieCount + tvShowCount` (distinct titles, not file count).

### SQL Queries (Reference Implementation)

```sql
-- Library totals
SELECT COUNT(*) as movieCount FROM metadata WHERE media_type = 'movie';
SELECT COUNT(DISTINCT tmdb_id) as tvShowCount FROM metadata WHERE media_type = 'tv';

-- Transcode by tier (from media_files, not transcode_jobs — tier is on media_files)
SELECT tier, COUNT(*) as count FROM media_files WHERE tier IS NOT NULL GROUP BY tier;

-- Transcode by status (from transcode_jobs table)
SELECT status, COUNT(*) as count FROM transcode_jobs GROUP BY status;

-- Also count tier-1 files that have status='ready' as "ready" in transcode breakdown
-- Tier 1 files never get transcode_jobs rows (they're direct-play ready)
-- Include media_files WHERE tier = 1 AND status IN ('ready','completed') in the "ready" count

-- Pipeline status counts
SELECT status, COUNT(*) as count FROM media_files GROUP BY status;

-- Total scan errors
SELECT COUNT(*) as totalErrors FROM scan_errors;
```

**Critical nuance — "ready" transcode count:** Tier 1 files are classified as "ready" immediately (no transcode needed). They do NOT have `transcode_jobs` rows. The `transcode.byStatus.ready` count should reflect: `transcode_jobs WHERE status = 'completed'` + `media_files WHERE tier = 1 AND status IN ('ready', 'completed')`. Alternatively, simplify: `byStatus` comes from `transcode_jobs` table only (Tier 2/3 jobs), and `byTier` counts from `media_files.tier`. The AC says "count per tier, count per status" — keep them as separate breakdowns.

**Simplest correct approach:**

- `transcode.byTier`: `SELECT tier, COUNT(*) FROM media_files WHERE tier IS NOT NULL GROUP BY tier`
- `transcode.byStatus`: `SELECT status, COUNT(*) FROM transcode_jobs GROUP BY status`

### Existing Code to Modify

**`apps/backend/src/admin/admin.controller.ts`** (UPDATE):

- Current `AdminController.getStats()` returns `{}` — replace with call to `AdminStatsService.getStats()`
- Keep `@UseGuards(LanGuard)` at class level (already applied)
- Keep `AccessController` untouched

**`apps/backend/src/admin/admin.module.ts`** (UPDATE):

- Add `DatabaseModule` to imports array
- Add `AdminStatsService` to providers array

**`apps/frontend/src/app/admin/admin.component.ts`** (UPDATE):

- Replace placeholder template with dashboard layout
- Add CSS styles (component-scoped)
- Inject new `AdminStatsService`

### Frontend Component Pattern

Follow existing patterns from story 7-1:

- Standalone component, `ChangeDetectionStrategy.OnPush`
- Use `inject()` for DI
- Use `toSignal()` from `@angular/core/rxjs-interop` for async data
- Use project CSS variables from the design system (`--color-bg`, `--color-surface`, `--color-text`, `--color-text-muted`, `--color-accent`, `--color-error`, `--color-success`)
- Template uses `@if` / `@for` control flow (modern Angular)

**Template structure:**

```html
<h1>Admin Panel</h1>
@if (stats()) {
<section class="stats-section">
  <h2>Library</h2>
  <!-- stats grid -->
</section>
<section class="stats-section">
  <h2>Transcode Status</h2>
  <!-- tier counts, status counts -->
</section>
<section class="stats-section">
  <h2>Import Pipeline</h2>
  <!-- pipeline status counts -->
</section>
} @else {
<p>Loading statistics...</p>
}
```

**CSS approach:** Simple CSS Grid or flexbox for stat cards. Dark surface background (`--color-surface`) for sections, muted text for labels, primary text for values. No animations, no external CSS framework. Keep it minimal — this is an admin tool.

### Backend Service Pattern

Follow existing service patterns (e.g., `LibraryService`, `BrowseService`):

- `@Injectable()` decorator
- Inject `DatabaseService` via constructor
- Use `this.db.getDatabase()` to get the `better-sqlite3` Database instance
- Use `.prepare(sql).all()` for SELECT queries returning arrays
- Use `.prepare(sql).get()` for single-row results
- All queries are synchronous (better-sqlite3 is sync)

### Testing Pattern

**Backend tests** follow the in-memory database pattern established in existing specs:

- Create a `TestingModule` with real `DatabaseService` using `CACHE_PATH: ':memory:'`
- Insert test data directly via SQL in `beforeEach`
- Assert service returns correct aggregated counts

**Frontend tests** follow Angular `TestBed` pattern:

- Use `HttpClientTestingModule` (or `provideHttpClientTesting()`) to mock HTTP
- Flush expected requests with test data
- Assert component renders expected values

### Project Structure Notes

**New files:**

- `apps/backend/src/admin/admin-stats.service.ts`
- `apps/backend/src/admin/admin-stats.service.spec.ts`
- `apps/frontend/src/app/admin/admin-stats.service.ts`
- `apps/frontend/src/app/admin/admin-stats.service.spec.ts`
- `apps/frontend/src/app/admin/admin.component.spec.ts`

**Modified files:**

- `apps/backend/src/admin/admin.controller.ts`
- `apps/backend/src/admin/admin.module.ts`
- `apps/backend/src/admin/admin.controller.spec.ts`
- `apps/frontend/src/app/admin/admin.component.ts`

### Previous Story Intelligence (from 7-1)

- Admin module uses split controller pattern: `AccessController` (unguarded `/access`) and `AdminController` (class-level `@UseGuards(LanGuard)`)
- `GET /admin/stats` already exists as a placeholder returning `{}` — just need to populate it
- Frontend uses `toSignal()` + `shareReplay(1)` pattern for session-scoped data
- `AdminAccessService` guards route access; component can assume user IS admin if they reached it
- Tests use `jest.mock('os')` for backend, standard `TestBed` for frontend
- `LanDetectionService` is exported from `AdminModule` — available for injection in other modules if needed
- Docker networking note: `ADMIN_SUBNET` env var exists for explicit LAN override

### Existing Patterns to Follow

- **Global API prefix:** `api` set in `main.ts` — routes registered as `/admin/stats` become `/api/admin/stats`
- **Database access:** Inject `DatabaseService`, call `getDatabase()` for sync `better-sqlite3` operations
- **No ORM:** Raw SQL only. Use prepared statements. No query builders.
- **Frontend HTTP:** Services in `apps/frontend/src/app/services/` or co-located with feature. Admin feature service can live in `apps/frontend/src/app/admin/`
- **Component styles:** Inline in component decorator or separate `.css` file. For admin dashboard, inline `styles` array is fine given minimal CSS.

### Security Considerations

- `GET /admin/stats` is already protected by `LanGuard` at class level — no additional auth needed
- Stats queries are read-only `SELECT` with no user input — no SQL injection risk
- Do not expose file paths or sensitive system info in stats response (stick to counts only)
- TMDB API key must not appear in any response (NFR12) — not relevant here but verify no accidental inclusion

### References

- [Source: epics.md - Epic 7, Story 7.2: Admin Dashboard with Library Statistics]
- [Source: architecture.md - Data Architecture: Raw SQLite (No ORM), better-sqlite3]
- [Source: architecture.md - Frontend: Angular Signals, standalone components, OnPush]
- [Source: architecture.md - API: REST, NestJS, global prefix 'api']
- [Source: prd.md - FR35: Admin can view library statistics]
- [Source: prd.md - NFR10: Admin routes only accessible from LAN]
- [Source: ux-design-specification.md - Admin surface: pipeline visibility without polish overhead]
- [Source: 7-1 story - Split controller pattern, LanGuard at class level, placeholder /admin/stats]
- [Source: database.service.ts - Schema: media_files, metadata, transcode_jobs, scan_errors tables]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (GitHub Copilot)

### Debug Log References

No issues encountered during implementation.

### Completion Notes List

- Created `AdminStatsService` backend service with typed `AdminStats` interface and SQL queries against `media_files`, `metadata`, `transcode_jobs`, and `scan_errors` tables
- TV show counting uses `COUNT(DISTINCT tmdb_id)` to count shows not episodes
- `totalTitles` = `movieCount + tvShowCount` (distinct titles)
- Transcode breakdown: `byTier` from `media_files.tier`, `byStatus` from `transcode_jobs.status`
- Pipeline counts aggregate matched statuses (matched, classified, ready, completed)
- Updated `AdminController.getStats()` to delegate to `AdminStatsService`
- Updated `AdminModule` to import `DatabaseModule` and register `AdminStatsService`
- Frontend uses `toSignal()` pattern with `inject()` DI
- Dashboard shows 3 sections: Library (stat cards), Transcode Status (cards + table), Import Pipeline (table)
- CSS uses project variables (`--color-surface`, `--color-bg`, `--color-accent`, `--color-text-muted`) with CSS Grid layout
- All backend tests pass (26 admin tests); pre-existing failure in classification.service.spec.ts is unrelated
- All frontend tests pass (161 tests across 11 suites)

### Change Log

- 2026-05-05: Implemented admin dashboard with library statistics (Story 7-2)

### File List

**New:**

- `apps/backend/src/admin/admin-stats.service.ts`
- `apps/backend/src/admin/admin-stats.service.spec.ts`
- `apps/frontend/src/app/admin/admin-stats.service.ts`
- `apps/frontend/src/app/admin/admin-stats.service.spec.ts`
- `apps/frontend/src/app/admin/admin.component.spec.ts`

**Modified:**

- `apps/backend/src/admin/admin.controller.ts`
- `apps/backend/src/admin/admin.module.ts`
- `apps/backend/src/admin/admin.controller.spec.ts`
- `apps/frontend/src/app/admin/admin.component.ts`
