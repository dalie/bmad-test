# Story 7.4: Manual Library Rescan Trigger

Status: ready-for-dev

## Story

As an admin,
I want to trigger a full library rescan from the admin panel,
so that I can force the system to re-check media folders when needed.

## Acceptance Criteria

1. Given the admin is on the admin panel, when the admin clicks "Rescan Library", then a `POST /api/admin/rescan` triggers a full library scan (same as startup scan from Story 2.2).
2. The scan runs in the background without blocking the admin UI or viewer playback (NFR17).
3. The admin panel shows scan progress (files found, processed).
4. Newly discovered files enter the standard pipeline (probe → match → classify → transcode).

## Tasks / Subtasks

- [ ] Task 1: Import `LibraryModule` into `AdminModule` (AC: #1)
  - [ ] UPDATE `apps/backend/src/admin/admin.module.ts` — add `LibraryModule` to `imports` array
  - [ ] This gives `AdminController` access to `LibraryService` (exported by `LibraryModule`)

- [ ] Task 2: Add rescan and status endpoints to `AdminController` (AC: #1, #2, #3)
  - [ ] UPDATE `apps/backend/src/admin/admin.controller.ts`
  - [ ] Inject `LibraryService` into `AdminController` constructor
  - [ ] Add `POST /admin/rescan` — calls `this.libraryService.startScan(true)`, returns `{ scanId: string }`
  - [ ] Add `GET /admin/rescan/:scanId` — calls `this.libraryService.getScanStatus(scanId)`, returns `ScanRecord | null`
  - [ ] Both endpoints are automatically guarded by class-level `@UseGuards(LanGuard)`
  - [ ] The `startScan()` method is already async/non-blocking (runs scan in background, returns immediately with scanId)

- [ ] Task 3: Create frontend `AdminRescanService` (AC: #1, #3)
  - [ ] Create `apps/frontend/src/app/admin/admin-rescan.service.ts`
  - [ ] `@Injectable({ providedIn: 'root' })`
  - [ ] Inject `HttpClient` via `inject(HttpClient)`
  - [ ] Implement `triggerRescan(): Observable<{ scanId: string }>` — `POST /api/admin/rescan`
  - [ ] Implement `getScanStatus(scanId: string): Observable<ScanStatus>` — `GET /api/admin/rescan/${scanId}`
  - [ ] Define `ScanStatus` interface matching backend `ScanRecord`

- [ ] Task 4: Create `RescanComponent` (AC: #1, #2, #3, #4)
  - [ ] Create `apps/frontend/src/app/admin/rescan.component.ts`
  - [ ] Standalone component, `ChangeDetectionStrategy.OnPush`
  - [ ] Inject `AdminRescanService` via `inject()`
  - [ ] "Rescan Library" button triggers `triggerRescan()`, stores returned `scanId`
  - [ ] While scan is in progress, poll `getScanStatus(scanId)` every 2 seconds using `interval()` + `switchMap()`
  - [ ] Display scan progress: status, files discovered, files processed, failed count
  - [ ] Disable "Rescan Library" button while scan is `in_progress`
  - [ ] Show completion state (success with counts, or failed with error summary)
  - [ ] Stop polling when status is `completed` or `failed`
  - [ ] Use project CSS variables, minimal styling (UX-DR14)

- [ ] Task 5: Integrate `RescanComponent` into `AdminComponent` (AC: #1)
  - [ ] UPDATE `apps/frontend/src/app/admin/admin.component.ts`
  - [ ] Import `RescanComponent` in standalone `imports` array
  - [ ] Add `<app-rescan />` in template (between stats and pipeline monitor sections)

- [ ] Task 6: Write backend unit tests (AC: #1, #2, #3)
  - [ ] UPDATE `apps/backend/src/admin/admin.controller.spec.ts`
  - [ ] Test: `POST /admin/rescan` calls `libraryService.startScan(true)` and returns `{ scanId }`
  - [ ] Test: `POST /admin/rescan` returns 403 for non-LAN clients
  - [ ] Test: `GET /admin/rescan/:scanId` returns scan record when found
  - [ ] Test: `GET /admin/rescan/:scanId` returns 404 when scanId not found

- [ ] Task 7: Write frontend unit tests (AC: #1, #3)
  - [ ] Create `apps/frontend/src/app/admin/rescan.component.spec.ts`
  - [ ] Test: "Rescan Library" button triggers service call
  - [ ] Test: button is disabled during active scan
  - [ ] Test: progress display shows discovered/processed counts
  - [ ] Test: polling stops on completion
  - [ ] Create `apps/frontend/src/app/admin/admin-rescan.service.spec.ts`
  - [ ] Test: `triggerRescan()` calls correct endpoint
  - [ ] Test: `getScanStatus()` calls correct endpoint with scanId

## Dev Notes

### Critical: Reuse Existing Infrastructure — DO NOT Reinvent

`LibraryService` (in `apps/backend/src/library/library.service.ts`) already has:

```typescript
startScan(full?: boolean): string  // Returns scanId, runs async in background
getScanStatus(scanId: string): ScanRecord | undefined
```

`ScanRecord` interface (already defined in `library.service.ts`):

```typescript
export interface ScanRecord {
  id: string;
  status: "in_progress" | "completed" | "failed";
  startedAt: string;
  completedAt: string | null;
  discovered: number;
  processed: number;
  failed: number;
  errors: string[];
}
```

The scan is already non-blocking. `startScan()` fires the scan asynchronously and immediately returns a UUID. The scan automatically chains: scan → probe → match → classify (pipeline runs in sequence, per file). This satisfies AC #4 without any additional work.

**DO NOT** create a new scanning service or duplicate any scan logic. The admin endpoint is a thin wrapper around `LibraryService.startScan()`.

### Module Dependency

`AdminModule` currently imports only `DatabaseModule`. To inject `LibraryService`, add `LibraryModule` to `AdminModule.imports`. `LibraryModule` already exports `LibraryService`.

```typescript
// admin.module.ts — required change
imports: [DatabaseModule, LibraryModule],
```

**IMPORTANT**: Add `forwardRef(() => LibraryModule)` if circular dependency occurs (unlikely since AdminModule doesn't export anything LibraryModule uses). Test without forwardRef first.

### Concurrency Safety

`LibraryService.startScan()` creates a new `ScanRecord` on each invocation. There is no mutex preventing multiple concurrent scans. The probing/matching phases DO have mutex guards (`this.probing`, `this.matching` flags) so concurrent scan triggers are safe — only one probe pass and one match pass run at a time, additional triggers queue naturally.

However, the frontend should prevent double-clicking by disabling the button while a scan is in progress. If the admin triggers a rescan while one is already running, it's harmless but wasteful. The button disable + progress polling covers this UX concern.

### Backend Endpoint Patterns

Follow exact patterns from story 7-3:

- Endpoints in `AdminController` class (class-level `@UseGuards(LanGuard)`)
- Inject services via constructor
- Return typed interfaces
- Use `@Param()` decorator for route params
- No `@Body()` needed for the POST (rescan has no request body)

### Frontend Component Patterns (Established in Stories 7-1, 7-2, 7-3)

- **Standalone components** with `ChangeDetectionStrategy.OnPush`
- **`inject()`** for DI (no constructor injection)
- **`toSignal()`** from `@angular/core/rxjs-interop` for static data
- For polling, use writable signals + manual subscription (since toSignal doesn't handle dynamic polling well)
- **`@if` / `@for`** modern Angular control flow (NOT `*ngIf` / `*ngFor`)
- **Project CSS variables**: `--color-bg`, `--color-surface`, `--color-text`, `--color-text-muted`, `--color-accent`, `--color-error`, `--color-success`
- **No external CSS frameworks** — inline `styles` array in component decorator
- **Error handling**: `catchError(() => of(fallbackValue))` in pipes

### Polling Pattern (Frontend)

```typescript
import { interval, switchMap, takeWhile, tap } from "rxjs";

// After triggering rescan and receiving scanId:
interval(2000)
  .pipe(
    switchMap(() => this.rescanService.getScanStatus(scanId)),
    tap((status) => this.scanStatus.set(status)),
    takeWhile((status) => status.status === "in_progress", true),
  )
  .subscribe();
```

Use a `signal<ScanStatus | null>()` for reactive template binding. Destroy subscription in `DestroyRef` or use `takeUntilDestroyed()`.

### 404 Handling for Missing Scan ID

`LibraryService.getScanStatus()` returns `undefined` if scan ID not found (in-memory Map). The controller should throw `NotFoundException` if undefined:

```typescript
@Get('rescan/:scanId')
getScanStatus(@Param('scanId') scanId: string): ScanRecord {
  const record = this.libraryService.getScanStatus(scanId);
  if (!record) {
    throw new NotFoundException(`Scan ${scanId} not found`);
  }
  return record;
}
```

### Scan Records Persistence Note

Scan records are stored in-memory (`Map<string, ScanRecord>`) and are lost on server restart. This is acceptable for the current use case — the admin triggers a scan and monitors it live. Historical scan data is not a requirement.

### Previous Story Learnings (from 7-3)

- All admin routes are protected by class-level `@UseGuards(LanGuard)` — do NOT add guard to individual endpoints
- `AdminController` uses constructor injection (not `inject()`) — follow existing pattern
- Frontend admin components use `inject()` for DI — follow existing pattern
- Review found: No CSRF/auth beyond LanGuard for destructive operations — deferred (architectural decision)
- Review found: Replace `window.location.reload()` with reactive data refresh — use signals for state management

### Files to Create

| File                                                       | Type |
| ---------------------------------------------------------- | ---- |
| `apps/frontend/src/app/admin/admin-rescan.service.ts`      | NEW  |
| `apps/frontend/src/app/admin/rescan.component.ts`          | NEW  |
| `apps/frontend/src/app/admin/rescan.component.spec.ts`     | NEW  |
| `apps/frontend/src/app/admin/admin-rescan.service.spec.ts` | NEW  |

### Files to Update

| File                                              | Change                                                   |
| ------------------------------------------------- | -------------------------------------------------------- |
| `apps/backend/src/admin/admin.module.ts`          | Add `LibraryModule` to imports                           |
| `apps/backend/src/admin/admin.controller.ts`      | Add `LibraryService` injection + rescan/status endpoints |
| `apps/backend/src/admin/admin.controller.spec.ts` | Add tests for new endpoints                              |
| `apps/frontend/src/app/admin/admin.component.ts`  | Import and render `RescanComponent`                      |

### Project Structure Notes

- Backend admin module: `apps/backend/src/admin/`
- Backend library module: `apps/backend/src/library/` (contains `LibraryService` to reuse)
- Frontend admin feature: `apps/frontend/src/app/admin/`
- Service naming pattern: `admin-*.service.ts` (e.g., `admin-stats.service.ts`, `admin-jobs.service.ts`, `admin-rescan.service.ts`)
- Component naming pattern: `*.component.ts` (e.g., `pipeline-monitor.component.ts`, `rescan.component.ts`)

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 7, Story 7.4]
- [Source: _bmad-output/planning-artifacts/architecture.md#Admin Panel, Library Scanning, Background Jobs]
- [Source: apps/backend/src/library/library.service.ts — startScan(), getScanStatus(), ScanRecord]
- [Source: apps/backend/src/admin/admin.controller.ts — existing AdminController pattern]
- [Source: apps/backend/src/admin/admin.module.ts — module structure]
- [Source: _bmad-output/implementation-artifacts/7-3-import-and-transcode-monitoring-with-error-details.md — previous story patterns]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
