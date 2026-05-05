# Story 6.1: Persist Watch Progress in localStorage

Status: done

## Story

As a viewer,
I want my watch position to be saved automatically as I watch,
so that I never lose my place even if I close the browser.

## Acceptance Criteria

1. Given the viewer is watching a video, when playback is active, then the current playback position is saved to `localStorage` periodically (every 5 seconds).
2. For movies, the localStorage record key includes the movie ID; the entry stores: `position`, `duration`, `watched` (false), `updatedAt` (epoch ms), `mediaType: 'movie'`, `id` (movie library ID), `title`, `posterUrl`, `year`, `fileId`, `tier`.
3. For TV shows, the localStorage record key includes show ID + season number + episode number; the entry stores the same fields plus `seasonNum` and `episodeNum`.
4. For TV shows, all episodes of the same show share the same `id` (the show's tmdb_id/library ID), enabling the home component's "most recent episode" grouping to work without additional logic.
5. Progress data survives browser restarts and tab closes (stored in `localStorage` under key `cineplex_progress`).
6. No server calls are made for the localStorage persistence — all context is passed as URL query params from the detail pages.
7. Progress is saved immediately when the video is paused (in addition to the periodic interval).
8. If `fileId` or media context params are missing, no save attempt is made (graceful no-op).
9. A `WatchProgressService` is created to own the shared schema (key constant, interfaces, read/write helpers) so both the player and the home component use a single source of truth.
10. The home component's existing read logic is refactored to use the new service without any behavioral change.
11. Movie-detail and show-detail play links pass the required context as query params to the player route.
12. The Continue Watching row's play links also pass context params; `ContinueWatchingItem` is extended with optional `seasonNum` / `episodeNum` fields.

## Tasks / Subtasks

- [x] Task 1: Create `WatchProgressService` (AC: #9)
  - [x] Create `apps/frontend/src/app/services/watch-progress.service.ts`
  - [x] Move `WATCH_PROGRESS_KEY = 'cineplex_progress'`, `WatchProgressEntry`, and `WatchProgressRecord` from `home.component.ts` into the service as exports
  - [x] Add `saveEntry(storageKey: string, entry: WatchProgressEntry): void` method — reads existing record, merges entry, writes back; wraps in try/catch (localStorage may be unavailable)
  - [x] Add `readAll(): WatchProgressRecord` method — reads, parses, and returns the full record; returns `{}` on any error
  - [x] Extend `WatchProgressEntry` to add optional `seasonNum?: number` and `episodeNum?: number` fields (needed for TV episode keys and Continue Watching navigation)
  - [x] Write unit tests: `saveEntry` writes correct key, `readAll` returns parsed data, both handle localStorage errors gracefully

- [x] Task 2: Refactor `home.component.ts` to use `WatchProgressService` (AC: #10, #12)
  - [x] Remove the local definitions of `WATCH_PROGRESS_KEY`, `WatchProgressEntry`, `WatchProgressRecord` from `home.component.ts`; import them from `WatchProgressService`
  - [x] Inject `WatchProgressService` and replace direct `localStorage` calls in `buildProgressData()` and `readContinueWatchingFromStorage()` with `watchProgressService.readAll()`
  - [x] Extend `ContinueWatchingItem` with optional `seasonNum?: number` and `episodeNum?: number`
  - [x] In `readContinueWatchingFromStorage()`, map `e.seasonNum` and `e.episodeNum` into each `ContinueWatchingItem`
  - [x] Keep `LibraryItem`, `ContinueWatchingItem` exports in `home.component.ts` (home-specific view models)
  - [x] Update home tests: replace any direct `localStorage` mock with `WatchProgressService` mock

- [x] Task 3: Update `home.component.html` Continue Watching play links (AC: #12)
  - [x] Change the Continue Watching `[queryParams]` from `{ tier: item.tier }` to include the full context needed by the player:
    - `mediaType: item.mediaType`
    - `mediaId: item.id` (serves as movieId for movies or showId for TV — same `id` field)
    - `season: item.seasonNum` (undefined for movies, number for TV)
    - `episode: item.episodeNum` (undefined for movies, number for TV)
    - `title: item.title`
    - `year: item.year`
    - `posterUrl: item.posterUrl`
    - `tier: item.tier`

- [x] Task 4: Update `movie-detail.component.html` play link (AC: #6, #11)
  - [x] Extend the existing `[queryParams]="{ tier: m.tier }"` on the Play `<a>` to also pass:
    - `mediaType: 'movie'`
    - `mediaId: m.id`
    - `title: m.title`
    - `year: m.year`
    - `posterUrl: m.poster_url`

- [x] Task 5: Update `show-detail.component.html` episode play links (AC: #6, #11)
  - [x] Extend the existing `[queryParams]="{ tier: ep.tier }"` on each episode's Play `<a>` to also pass:
    - `mediaType: 'tv'`
    - `mediaId: show().id` (the show's library/tmdb_id, same as `ShowDetail.id`)
    - `season: s.season_number`
    - `episode: ep.episode_number`
    - `title: show().title`
    - `year: show().year`
    - `posterUrl: show().poster_url`

- [x] Task 6: Add progress-saving logic to `PlayerComponent` (AC: #1–#8)
  - [x] Inject `WatchProgressService` into `PlayerComponent`
  - [x] Read context query params from `ActivatedRoute.snapshot.queryParamMap`:
    - `mediaType`: `'movie' | 'tv'` (string, may be absent)
    - `mediaId`: number (movie ID or show ID)
    - `season`: number (TV only)
    - `episode`: number (TV only)
    - `title`: string
    - `year`: number | null
    - `posterUrl`: string | null
  - [x] Build a `readonly progressContext` property from these params; set to `null` if `mediaType` is absent or `mediaId` is NaN
  - [x] Derive the storage key:
    - Movies: `movie:${mediaId}`
    - TV: `tv:${mediaId}:s${season}:e${episode}`
  - [x] Add `private progressInterval: ReturnType<typeof setInterval> | null = null`
  - [x] Add `private saveProgress(): void` — reads `video.currentTime` and `video.duration`; skips if `!progressContext`, `duration <= 0`, or `currentTime <= 0`; builds `WatchProgressEntry`; calls `watchProgressService.saveEntry(key, entry)`
  - [x] Start the interval in `ngAfterViewInit` with `setInterval(() => this.saveProgress(), 5000)`
  - [x] In the existing `'pause'` event listener on the video element, call `this.saveProgress()` after the sync logic (so position is captured on pause for BOTH Tier 2 and non-Tier 2)
  - [x] For non-Tier 2 (standard video), add a separate `'pause'` listener in `ngAfterViewInit` that calls `this.saveProgress()` (the existing Tier 2 pause listener is inside the `if (this.isTier2)` block)
  - [x] In `ngOnDestroy`, call `this.saveProgress()` then `this.stopProgressSave()` (save final position before teardown)
  - [x] Write unit tests (see Testing Requirements below)

- [x] Task 7: Write unit tests for PlayerComponent progress logic (AC: #1–#8)
  - [x] Test: `saveProgress()` writes entry to `WatchProgressService` when context and duration are valid
  - [x] Test: `saveProgress()` uses key `movie:${mediaId}` for movies
  - [x] Test: `saveProgress()` uses key `tv:${mediaId}:s${season}:e${episode}` for TV
  - [x] Test: `saveProgress()` is a no-op when `progressContext` is null (missing params)
  - [x] Test: `saveProgress()` is a no-op when `video.duration` is 0 or NaN
  - [x] Test: `saveProgress()` is a no-op when `video.currentTime` is 0
  - [x] Test: interval is cleared in `ngOnDestroy`
  - [x] Test: `saveProgress()` is called on video `pause` event

### Review Findings

- [x] [Review][Patch] Tier 2 pause `saveProgress()` skipped when `syncDisabled=true` [apps/frontend/src/app/player/player.component.ts] — AC7 violated: `syncDisabled` early-return in the `'pause'` listener prevents `saveProgress()` from firing when the audio sidecar has errored; fix: move `this.saveProgress()` before the `if (this.syncDisabled) return` guard, or add a separate unconditional pause listener for progress
- [x] [Review][Patch] TV storage key emits `sundefined:eundefined` when `seasonNum`/`episodeNum` is absent or season/episode=0 [apps/frontend/src/app/player/player.component.ts:buildProgressContext] — `|| undefined` falsy coercion drops TMDB season/episode 0 (Specials) and any missing param; `saveProgress()` has no guard before building the key string; fix: use `isNaN(n) ? undefined : n` and guard TV saves when `seasonNum`/`episodeNum` are undefined
- [x] [Review][Patch] Falsy coercion `|| null` / `|| undefined` on all parsed integers — `year`, `season`, `episode` use `parseInt(...) || null/undefined`; this misclassifies value `0` as absent; fix: `const y = parseInt(..., 10); year: isNaN(y) ? null : y` (same pattern for season/episode)
- [x] [Review][Patch] `readAll()` and `saveEntry()` do not validate parsed JSON is a plain object [apps/frontend/src/app/services/watch-progress.service.ts] — if stored value is an array or scalar, `Object.values()` in callers behaves incorrectly; fix: add `if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};` after JSON.parse in both methods
- [x] [Review][Defer] Double `saveProgress()` call on navigate away (ngOnDestroy + preceding video `pause` event) [apps/frontend/src/app/player/player.component.ts] — deferred, pre-existing
- [x] [Review][Defer] `readAll()` called twice per home load in `buildProgressData()` and `readContinueWatchingFromStorage()` [apps/frontend/src/app/home/home.component.ts] — deferred, pre-existing

## Dev Notes

### Critical Design: Why `WatchProgressService` is Necessary

`home.component.ts` already exports `WATCH_PROGRESS_KEY`, `WatchProgressEntry`, and `WatchProgressRecord`. The player needs these same types and constant to write compatible entries. Importing from `home.component.ts` into `player.component.ts` creates an illegal backwards dependency (sibling route components should not import each other). Therefore, a shared `WatchProgressService` is REQUIRED to hold the schema.

### Existing localStorage Read Infrastructure (DO NOT BREAK)

`home.component.ts` currently reads all progress using:
1. `buildProgressData()` → `Map<string, WatchProgressEntry>` keyed by `${entry.mediaType}:${entry.id}` — used for `getProgressPercent()` and `isWatched()` on poster grids
2. `readContinueWatchingFromStorage()` → `ContinueWatchingItem[]` — filters out `watched` entries, sorts by `updatedAt` DESC — used for "Continue Watching" section

Both must continue to work identically after the refactor. The `WatchProgressService.readAll()` replaces direct `localStorage.getItem(WATCH_PROGRESS_KEY)` calls. The validation logic (`isValidProgressEntry`) stays in `home.component.ts` (it's home's business logic for filtering display items).

### localStorage Data Schema

Storage key: `cineplex_progress` (the `WATCH_PROGRESS_KEY` constant)

Value: JSON-stringified `WatchProgressRecord = Record<string, WatchProgressEntry>`

`WatchProgressEntry` interface (FINAL — do not invent new fields beyond these):
```typescript
export interface WatchProgressEntry {
  position: number;       // seconds (float), video.currentTime
  duration: number;       // seconds (float), video.duration
  watched: boolean;       // false when writing from player; story 6-3 sets to true
  updatedAt: number;      // Date.now() epoch ms
  mediaType: 'movie' | 'tv';
  id: number;             // movieId (movie) or showId/tmdb_id (tv) — home groups by this
  title: string;
  posterUrl: string | null;
  year: number | null;
  fileId: number;         // media_files.id (used for play route and Continue Watching links)
  tier: number | null;    // transcode tier (for player route queryParam)
  seasonNum?: number;     // TV only — season number
  episodeNum?: number;    // TV only — episode number
}
```

Storage keys within `WatchProgressRecord`:
- Movie: `"movie:42"` where `42` is `MovieDetail.id` (the movie's library metadata ID)
- TV episode: `"tv:7:s2:e3"` where `7` is `ShowDetail.id` (tmdb_id), `s2` = season 2, `e3` = episode 3

**TV "last watched episode" tracking:** The home component handles this automatically — since all TV episodes for the same show share `entry.id = showId`, `readContinueWatchingFromStorage()` groups by `${mediaType}:${id}` and picks the entry with the highest `updatedAt`. No separate "last episode" key is needed.

### Query Params Design

The player receives context via URL query params (no extra HTTP calls, satisfying "no server calls" for localStorage). Param names and sources:

| Param | Type | Movie source | TV source |
|---|---|---|---|
| `tier` | string→number | `MovieDetail.tier` | `EpisodeItem.tier` |
| `mediaType` | `'movie'\|'tv'` | hardcoded `'movie'` | hardcoded `'tv'` |
| `mediaId` | string→number | `MovieDetail.id` | `ShowDetail.id` |
| `season` | string→number | absent | `SeasonInfo.season_number` |
| `episode` | string→number | absent | `EpisodeItem.episode_number` |
| `title` | string | `MovieDetail.title` | `ShowDetail.title` |
| `year` | string→number\|null | `MovieDetail.year` | `ShowDetail.year` |
| `posterUrl` | string\|null | `MovieDetail.poster_url` | `ShowDetail.poster_url` |

**Poster URL length warning:** TMDB poster URLs can be long. URL query params have no strict browser length limit for navigation, but keep in mind Angular's `RouterLink` URL-encodes param values. This is fine.

### Player Route and Existing Params

Current player route: `/play/:fileId?tier=N`

After this story: `/play/:fileId?tier=N&mediaType=movie&mediaId=42&title=...&year=2010&posterUrl=https://...`

The `tier` param already used in `PlayerComponent` via `route.snapshot.queryParamMap.get('tier') === '2'` — **do not change** this existing reading.

### Deriving `progressContext` in `PlayerComponent`

```typescript
// In constructor, after existing param reads:
private readonly progressContext = this.buildProgressContext();

private buildProgressContext(): ProgressContext | null {
  const qp = this.route.snapshot.queryParamMap;
  const mediaType = qp.get('mediaType') as 'movie' | 'tv' | null;
  if (mediaType !== 'movie' && mediaType !== 'tv') return null;

  const mediaId = parseInt(qp.get('mediaId') ?? '', 10);
  if (isNaN(mediaId)) return null;

  const tier = parseInt(qp.get('tier') ?? '', 10);

  return {
    mediaType,
    id: mediaId,
    title: qp.get('title') ?? 'Unknown',
    year: parseInt(qp.get('year') ?? '', 10) || null,
    posterUrl: qp.get('posterUrl'),
    tier: isNaN(tier) ? null : tier,
    seasonNum: mediaType === 'tv' ? (parseInt(qp.get('season') ?? '', 10) || undefined) : undefined,
    episodeNum: mediaType === 'tv' ? (parseInt(qp.get('episode') ?? '', 10) || undefined) : undefined,
  };
}
```

Define a `ProgressContext` interface locally in `player.component.ts` (NOT exported — internal only):
```typescript
interface ProgressContext {
  mediaType: 'movie' | 'tv';
  id: number;
  title: string;
  year: number | null;
  posterUrl: string | null;
  tier: number | null;
  seasonNum?: number;
  episodeNum?: number;
}
```

### `saveProgress()` Implementation

```typescript
private saveProgress(): void {
  if (!this.progressContext) return;
  const video = this.videoElRef?.nativeElement;
  if (!video) return;
  const duration = video.duration;
  const position = video.currentTime;
  if (!duration || !isFinite(duration) || duration <= 0) return;
  if (position <= 0) return;

  const ctx = this.progressContext;
  const fileId = parseInt(this.fileId ?? '', 10);
  if (isNaN(fileId)) return;

  const storageKey =
    ctx.mediaType === 'movie'
      ? `movie:${ctx.id}`
      : `tv:${ctx.id}:s${ctx.seasonNum}:e${ctx.episodeNum}`;

  const entry: WatchProgressEntry = {
    position,
    duration,
    watched: false,   // story 6-3 handles marking watched
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

### `WatchProgressService.saveEntry()` Implementation

```typescript
saveEntry(storageKey: string, entry: WatchProgressEntry): void {
  try {
    const raw = localStorage.getItem(WATCH_PROGRESS_KEY);
    const record: WatchProgressRecord = raw ? (JSON.parse(raw) as WatchProgressRecord) : {};
    record[storageKey] = entry;
    localStorage.setItem(WATCH_PROGRESS_KEY, JSON.stringify(record));
  } catch {
    // localStorage may be unavailable (private browsing, storage quota, etc.) — silent no-op
  }
}
```

### Interval and Lifecycle

```typescript
private progressInterval: ReturnType<typeof setInterval> | null = null;

ngAfterViewInit(): void {
  // ... existing Tier 2 sync setup ...

  // Start periodic progress saving for ALL tiers
  if (this.progressContext && this.fileId) {
    this.progressInterval = setInterval(() => this.saveProgress(), 5000);
  }

  // For non-Tier 2: add pause listener for immediate save
  if (!this.isTier2) {
    this.addListener(
      this.videoElRef.nativeElement,
      'pause',
      () => this.saveProgress(),
    );
  }
  // For Tier 2: the existing 'pause' listener in the isTier2 block should ALSO call saveProgress()
  // Add saveProgress() call at the END of the existing Tier 2 'pause' handler
}

ngOnDestroy(): void {
  this.saveProgress();  // capture final position before teardown
  if (this.progressInterval !== null) {
    clearInterval(this.progressInterval);
    this.progressInterval = null;
  }
  // ... existing cleanup ...
}
```

**IMPORTANT:** The existing Tier 2 `'pause'` listener is registered inside the `if (this.isTier2)` block. Add `this.saveProgress()` at the END of that handler's body. The non-Tier 2 `'pause'` listener is NEW and goes in the `if (!this.isTier2)` block (or unconditionally after the isTier2 block).

### Listener Registration Pattern (Existing — Must Follow)

The player uses `this.addListener(el, event, handler)` which adds the listener AND pushes to `this.listeners` for cleanup in `ngOnDestroy`. Use this same pattern for the new non-Tier 2 pause listener:
```typescript
this.addListener(this.videoElRef.nativeElement, 'pause', () => this.saveProgress());
```

### Continue Watching Play Links — Template Example

In `home.component.html`, the current Continue Watching `<a>` uses:
```html
[queryParams]="{ tier: item.tier }"
```

Replace with:
```html
[queryParams]="{
  tier: item.tier,
  mediaType: item.mediaType,
  mediaId: item.id,
  season: item.seasonNum,
  episode: item.episodeNum,
  title: item.title,
  year: item.year,
  posterUrl: item.posterUrl
}"
```

`item.seasonNum` and `item.episodeNum` will be `undefined` for movies — Angular's `RouterLink` omits `undefined` query params automatically (no trailing `&season=undefined`).

### Show-Detail Template — Accessing Show-Level Data from Inside `@for`

The show-detail template iterates `@for (s of show().seasons)` and then `@for (ep of s.episodes)`. To pass `show().id`, `show().title`, etc. alongside the episode's `tier`, `season_number`, and `episode_number`, use `show()` directly in the inner loop — Angular evaluates signal calls in template expressions each time:

```html
[queryParams]="{
  tier: ep.tier,
  mediaType: 'tv',
  mediaId: show().id,
  season: s.season_number,
  episode: ep.episode_number,
  title: show().title,
  year: show().year,
  posterUrl: show().poster_url
}"
```

The `show()` signal is available in the template. However, **check how `show` is exposed** in `show-detail.component.ts`:
```typescript
readonly show = toSignal(..., { initialValue: null as ShowDetail | null });
```
The template uses `@let m = movie()` (for movie-detail) and similar. Check `show-detail.component.html` to see if it uses `@let showData = show()` or accesses `show()` directly. Wrap in a null guard using `@if (show(); as s)` or `@let s = show()` pattern to avoid repeated null checks. **Read the full template before implementing** to use the correct variable names.

### Test Pattern (Mirror Existing Player Spec)

The player spec file is at `apps/frontend/src/app/player/player.component.spec.ts`. It uses:
- `TestBed.configureTestingModule` with component + `HttpClientTestingModule`
- Mocked `ActivatedRoute` with `{ snapshot: { paramMap, queryParamMap } }`
- Mocked `ElementRef` for `videoElRef`, `audioElRef`
- `spyOn(component as any, 'saveProgress')` for interval/pause tests

For the new `WatchProgressService` tests, provide a mock:
```typescript
const watchProgressSpy = jasmine.createSpyObj('WatchProgressService', ['saveEntry', 'readAll']);
providers: [{ provide: WatchProgressService, useValue: watchProgressSpy }]
```

Verify `saveEntry` was called with the correct key and a `WatchProgressEntry` matching the expected shape.

### Files to Create / Modify

| File | Action | Why |
|------|--------|-----|
| `apps/frontend/src/app/services/watch-progress.service.ts` | **CREATE** | Central schema + read/write for localStorage progress |
| `apps/frontend/src/app/services/watch-progress.service.spec.ts` | **CREATE** | Unit tests for service |
| `apps/frontend/src/app/home/home.component.ts` | **UPDATE** | Import types from service; use service for readAll(); enrich ContinueWatchingItem |
| `apps/frontend/src/app/home/home.component.html` | **UPDATE** | Pass full context params in Continue Watching play links |
| `apps/frontend/src/app/home/home.component.spec.ts` | **UPDATE** | Mock `WatchProgressService` instead of direct localStorage |
| `apps/frontend/src/app/player/player.component.ts` | **UPDATE** | Add context parsing, interval saving, pause saving |
| `apps/frontend/src/app/player/player.component.spec.ts` | **UPDATE** | Tests for progress saving logic |
| `apps/frontend/src/app/movie-detail/movie-detail.component.html` | **UPDATE** | Add context query params to Play link |
| `apps/frontend/src/app/show-detail/show-detail.component.html` | **UPDATE** | Add context query params to episode Play links |

**No backend changes required** — this story is entirely client-side.

### Existing State of the Player (from 5-5 implementation — do not break)

The player currently:
- Receives `fileId` from route param, `tier` from queryParam
- Makes 2 HTTP calls in constructor: `/api/media/${fileId}/subtitles` and `/api/media/${fileId}/audio-tracks`
- `ngAfterViewInit`: Tier 2 sync logic (RAF loop, play/pause/seek/volumechange/error listeners via `addListener()`)
- `ngOnDestroy`: calls `cancelSync()`, removes all listeners from `this.listeners`, pauses video/audio elements
- The `addListener` helper pushes to `this.listeners` array — **all new event listeners must use this helper** so they're cleaned up in `ngOnDestroy`

### Regression Risk Areas

- **Do not change** the existing `tier` query param reading (`route.snapshot.queryParamMap.get('tier') === '2'`)
- **Do not change** the Tier 2 sync loop — only add `this.saveProgress()` call inside the existing `'pause'` handler
- **Do not break** `home.component.ts`'s `isValidProgressEntry()` validation — the new `WatchProgressEntry` fields (`seasonNum`, `episodeNum`) are optional, so existing entries without them still pass validation
- **Do not break** the Continue Watching section rendering — only the `queryParams` binding changes, not the `routerLink`
- The `WatchProgressEntry.watched` field is always written as `false` by the player in this story — story 6-3 adds the logic to set it to `true`

### UX Requirements (from UX-DR5)

The poster grid progress bar (`.poster-grid__progress`) and watched indicator (`--watched` class) are driven by data already in `home.component.ts`. This story provides the write path — the home component will show the bar on next page load automatically. **No changes to CSS or poster grid rendering** — the progress indicators already exist from story 4-5.

### Project Structure Notes

- All frontend code is in `apps/frontend/src/app/`
- Services are in `apps/frontend/src/app/services/` — the new `watch-progress.service.ts` goes there
- Angular 17+ standalone components, Signals, OnPush throughout
- No Angular CDK, no NgRx — do not introduce them
- `WatchProgressService` should be `@Injectable({ providedIn: 'root' })` (same pattern as `LibraryService`)
- TypeScript strict mode is active — all params from `queryParamMap.get()` return `string | null`, parse them explicitly (parseInt, etc.)

### References

- Existing WatchProgressEntry/WATCH_PROGRESS_KEY: `apps/frontend/src/app/home/home.component.ts` (lines 12–40 approximately, exported constants/interfaces)
- Player component: `apps/frontend/src/app/player/player.component.ts` (full — implements Tier 2 sync, audio/subtitle selectors, addListener pattern)
- Library service interfaces: `apps/frontend/src/app/services/library.service.ts` (MovieDetail.id, ShowDetail.id, EpisodeItem.file_id, EpisodeItem.tier)
- Epic 6 story definitions: `_bmad-output/planning-artifacts/epics.md` (Epic 6, Story 6.1)
- UX progress bar design: UX-DR5 — "thin deep orange progress bar at poster bottom edge"
- Story 5-5 implementation (most recent completed story): `_bmad-output/implementation-artifacts/5-5-audio-track-selection-during-playback.md`

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.6 (GitHub Copilot)

### Debug Log References

### Completion Notes List

- Created `WatchProgressService` as single source of truth for localStorage progress schema (`WATCH_PROGRESS_KEY`, `WatchProgressEntry`, `WatchProgressRecord`, `saveEntry()`, `readAll()`)
- Refactored `home.component.ts` to inject and use `WatchProgressService`; re-exports types for backward compatibility
- Extended `WatchProgressEntry` with optional `seasonNum`/`episodeNum` fields; extended `ContinueWatchingItem` likewise
- Updated `home.component.html` Continue Watching links to pass full context query params
- Updated `movie-detail.component.html` Play link with `mediaType`, `mediaId`, `title`, `year`, `posterUrl` params
- Updated `show-detail.component.html` episode Play links with TV context params using outer `@if (show(); as s)` variable
- Added `buildProgressContext()` and `saveProgress()` to `PlayerComponent`; wired periodic interval (5s) and pause events for both Tier 2 and non-Tier 2
- Restructured `ngAfterViewInit` to handle both Tier 2 and non-Tier 2 code paths (removed early return)
- `ngOnDestroy` calls `saveProgress()` before teardown to capture final position
- 126 frontend tests pass (8 new service tests + 10 new player progress tests; all existing tests green)

### File List

- apps/frontend/src/app/services/watch-progress.service.ts (created)
- apps/frontend/src/app/services/watch-progress.service.spec.ts (created)
- apps/frontend/src/app/home/home.component.ts (updated)
- apps/frontend/src/app/home/home.component.html (updated)
- apps/frontend/src/app/home/home.component.spec.ts (updated)
- apps/frontend/src/app/player/player.component.ts (updated)
- apps/frontend/src/app/player/player.component.spec.ts (updated)
- apps/frontend/src/app/movie-detail/movie-detail.component.html (updated)
- apps/frontend/src/app/show-detail/show-detail.component.html (updated)

## Change Log

| Date | Change |
|------|--------|
| 2026-05-05 | Implemented story 6-1: WatchProgressService created; home/player/detail templates updated; progress interval and pause saving added to PlayerComponent |
