# Story 6.2: Resume Playback from Last Position

Status: ready-for-dev

## Story

As a viewer,
I want to resume a movie or episode exactly where I left off,
so that I don't have to remember or manually seek to my spot.

## Acceptance Criteria

1. Given the viewer has watch progress stored for a title, when the player opens, then playback starts from the saved position (not from the beginning).
2. For dual-element sync (Tier 2), both video and audio resume from the saved position in sync.
3. If the saved position is within the last 5% of duration (`position / duration >= 0.95`), playback starts from the beginning — the title was essentially completed.
4. The resume behavior is seamless — no prompt, no UI, no user action required. Seeking happens before the user perceives playback starting from 0.
5. If no progress entry exists for the title, or the stored duration is ≤ 0, or the stored position is ≤ 0, playback starts from the beginning normally.
6. If `progressContext` is null (missing `mediaType`/`mediaId` query params), resume is silently skipped (no error).
7. For TV shows where `seasonNum` or `episodeNum` are missing, resume is silently skipped.

## Tasks / Subtasks

- [ ] Task 1: Add `applyResumePosition()` to `PlayerComponent` (AC: #1–#7)
  - [ ] In `apps/frontend/src/app/player/player.component.ts`, add private method `applyResumePosition(): void`
  - [ ] Method derives storage key from `progressContext` using the same logic as `saveProgress()`:
    - Movies: `movie:${ctx.id}`
    - TV: `tv:${ctx.id}:s${ctx.seasonNum}:e${ctx.episodeNum}`
  - [ ] Method calls `this.watchProgressService.readAll()` to get all progress entries
  - [ ] Method looks up entry by derived storage key
  - [ ] Method returns early (no-op) if: `!progressContext`, TV missing season/episode, no entry, `entry.duration <= 0`, `entry.position <= 0`
  - [ ] Method returns early (no-op) if `entry.position / entry.duration >= 0.95` (last 5% → start from beginning)
  - [ ] Seek logic: if `video.readyState >= 1` (metadata loaded), set `video.currentTime = entry.position` immediately; otherwise add a one-time `loadedmetadata` listener that sets `video.currentTime = entry.position`
  - [ ] Use native `video.addEventListener('loadedmetadata', fn, { once: true })` — NOT `this.addListener()` — because this is a one-shot setup listener, not a lifecycle listener to clean up

- [ ] Task 2: Call `applyResumePosition()` in `ngAfterViewInit()` (AC: #1–#4)
  - [ ] At the very END of `ngAfterViewInit()`, after all event listeners are registered and after the `progressInterval` is started, call `this.applyResumePosition()`
  - [ ] Placing it last ensures the Tier 2 `seeked` listener is already registered before any seek fires

- [ ] Task 3: Write unit tests for resume behavior (AC: #1–#7)
  - [ ] Test: player seeks video to saved position when progress entry exists and position < 95% of duration
  - [ ] Test: player does NOT seek when saved `position / duration >= 0.95` (last 5%)
  - [ ] Test: player does NOT seek when no entry exists in localStorage for the title
  - [ ] Test: player does NOT seek when `progressContext` is null (no `mediaType` param)
  - [ ] Test: player does NOT seek when `entry.duration` is 0
  - [ ] Test: player does NOT seek when `entry.position` is 0
  - [ ] Test: player attaches `loadedmetadata` listener when `video.readyState < 1`
  - [ ] Test: player seeks immediately when `video.readyState >= 1`

## Dev Notes

### Critical Constraint: Single File Change

This story touches **exactly one source file**:
- `apps/frontend/src/app/player/player.component.ts` — add `applyResumePosition()` and call it

And **one spec file**:
- `apps/frontend/src/app/player/player.component.spec.ts` — add resume tests

No HTML, CSS, service, or other component changes are needed. The `WatchProgressService.readAll()` already exists and returns `WatchProgressRecord`. The `progressContext` already exists on the component with all needed fields.

### Existing Infrastructure to Reuse (DO NOT REINVENT)

**`progressContext`** — already built in `buildProgressContext()` from route query params. Available as `this.progressContext`. Null if `mediaType`/`mediaId` are missing or invalid. Contains: `{ mediaType, id, title, year, posterUrl, tier, seasonNum?, episodeNum? }`.

**`WatchProgressService.readAll()`** — returns `WatchProgressRecord = Record<string, WatchProgressEntry>`. Already injected as `this.watchProgressService`. Returns `{}` on any localStorage error.

**Storage key format** — MUST match exactly what `saveProgress()` writes:
- Movie: `` `movie:${ctx.id}` ``
- TV: `` `tv:${ctx.id}:s${ctx.seasonNum}:e${ctx.episodeNum}` ``

**`WatchProgressEntry`** interface (from `watch-progress.service.ts`):
```typescript
export interface WatchProgressEntry {
  position: number;       // seconds, video.currentTime when saved
  duration: number;       // seconds, video.duration when saved
  watched: boolean;
  updatedAt: number;
  mediaType: 'movie' | 'tv';
  id: number;
  title: string;
  posterUrl: string | null;
  year: number | null;
  fileId: number;
  tier: number | null;
  seasonNum?: number;
  episodeNum?: number;
}
```

**`this.addListener(el, event, handler)`** pattern — DO NOT use this for the `loadedmetadata` one-shot listener. `addListener` pushes to `this.listeners[]` for `ngOnDestroy` cleanup. A one-shot listener registered with `{ once: true }` self-removes and must NOT also be cleaned up in `ngOnDestroy` (double-remove is a no-op but avoids bloat). Use `video.addEventListener('loadedmetadata', fn, { once: true })` directly.

### `applyResumePosition()` — Complete Reference Implementation

```typescript
private applyResumePosition(): void {
  if (!this.progressContext) return;
  const ctx = this.progressContext;

  // Guard: TV requires both seasonNum and episodeNum (mirrors saveProgress guard)
  if (ctx.mediaType === 'tv' && (ctx.seasonNum == null || ctx.episodeNum == null)) return;

  const storageKey =
    ctx.mediaType === 'movie'
      ? `movie:${ctx.id}`
      : `tv:${ctx.id}:s${ctx.seasonNum}:e${ctx.episodeNum}`;

  const record = this.watchProgressService.readAll();
  const entry = record[storageKey];

  if (!entry || entry.duration <= 0 || entry.position <= 0) return;

  // If within last 5% of duration, start from beginning
  if (entry.position / entry.duration >= 0.95) return;

  const video = this.videoElRef.nativeElement;
  const seekToPosition = (): void => {
    video.currentTime = entry.position;
  };

  if (video.readyState >= 1) {
    // Metadata already loaded — seek immediately
    seekToPosition();
  } else {
    // Wait for metadata to load, then seek
    video.addEventListener('loadedmetadata', seekToPosition, { once: true });
  }
}
```

### Placement in `ngAfterViewInit()` — Must Be Last

```typescript
ngAfterViewInit(): void {
  const video = this.videoElRef.nativeElement;

  if (this.isTier2) {
    // ... all existing Tier 2 listeners (canplay, seeking, seeked, play, pause, volumechange, error) ...
  } else {
    // Non-Tier 2: save progress on pause
    this.addListener(video, 'pause', () => this.saveProgress());
  }

  // Start periodic progress saving for ALL tiers
  if (this.progressContext && this.fileId) {
    this.progressInterval = setInterval(() => this.saveProgress(), 5000);
  }

  // ✅ ADD AT THE END — after all listeners are registered:
  this.applyResumePosition();
}
```

### Tier 2 Audio Sync — Why No Extra Code Is Needed

The existing Tier 2 `seeked` listener already handles audio sync when the video is seeked to the resume position:

```typescript
this.addListener(video, 'seeked', () => {
  if (this.syncDisabled) return;
  audio.currentTime = video.currentTime;   // ← copies resume position to audio
  if (!video.paused) audio.play().catch(() => {});
});
```

Additionally, `tryStartSync()` runs when both `videoReady` and `audioReady` are true and sets `audio.currentTime = video.currentTime`, catching any case where audio wasn't ready during the initial `seeked` event.

**Sequence for Tier 2 resume (both ready at load time):**
1. `applyResumePosition()` adds `loadedmetadata` listener (or seeks immediately if ready)
2. Video `loadedmetadata` fires → `video.currentTime = savedPosition`
3. `seeking` event fires → audio paused (no-op if audio not playing yet)
4. `seeked` event fires → `audio.currentTime = video.currentTime = savedPosition`
5. `canplay` fires on video → `videoReady = true` → `tryStartSync()` called
6. `canplay` fires on audio → `audioReady = true` → `tryStartSync()` called → `audio.currentTime = video.currentTime = savedPosition` (confirmed sync), audio plays

**Result:** Both video and audio start from `savedPosition`. AC #2 satisfied.

### What Must Be Preserved (Do Not Break)

1. **`saveProgress()` interval** — the `progressInterval` started at the end of `ngAfterViewInit()` must remain. Do not remove or move it.
2. **Tier 2 canplay/seeked/pause listeners** — all existing sync logic must remain intact. Only ADD `applyResumePosition()` after everything else.
3. **Non-Tier 2 pause listener** — must remain: `this.addListener(video, 'pause', () => this.saveProgress())`.
4. **Storage key format** — MUST be byte-for-byte identical to what `saveProgress()` writes. The home component's Continue Watching navigation depends on this key format.
5. **5% threshold** — use `>=` comparison: `entry.position / entry.duration >= 0.95`. Values exactly at 95% start from beginning.

### Testing Pattern — Add to Existing Progress Saving `describe` Block

Tests go in `apps/frontend/src/app/player/player.component.spec.ts`, inside a new `describe('Resume from saved position', ...)` block. Use the existing `setup()` function with `extraQueryParams` for movie/TV context. The `watchProgressMock` already has `readAll` mocked to return `{}` by default — override it per-test.

```typescript
describe('Resume from saved position', () => {
  const movieQueryParams = {
    mediaType: 'movie',
    mediaId: '42',
    title: 'Test Movie',
    year: '2024',
    posterUrl: 'https://image.tmdb.org/t/p/w500/abc.jpg',
  };

  it('should seek video to saved position on load', () => {
    const fixture = setup('42', '1', [], [], movieQueryParams);
    const watchSvc = TestBed.inject(WatchProgressService) as any;
    watchSvc.readAll.mockReturnValue({
      'movie:42': { position: 300, duration: 3600, watched: false, updatedAt: Date.now(),
        mediaType: 'movie', id: 42, title: 'Test Movie', year: 2024,
        posterUrl: null, fileId: 42, tier: 1 }
    });
    const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
    // Simulate readyState >= 1 (metadata loaded)
    Object.defineProperty(video, 'readyState', { value: 1, configurable: true });
    Object.defineProperty(video, 'currentTime', { value: 0, writable: true, configurable: true });

    const component = fixture.componentInstance as any;
    component.applyResumePosition();

    expect(video.currentTime).toBe(300);
  });

  it('should NOT seek when position is in last 5% of duration', () => {
    const fixture = setup('42', '1', [], [], movieQueryParams);
    const watchSvc = TestBed.inject(WatchProgressService) as any;
    watchSvc.readAll.mockReturnValue({
      'movie:42': { position: 3420, duration: 3600, watched: false, updatedAt: Date.now(),
        mediaType: 'movie', id: 42, title: 'Test Movie', year: 2024,
        posterUrl: null, fileId: 42, tier: 1 }
    });
    const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'readyState', { value: 1, configurable: true });
    Object.defineProperty(video, 'currentTime', { value: 0, writable: true, configurable: true });

    const component = fixture.componentInstance as any;
    component.applyResumePosition();

    // 3420/3600 = 0.95 → exactly at threshold → start from beginning
    expect(video.currentTime).toBe(0);
  });

  it('should NOT seek when no progress entry exists', () => {
    const fixture = setup('42', '1', [], [], movieQueryParams);
    // readAll returns {} by default (no entry for this title)
    const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'currentTime', { value: 0, writable: true, configurable: true });

    const component = fixture.componentInstance as any;
    component.applyResumePosition();

    expect(video.currentTime).toBe(0);
  });

  it('should NOT seek when progressContext is null (no mediaType param)', () => {
    // setup with no extraQueryParams → progressContext is null
    const fixture = setup('42', '1');
    const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'currentTime', { value: 0, writable: true, configurable: true });

    const component = fixture.componentInstance as any;
    component.applyResumePosition();

    expect(video.currentTime).toBe(0);
  });

  it('should NOT seek when entry.duration is 0', () => {
    const fixture = setup('42', '1', [], [], movieQueryParams);
    const watchSvc = TestBed.inject(WatchProgressService) as any;
    watchSvc.readAll.mockReturnValue({
      'movie:42': { position: 300, duration: 0, watched: false, updatedAt: Date.now(),
        mediaType: 'movie', id: 42, title: 'Test Movie', year: 2024,
        posterUrl: null, fileId: 42, tier: 1 }
    });
    const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'currentTime', { value: 0, writable: true, configurable: true });

    const component = fixture.componentInstance as any;
    component.applyResumePosition();

    expect(video.currentTime).toBe(0);
  });

  it('should NOT seek when entry.position is 0', () => {
    const fixture = setup('42', '1', [], [], movieQueryParams);
    const watchSvc = TestBed.inject(WatchProgressService) as any;
    watchSvc.readAll.mockReturnValue({
      'movie:42': { position: 0, duration: 3600, watched: false, updatedAt: Date.now(),
        mediaType: 'movie', id: 42, title: 'Test Movie', year: 2024,
        posterUrl: null, fileId: 42, tier: 1 }
    });
    const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'currentTime', { value: 0, writable: true, configurable: true });

    const component = fixture.componentInstance as any;
    component.applyResumePosition();

    expect(video.currentTime).toBe(0);
  });

  it('should attach loadedmetadata listener when readyState < 1', () => {
    const fixture = setup('42', '1', [], [], movieQueryParams);
    const watchSvc = TestBed.inject(WatchProgressService) as any;
    watchSvc.readAll.mockReturnValue({
      'movie:42': { position: 300, duration: 3600, watched: false, updatedAt: Date.now(),
        mediaType: 'movie', id: 42, title: 'Test Movie', year: 2024,
        posterUrl: null, fileId: 42, tier: 1 }
    });
    const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'readyState', { value: 0, configurable: true });
    Object.defineProperty(video, 'currentTime', { value: 0, writable: true, configurable: true });

    const component = fixture.componentInstance as any;
    component.applyResumePosition();

    // currentTime not yet changed (waiting for loadedmetadata)
    expect(video.currentTime).toBe(0);

    // Fire loadedmetadata → seek should happen
    video.dispatchEvent(new Event('loadedmetadata'));
    expect(video.currentTime).toBe(300);
  });

  it('should seek immediately when readyState >= 1', () => {
    const fixture = setup('42', '1', [], [], movieQueryParams);
    const watchSvc = TestBed.inject(WatchProgressService) as any;
    watchSvc.readAll.mockReturnValue({
      'movie:42': { position: 600, duration: 3600, watched: false, updatedAt: Date.now(),
        mediaType: 'movie', id: 42, title: 'Test Movie', year: 2024,
        posterUrl: null, fileId: 42, tier: 1 }
    });
    const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'readyState', { value: 2, configurable: true });
    Object.defineProperty(video, 'currentTime', { value: 0, writable: true, configurable: true });

    const component = fixture.componentInstance as any;
    component.applyResumePosition();

    expect(video.currentTime).toBe(600);
  });
});
```

**Note on `vi.fn()` vs `jasmine.createSpyObj()`:** The project uses **Vitest** (not Jasmine). The existing spec uses `vi.fn()` and `vi.spyOn()`. The `watchProgressMock` in the `setup()` function uses `{ saveEntry: vi.fn(), readAll: vi.fn().mockReturnValue({}) }`. To override `readAll` in a specific test: `watchSvc.readAll.mockReturnValue({ ... })`. Make sure to inject `WatchProgressService` via `TestBed.inject(WatchProgressService)` to get the mock instance.

### Files to Create / Modify

| File | Action | Why |
|------|--------|-----|
| `apps/frontend/src/app/player/player.component.ts` | **UPDATE** | Add `applyResumePosition()` and call it at end of `ngAfterViewInit()` |
| `apps/frontend/src/app/player/player.component.spec.ts` | **UPDATE** | Add `describe('Resume from saved position')` block with 8 tests |

**No other files change.** Not the service, not the HTML, not any other component.

### Project Structure Reference

- Frontend root: `apps/frontend/src/app/`
- Player component: `apps/frontend/src/app/player/player.component.ts`
- Player spec: `apps/frontend/src/app/player/player.component.spec.ts`
- Watch progress service: `apps/frontend/src/app/services/watch-progress.service.ts`
- Testing framework: **Vitest** (not Jasmine) — use `vi.fn()`, `vi.spyOn()`, not `jasmine.*`

### Previous Story Learnings (From Story 6-1)

1. **The `addListener()` pattern** — use `this.addListener(el, event, handler)` for lifecycle-managed listeners. Do NOT use it for one-shot listeners with `{ once: true }`.
2. **`progressContext` is null** when `mediaType`/`mediaId` are absent — always guard with `if (!this.progressContext) return`.
3. **TV guard for seasonNum/episodeNum** — the storage key breaks without them. Guard with `if (ctx.mediaType === 'tv' && (ctx.seasonNum == null || ctx.episodeNum == null)) return`.
4. **`isNaN` checks** — use `isNaN(n) ? default : n` pattern, not `n || default` (which wrongly treats 0 as absent).
5. **WatchProgressService is already injected** — `this.watchProgressService` is available. Do not inject it again.
6. **Storage key must match exactly** — `saveProgress()` uses the same key derivation. `applyResumePosition()` must be identical.
7. **The 5% threshold** — use `>=` not `>`. Exactly at 95% → start from beginning. This prevents "almost done" titles from getting a resume prompt.

### Review Findings (N/A — Story Not Yet Implemented)

None.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.6

### Debug Log References

### Completion Notes List

### File List
