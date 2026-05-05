# Story 6.3: Auto-Mark Titles as Watched

Status: done

## Story

As a viewer,
I want titles to be automatically marked as watched when I finish them,
so that I can see what I've already seen at a glance.

## Acceptance Criteria

1. Given the viewer is watching a title, when playback position reaches ≥ 90% of duration, then the title is marked as "watched" (`watched: true`) in localStorage.
2. For movies, the watched flag is stored with the movie storage key (`movie:${id}`).
3. For TV shows, the individual episode is marked as watched using its storage key (`tv:${id}:s${seasonNum}:e${episodeNum}`).
4. For TV shows, if the viewer starts watching an episode that was already marked as watched, the `watched` status of all LATER episodes of the same show is removed (set to `false`).
5. Watched status is reflected in the poster grid on the next page load — dimmed poster via existing `poster-grid__image-wrap--watched` CSS class (opacity 0.4, per UX-DR5).
6. The Continue Watching entry is removed for fully watched movies (filtered by `!e.watched` in `readContinueWatchingFromStorage()`).
7. For TV shows, the Continue Watching section shows the latest UNWATCHED episode for a show (not the absolute latest entry, which may be watched).

## Tasks / Subtasks

- [x] Task 1: Modify `saveProgress()` to auto-mark watched at 90% threshold (AC: #1, #2, #3)
  - [x] In `apps/frontend/src/app/player/player.component.ts`, modify `saveProgress()`
  - [x] Change `watched: false` to a computed value: `position / duration >= 0.90`
  - [x] This is the ONLY change needed in `saveProgress()` — the entry structure, key format, and save mechanism all remain identical

- [x] Task 2: Add `clearLaterEpisodesWatched()` for TV rewatch logic (AC: #4)
  - [x] In `apps/frontend/src/app/player/player.component.ts`, add private method `clearLaterEpisodesWatched(): void`
  - [x] Method guards: returns early if `!this.progressContext`, if `mediaType !== 'tv'`, or if `seasonNum`/`episodeNum` are null
  - [x] Method reads all entries via `this.watchProgressService.readAll()`
  - [x] Method checks if the CURRENT episode's entry exists AND has `watched: true`
  - [x] If so, iterates all entries in the record, finds entries matching the same show ID (`mediaType === 'tv'` AND same `id`) that are "later" (higher season, OR same season + higher episode)
  - [x] For each later episode with `watched: true`, calls `this.watchProgressService.saveEntry(key, { ...entry, watched: false, updatedAt: Date.now() })`
  - [x] Call `clearLaterEpisodesWatched()` at the end of `ngAfterViewInit()`, AFTER `applyResumePosition()`

- [x] Task 3: Modify `readContinueWatchingFromStorage()` in home component (AC: #6, #7)
  - [x] In `apps/frontend/src/app/home/home.component.ts`, modify `readContinueWatchingFromStorage()`
  - [x] During the grouping loop, skip TV entries that have `watched: true` — only group unwatched TV episodes for Continue Watching selection
  - [x] Movies remain unchanged — group by latest updatedAt, then filter by `!e.watched` at the end
  - [x] Result: for TV shows, the Continue Watching section shows the latest UNWATCHED episode per show; fully watched shows (all episodes watched) don't appear

- [x] Task 4: Write unit tests for auto-mark watched behavior (AC: #1–#3)
  - [x] In `apps/frontend/src/app/player/player.component.spec.ts`, add `describe('Auto-mark as watched')`
  - [x] Test: `saveProgress()` sets `watched: true` when position/duration >= 0.90
  - [x] Test: `saveProgress()` sets `watched: false` when position/duration < 0.90
  - [x] Test: threshold boundary — exactly 0.90 → `watched: true`
  - [x] Test: just below threshold (0.899) → `watched: false`

- [x] Task 5: Write unit tests for TV rewatch clearing logic (AC: #4)
  - [x] In `apps/frontend/src/app/player/player.component.spec.ts`, add `describe('TV rewatch clearing')`
  - [x] Test: when starting a watched TV episode, later episodes' watched status is cleared
  - [x] Test: earlier episodes' watched status is NOT cleared
  - [x] Test: same-season higher episode number is treated as "later"
  - [x] Test: higher season (any episode) is treated as "later"
  - [x] Test: no-op when current episode is NOT already watched
  - [x] Test: no-op for movies (only TV triggers clearing)
  - [x] Test: no-op when progressContext is null

- [x] Task 6: Write unit tests for home component Continue Watching TV behavior (AC: #7)
  - [x] In `apps/frontend/src/app/home/home.component.spec.ts`, add tests to existing Continue Watching describe block
  - [x] Test: when latest TV episode is watched but an older one is unwatched, the unwatched one appears in Continue Watching
  - [x] Test: when ALL TV episodes for a show are watched, the show does NOT appear in Continue Watching
  - [x] Test: watched movies are excluded from Continue Watching (existing behavior preserved)
  - [x] Test: unwatched TV episode with progress still appears normally

## Dev Notes

### Critical Design: Threshold Relationships

There are TWO distinct percentage thresholds in the player. Do NOT confuse them:

| Threshold           | Purpose                           | Used In                             | Comparison                                |
| ------------------- | --------------------------------- | ----------------------------------- | ----------------------------------------- |
| **90%** (`>= 0.90`) | Mark title as "watched"           | `saveProgress()` (this story)       | `position / duration >= 0.90`             |
| **95%** (`>= 0.95`) | Start from beginning on next play | `applyResumePosition()` (story 6-2) | `entry.position / entry.duration >= 0.95` |

Between 90–95%: title IS marked watched, but resume still seeks to saved position. At 95%+: title is watched AND resume starts from the beginning. This is intentional — at 90% the credits are typically rolling, but the user hasn't quite finished the very end.

### Existing Infrastructure to Reuse (DO NOT REINVENT)

**`saveProgress()`** — already builds the full `WatchProgressEntry` and calls `this.watchProgressService.saveEntry(storageKey, entry)`. The ONLY change needed is the `watched` field value. Currently hardcoded to `false`:

```typescript
const entry: WatchProgressEntry = {
  position,
  duration,
  watched: false, // ← CHANGE THIS to: position / duration >= 0.90
  updatedAt: Date.now(),
  // ... rest unchanged
};
```

**`WatchProgressService.readAll()`** — returns `WatchProgressRecord = Record<string, WatchProgressEntry>`. Keys are `movie:${id}` or `tv:${id}:s${season}:e${episode}`.

**`WatchProgressService.saveEntry(key, entry)`** — reads full record, merges entry, writes back. Perfectly fine to call multiple times for the TV clearing logic.

**`WatchProgressEntry.watched: boolean`** — field already exists in the interface. Home component already reads it. No schema change needed.

**Home component `isWatched()`** — already reads `entry.watched` from `progressData` signal:

```typescript
isWatched(item: LibraryItem): boolean {
  return this.progressData().get(`${item.mediaType}:${item.id}`)?.watched ?? false;
}
```

The `progressData` map groups by `${mediaType}:${id}` taking the LATEST by `updatedAt`. For this to correctly reflect "watched" for TV shows, the latest episode entry should have `watched: true` when the show is done.

**Home component `poster-grid__image-wrap--watched` CSS** — already applied via `[class.poster-grid__image-wrap--watched]="isWatched(item)"` on both Recently Added and Library sections. Renders as `opacity: 0.4`. No CSS or HTML changes needed.

**Home component `readContinueWatchingFromStorage()`** — already filters `.filter((e) => !e.watched)`. The modification is WHERE we filter: move the watched check INTO the grouping loop for TV entries.

### `saveProgress()` — Single Line Change

```typescript
private saveProgress(): void {
  // ... all existing guards unchanged ...

  const entry: WatchProgressEntry = {
    position,
    duration,
    watched: position / duration >= 0.90,  // ← THE ONLY CHANGE
    updatedAt: Date.now(),
    mediaType: ctx.mediaType,
    id: ctx.id,
    title: ctx.title,
    posterUrl: ctx.posterUrl,
    year: ctx.year,
    fileId,
    tier: ctx.tier,
    seasonNum: ctx.seasonNum,
    episodeNum: ctx.episodeNum,
  };

  this.watchProgressService.saveEntry(storageKey, entry);
}
```

### `clearLaterEpisodesWatched()` — Complete Reference Implementation

```typescript
private clearLaterEpisodesWatched(): void {
  if (!this.progressContext) return;
  const ctx = this.progressContext;
  if (ctx.mediaType !== 'tv') return;
  if (ctx.seasonNum == null || ctx.episodeNum == null) return;

  const record = this.watchProgressService.readAll();

  // Derive current episode's storage key
  const currentKey = `tv:${ctx.id}:s${ctx.seasonNum}:e${ctx.episodeNum}`;
  const currentEntry = record[currentKey];

  // Only trigger if current episode was already marked as watched
  if (!currentEntry || !currentEntry.watched) return;

  // Find and clear all later episodes for this show
  for (const [key, entry] of Object.entries(record)) {
    if (entry.mediaType !== 'tv' || entry.id !== ctx.id) continue;
    if (entry.seasonNum == null || entry.episodeNum == null) continue;
    if (!entry.watched) continue;

    // Determine if this entry is "later" than current
    const isLater =
      entry.seasonNum > ctx.seasonNum ||
      (entry.seasonNum === ctx.seasonNum && entry.episodeNum > ctx.episodeNum);

    if (isLater) {
      this.watchProgressService.saveEntry(key, {
        ...entry,
        watched: false,
        updatedAt: Date.now(),
      });
    }
  }
}
```

### Placement in `ngAfterViewInit()` — After `applyResumePosition()`

```typescript
ngAfterViewInit(): void {
  // ... all existing listeners and interval setup ...

  // Apply resume position LAST — after all listeners are registered
  this.applyResumePosition();

  // Clear watched status from later episodes if rewatching a TV episode
  this.clearLaterEpisodesWatched();
}
```

### Home Component `readContinueWatchingFromStorage()` Modification

```typescript
private readContinueWatchingFromStorage(): ContinueWatchingItem[] {
  try {
    const record = this.watchProgressService.readAll();

    const latestByTitle = new Map<string, WatchProgressEntry>();
    for (const entry of Object.values(record)) {
      if (!this.isValidProgressEntry(entry)) continue;

      // For TV: skip watched episodes — only consider unwatched ones for Continue Watching
      if (entry.mediaType === 'tv' && entry.watched) continue;

      const key = `${entry.mediaType}:${entry.id}`;
      const existing = latestByTitle.get(key);
      if (!existing || entry.updatedAt > existing.updatedAt) {
        latestByTitle.set(key, entry);
      }
    }

    return Array.from(latestByTitle.values())
      .filter((e) => !e.watched)  // Still needed for movies
      .filter((e) => e.duration > 0 && e.position > 0)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((e) => ({
        id: e.id,
        title: e.title,
        year: e.year,
        posterUrl: e.posterUrl,
        mediaType: e.mediaType,
        progressPercent: Math.min(100, Math.round((e.position / e.duration) * 100)),
        watched: false,
        playFileId: e.fileId,
        tier: e.tier ?? null,
        seasonNum: e.seasonNum,
        episodeNum: e.episodeNum,
      }));
  } catch {
    return [];
  }
}
```

### What Must Be Preserved (Do Not Break)

1. **`saveProgress()` guards** — all existing early-return conditions must remain: `!this.progressContext`, `!video`, `!duration || !isFinite(duration) || duration <= 0`, `position <= 0`, TV seasonNum/episodeNum null check, fileId NaN check.
2. **Storage key format** — MUST remain byte-for-byte identical: `movie:${ctx.id}` or `tv:${ctx.id}:s${ctx.seasonNum}:e${ctx.episodeNum}`.
3. **Resume threshold at 95%** — `applyResumePosition()` must remain unchanged. The 90% watched threshold is independent.
4. **`buildProgressData()` in home component** — this powers `getProgressPercent()` and `isWatched()` for the poster grids. It takes the latest entry per title regardless of watched status. DO NOT modify this — only modify `readContinueWatchingFromStorage()`.
5. **Progress interval** — `setInterval(() => this.saveProgress(), 5000)` must remain.
6. **`isWatched()` in home component** — already correctly reads `entry.watched`. No change needed.
7. **HTML template and CSS** — no changes needed. The watched class binding and dimmed opacity are already in place.
8. **Pause and destroy saves** — `saveProgress()` on pause and in `ngOnDestroy` must remain for ALL tiers.

### Testing Pattern — Vitest (NOT Jasmine)

The project uses **Vitest**. Use `vi.fn()`, `vi.spyOn()`, `describe()`, `it()`, `expect()`. The `WatchProgressService` is mocked in the existing `setup()` function with:

```typescript
const watchProgressMock = {
  saveEntry: vi.fn(),
  readAll: vi.fn().mockReturnValue({}),
};
```

Override per-test: `watchSvc.readAll.mockReturnValue({ ... })` via `TestBed.inject(WatchProgressService)`.

### Home Component Test Pattern

Home component tests use Angular testing utilities with `TestBed`. The `WatchProgressService` is provided as a mock. The `readContinueWatchingFromStorage()` runs during construction (signal initialization), so test data must be set up BEFORE `TestBed.createComponent()`.

### Edge Cases to Handle

1. **Division by zero** — `position / duration >= 0.90` is safe because `saveProgress()` already guards `duration <= 0` before reaching the entry construction.
2. **NaN duration** — already guarded by `!isFinite(duration)` check.
3. **Rapid saves** — `saveProgress()` is idempotent. Calling it multiple times at 90%+ just writes `watched: true` again. No harm.
4. **TV clearing with no entries** — `Object.entries(record)` on `{}` produces empty array. Loop body never executes. Safe.
5. **clearLaterEpisodesWatched called for movies** — early return on `ctx.mediaType !== 'tv'`. Safe.
6. **Multiple saves during clearing** — each `saveEntry()` call reads-modifies-writes the full record. Since it reads fresh each time, concurrent modifications are safe (each save picks up previous saves).

### Previous Story Learnings (From Stories 6-1 and 6-2)

1. **`addListener()` is for lifecycle-managed listeners only.** One-shot listeners use `el.addEventListener(event, fn, { once: true })`.
2. **`progressContext` null guard** — always check `if (!this.progressContext) return` at method start.
3. **TV guard for seasonNum/episodeNum** — storage key breaks without them. Guard with `ctx.seasonNum == null || ctx.episodeNum == null`.
4. **`isNaN` checks** — use `isNaN(n) ? default : n` pattern. Already handled in `buildProgressContext()`.
5. **Storage key must match exactly** — `movie:${id}` and `tv:${id}:s${season}:e${episode}`. Same format everywhere.
6. **Optional chaining on `videoElRef`** — `saveProgress()` uses `this.videoElRef?.nativeElement`. The new `clearLaterEpisodesWatched()` doesn't access video element, so this isn't relevant there.
7. **Vitest, not Jasmine** — use `vi.fn()`, `vi.spyOn()`, not `jasmine.*`.

### Files to Create / Modify

| File                                                    | Action     | Why                                                                                                                                                                      |
| ------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/frontend/src/app/player/player.component.ts`      | **UPDATE** | 1. Change `watched: false` → `watched: position / duration >= 0.90` in `saveProgress()`. 2. Add `clearLaterEpisodesWatched()`. 3. Call it at end of `ngAfterViewInit()`. |
| `apps/frontend/src/app/home/home.component.ts`          | **UPDATE** | Modify `readContinueWatchingFromStorage()` to skip watched TV episodes during grouping.                                                                                  |
| `apps/frontend/src/app/player/player.component.spec.ts` | **UPDATE** | Add `describe('Auto-mark as watched')` and `describe('TV rewatch clearing')` test blocks.                                                                                |
| `apps/frontend/src/app/home/home.component.spec.ts`     | **UPDATE** | Add tests for Continue Watching behavior with watched TV episodes.                                                                                                       |

**No other files change.** No new files, services, HTML, or CSS needed.

### Project Structure Reference

- Frontend root: `apps/frontend/src/app/`
- Player component: `apps/frontend/src/app/player/player.component.ts`
- Player spec: `apps/frontend/src/app/player/player.component.spec.ts`
- Home component: `apps/frontend/src/app/home/home.component.ts`
- Home spec: `apps/frontend/src/app/home/home.component.spec.ts`
- Watch progress service: `apps/frontend/src/app/services/watch-progress.service.ts`
- Testing framework: **Vitest** — use `vi.fn()`, `vi.spyOn()`

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

No issues encountered.

### Completion Notes List

- Modified `saveProgress()` to compute `watched: position / duration >= 0.90` instead of hardcoded `false`
- Added `clearLaterEpisodesWatched()` private method with proper guards for TV-only, null checks, and "later" episode detection logic
- Called `clearLaterEpisodesWatched()` at end of `ngAfterViewInit()` after `applyResumePosition()`
- Modified home component `readContinueWatchingFromStorage()` to skip watched TV episodes during grouping loop — only unwatched TV episodes are candidates for Continue Watching
- Added 5 tests in "Auto-mark as watched" describe block (threshold boundary testing)
- Added 7 tests in "TV rewatch clearing" describe block (later/earlier detection, guards)
- Added 4 tests in "Continue Watching TV watched behavior" describe block (TV watched filtering)
- All 150 frontend tests pass with no regressions

### File List

- `apps/frontend/src/app/player/player.component.ts` — MODIFIED (saveProgress watched computation, clearLaterEpisodesWatched method, ngAfterViewInit call)
- `apps/frontend/src/app/home/home.component.ts` — MODIFIED (readContinueWatchingFromStorage TV watched skip)
- `apps/frontend/src/app/player/player.component.spec.ts` — MODIFIED (auto-mark + TV rewatch clearing tests)
- `apps/frontend/src/app/home/home.component.spec.ts` — MODIFIED (Continue Watching TV behavior tests)

## Change Log

- 2026-05-05: Implemented story 6-3 — auto-mark titles as watched at 90% threshold, TV rewatch clearing logic, and Continue Watching TV filtering. All ACs satisfied. 16 new tests added, 150 total passing.
