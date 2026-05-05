# Story 5.4: Subtitle Track Selection During Playback

Status: ready-for-dev

## Story

As a viewer,
I want to select from available subtitle tracks while watching,
so that I can watch foreign films or use subtitles when needed.

## Acceptance Criteria

1. Given the current title has WebVTT subtitle files available, when the viewer opens the subtitle selector during playback, then available subtitle tracks are listed with their language labels.
2. The viewer can select a track, which loads the WebVTT file via `<track>` element.
3. The viewer can turn subtitles off.
4. Subtitle selection takes effect immediately without interrupting playback.
5. The subtitle selector is accessible (keyboard navigable, labeled).

## Tasks / Subtasks

- [ ] Task 1: Add backend endpoint to list subtitles for a file (AC: #1)
  - [ ] Add `getSubtitlesForFile(fileId)` method to `MediaService` — queries subtitles table for given `media_file_id` where `webvtt_path IS NOT NULL`, returns `Array<{ id, language }>`
  - [ ] Add `GET /api/media/:fileId/subtitles` route to `MediaController` — returns array of available subtitle tracks
  - [ ] Write unit test for the new endpoint (empty array, populated array, invalid fileId)
- [ ] Task 2: Fetch subtitle tracks in PlayerComponent (AC: #1)
  - [ ] Inject `HttpClient` in PlayerComponent
  - [ ] On init, call `GET /api/media/${fileId}/subtitles` to fetch available tracks
  - [ ] Store result in `subtitleTracks` signal (type: `Array<{ id: number; language: string | null }>`)
  - [ ] Handle fetch error gracefully (empty tracks, no selector shown)
- [ ] Task 3: Add `<track>` elements to the video (AC: #2, #4)
  - [ ] For each subtitle track, render a `<track kind="subtitles" [src]="..." [srclang]="..." [label]="...">` inside the `<video>` element
  - [ ] Track `src` = `/api/media/subtitles/${track.id}`
  - [ ] Track `srclang` = `track.language || 'und'`
  - [ ] Track `label` = human-readable language name (use a simple ISO 639 → name mapping utility)
  - [ ] All tracks start with `mode = 'disabled'` (no `default` attribute)
- [ ] Task 4: Build subtitle selector UI (AC: #1, #3, #5)
  - [ ] Add a "CC" button in the player UI (positioned bottom-right area, above native controls)
  - [ ] On click, toggle a dropdown/menu listing available tracks + "Off" option
  - [ ] Highlight the currently active track (or "Off" if none active)
  - [ ] Add `aria-label="Subtitle selector"` on the button
  - [ ] Add `role="menu"` on the dropdown, `role="menuitemradio"` on each option
  - [ ] Support keyboard: Enter/Space to toggle menu, arrow keys to navigate options, Escape to close
- [ ] Task 5: Implement track selection logic (AC: #2, #3, #4)
  - [ ] When user selects a track: set that track's `TextTrack.mode = 'showing'`, set all others to `'disabled'`
  - [ ] When user selects "Off": set all tracks to `mode = 'disabled'`
  - [ ] Close the dropdown after selection
  - [ ] Update `activeSubtitleId` signal to reflect current selection (or `null` for off)
  - [ ] Selection must NOT pause/restart video (no playback interruption)
- [ ] Task 6: Style the subtitle selector (AC: #5)
  - [ ] Style CC button: semi-transparent background, white text, hover/focus states
  - [ ] Style dropdown: dark background with light text, scrollable if many tracks
  - [ ] Active track has visual indicator (e.g. checkmark or highlight)
  - [ ] Ensure sufficient contrast ratios for accessibility
  - [ ] Position absolutely above the video controls area
- [ ] Task 7: Handle edge cases
  - [ ] If no subtitle tracks available, do NOT render the CC button at all
  - [ ] If subtitle fetch fails (network error), do NOT render CC button
  - [ ] Close dropdown when clicking outside
  - [ ] Close dropdown on Escape key
  - [ ] Dual-element mode (Tier 2): `<track>` elements go inside the `<video #videoEl>` element (subtitles render on the video, not the audio)
- [ ] Task 8: Write unit tests (AC: all)
  - [ ] Test: CC button hidden when no subtitle tracks available
  - [ ] Test: CC button visible when subtitle tracks available
  - [ ] Test: Dropdown opens on CC button click
  - [ ] Test: Track list renders correct labels
  - [ ] Test: Selecting a track sets TextTrack.mode to 'showing'
  - [ ] Test: Selecting "Off" sets all TextTrack.mode to 'disabled'
  - [ ] Test: `<track>` elements rendered with correct src and srclang
  - [ ] Test: Dropdown closes after selection
  - [ ] Test: Keyboard navigation (Escape closes, Enter selects)
  - [ ] Test: No subtitle fetch when fileId is missing

## Dev Notes

### Architecture & Design Decisions

**Subtitle data fetching approach:** Add a new endpoint `GET /api/media/:fileId/subtitles` to `MediaController`. This is preferred over:

- Passing data via query params (subtitle tracks are complex objects, unsuitable for URL encoding)
- Using the existing `GET /api/library/files/:id` endpoint (returns too much admin data, wrong controller concern)
- Re-fetching full MovieDetail/ShowDetail in the player (wasteful, and ShowDetail doesn't include per-episode subtitles)

The new endpoint returns only ready subtitles (`webvtt_path IS NOT NULL`), keeping the response minimal. This approach works universally for both movies and TV episodes without any special-casing.

**Why a custom subtitle selector (not native browser CC controls):**

- Native CC button appearance/behavior varies significantly across browsers
- Chrome shows CC button only when tracks have `default` attribute or user has manually enabled them
- Firefox doesn't show CC button at all for track elements without `default`
- Safari has its own UI that doesn't match the app design
- A custom selector provides consistent UX across all browsers and matches the dark player theme

**TextTrack mode API (not DOM manipulation):**

- Use `video.textTracks[i].mode = 'showing' | 'disabled'` to control visibility
- Do NOT remove/add `<track>` elements dynamically (causes flicker and potential reloads)
- All tracks are rendered at once; only mode changes
- `'disabled'` (not `'hidden'`) ensures the track data is not loaded until needed

**Language label display:** Use a minimal mapping for common ISO 639-1/639-2 codes to human-readable names:

```typescript
const LANG_NAMES: Record<string, string> = {
  en: "English",
  eng: "English",
  fr: "French",
  fre: "French",
  fra: "French",
  es: "Spanish",
  spa: "Spanish",
  de: "German",
  ger: "German",
  deu: "German",
  it: "Italian",
  ita: "Italian",
  ja: "Japanese",
  jpn: "Japanese",
  ko: "Korean",
  kor: "Korean",
  zh: "Chinese",
  chi: "Chinese",
  zho: "Chinese",
  pt: "Portuguese",
  por: "Portuguese",
  ru: "Russian",
  rus: "Russian",
  ar: "Arabic",
  ara: "Arabic",
  hi: "Hindi",
  hin: "Hindi",
  nl: "Dutch",
  dut: "Dutch",
  nld: "Dutch",
  sv: "Swedish",
  swe: "Swedish",
  no: "Norwegian",
  nor: "Norwegian",
  da: "Danish",
  dan: "Danish",
  fi: "Finnish",
  fin: "Finnish",
  pl: "Polish",
  pol: "Polish",
  und: "Unknown",
};
```

If language is null or not in the map, display "Track N" (1-indexed). Keep this utility as a private method or const in the component — no need for a shared service.

**Subtitle selector position:** The CC button sits in the player UI overlay, NOT inside native controls. Position it bottom-right, with enough margin to avoid overlapping native controls. Use absolute positioning within the player container.

### Critical Implementation Details

**New backend endpoint:**

```typescript
// media.controller.ts — new route
@Get(':fileId/subtitles')
getSubtitlesForFile(
  @Param('fileId', ParseIntPipe) fileId: number,
): Array<{ id: number; language: string | null }> {
  return this.mediaService.getSubtitlesForFile(fileId);
}

// media.service.ts — new method
getSubtitlesForFile(fileId: number): Array<{ id: number; language: string | null }> {
  const db = this.database.getDatabase();
  const rows = db
    .prepare(
      `SELECT id, language
       FROM subtitles
       WHERE media_file_id = ? AND webvtt_path IS NOT NULL
       ORDER BY id ASC`,
    )
    .all(fileId) as Array<{ id: number; language: string | null }>;
  return rows;
}
```

**IMPORTANT route ordering in MediaController:** The new route `GET :fileId/subtitles` conflicts with the existing `GET subtitles/:subtitleId` route. NestJS matches routes top-to-bottom. The existing `@Get('subtitles/:subtitleId')` is a literal prefix `subtitles/` so it won't conflict with `@Get(':fileId/subtitles')`. However, to be safe, define the routes in this order:

1. `@Get('stream/:fileId')` (existing)
2. `@Get('stream/:fileId/audio')` (existing)
3. `@Get('subtitles/:subtitleId')` (existing)
4. `@Get(':fileId/subtitles')` (NEW — must come AFTER literal prefix routes)

**Player template with subtitle tracks:**

```html
@if (isTier2) {
<video
  #videoEl
  class="player-video"
  [src]="videoSrc"
  muted
  autoplay
  controls
  preload="auto"
>
  @for (track of subtitleTracks(); track track.id) {
  <track
    kind="subtitles"
    [src]="'/api/media/subtitles/' + track.id"
    [srclang]="track.language || 'und'"
    [label]="getTrackLabel(track)"
  />
  }
</video>
<audio #audioEl [src]="audioSrc" preload="auto"></audio>
} @else {
<video
  #videoEl
  class="player-video"
  [src]="videoSrc"
  autoplay
  controls
  preload="auto"
>
  @for (track of subtitleTracks(); track track.id) {
  <track
    kind="subtitles"
    [src]="'/api/media/subtitles/' + track.id"
    [srclang]="track.language || 'und'"
    [label]="getTrackLabel(track)"
  />
  }
</video>
}

<!-- Subtitle selector overlay -->
@if (subtitleTracks().length > 0) {
<div class="subtitle-controls">
  <button
    type="button"
    class="cc-button"
    [class.cc-button--active]="activeSubtitleId() !== null"
    (click)="toggleSubtitleMenu()"
    aria-label="Subtitle selector"
    [attr.aria-expanded]="subtitleMenuOpen()"
  >
    CC
  </button>
  @if (subtitleMenuOpen()) {
  <div class="subtitle-menu" role="menu" (keydown)="onMenuKeydown($event)">
    <button
      type="button"
      role="menuitemradio"
      [attr.aria-checked]="activeSubtitleId() === null"
      (click)="selectSubtitle(null)"
      class="subtitle-menu__item"
      [class.subtitle-menu__item--active]="activeSubtitleId() === null"
    >
      Off
    </button>
    @for (track of subtitleTracks(); track track.id) {
    <button
      type="button"
      role="menuitemradio"
      [attr.aria-checked]="activeSubtitleId() === track.id"
      (click)="selectSubtitle(track.id)"
      class="subtitle-menu__item"
      [class.subtitle-menu__item--active]="activeSubtitleId() === track.id"
    >
      {{ getTrackLabel(track) }}
    </button>
    }
  </div>
  }
</div>
}
```

**IMPORTANT: `#videoEl` ViewChild in both branches.** In Story 5.3, only the Tier 2 branch had `#videoEl`. For subtitle track access, BOTH branches need `#videoEl` so the TextTrack API is accessible regardless of tier. Update the standard mode `<video>` to also have `#videoEl`.

**Track selection logic:**

```typescript
selectSubtitle(trackId: number | null): void {
  const video = this.videoElRef?.nativeElement;
  if (!video) return;

  const textTracks = video.textTracks;
  for (let i = 0; i < textTracks.length; i++) {
    textTracks[i].mode = 'disabled';
  }

  if (trackId !== null) {
    // Find the track by matching subtitle ID from our data
    const trackIndex = this.subtitleTracks().findIndex(t => t.id === trackId);
    if (trackIndex >= 0 && textTracks[trackIndex]) {
      textTracks[trackIndex].mode = 'showing';
    }
  }

  this.activeSubtitleId.set(trackId);
  this.subtitleMenuOpen.set(false);
}
```

**Keyboard handling for accessibility:**

```typescript
onMenuKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    this.subtitleMenuOpen.set(false);
    // Return focus to CC button
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    // Move focus between menu items
    const items = (event.currentTarget as HTMLElement).querySelectorAll('[role="menuitemradio"]');
    const focused = document.activeElement;
    const currentIndex = Array.from(items).indexOf(focused as Element);
    const next = event.key === 'ArrowDown'
      ? (currentIndex + 1) % items.length
      : (currentIndex - 1 + items.length) % items.length;
    (items[next] as HTMLElement).focus();
  }
}
```

**Close on outside click:**

```typescript
// In ngAfterViewInit or constructor:
@HostListener('document:click', ['$event'])
onDocumentClick(event: MouseEvent): void {
  if (this.subtitleMenuOpen() && !this.subtitleControlsContains(event.target)) {
    this.subtitleMenuOpen.set(false);
  }
}
```

Actually, since the component uses OnPush and standalone, prefer a manual listener approach or use the template `(clickOutside)` pattern. Simplest: check in `toggleSubtitleMenu()` and use a `document:click` listener added/removed when menu opens/closes.

**New imports needed in PlayerComponent:**

- `HttpClient` from `@angular/common/http`
- `signal` from `@angular/core`
- `toSignal` or manual subscription for the HTTP call

**Signals to add:**

```typescript
subtitleTracks = signal<Array<{ id: number; language: string | null }>>([]);
activeSubtitleId = signal<number | null>(null);
subtitleMenuOpen = signal<boolean>(false);
```

**HTTP fetch (in constructor or ngOnInit):**

```typescript
private readonly http = inject(HttpClient);

constructor() {
  if (this.fileId) {
    this.http.get<Array<{ id: number; language: string | null }>>(
      `/api/media/${this.fileId}/subtitles`
    ).subscribe({
      next: (tracks) => this.subtitleTracks.set(tracks),
      error: () => this.subtitleTracks.set([]),
    });
  }
}
```

### Project Structure Notes

**Files to MODIFY:**

```
apps/backend/src/media/media.controller.ts    ← Add GET /:fileId/subtitles route
apps/backend/src/media/media.service.ts       ← Add getSubtitlesForFile() method
apps/frontend/src/app/player/player.component.ts    ← Add subtitle fetch, selection, signals, menu logic
apps/frontend/src/app/player/player.component.html  ← Add <track> elements + subtitle selector UI
apps/frontend/src/app/player/player.component.css   ← Add CC button + dropdown styles
apps/frontend/src/app/player/player.component.spec.ts ← Add subtitle tests
```

**No new files needed.** No new Angular modules, services, or components.

**New dependency in PlayerComponent:** `HttpClient` — must add `provideHttpClient()` to test providers if not already present.

### Testing Standards

- Use Angular TestBed with standalone component testing (same pattern as Story 5.2/5.3)
- Mock `HttpClient` using `provideHttpClient()` + `HttpTestingController` from `@angular/common/http/testing`
- Mock subtitle endpoint response: `[{ id: 1, language: 'en' }, { id: 2, language: 'fr' }]`
- Test CC button visibility based on subtitle track availability
- Test dropdown open/close behavior
- Test TextTrack mode changes on selection
- Test keyboard navigation (Escape closes menu, arrow keys navigate)
- Do NOT test actual WebVTT rendering (browser engine concern)
- Do NOT test subtitle content parsing

### What NOT To Do (Anti-Patterns)

- Do NOT use `@angular/cdk` for the dropdown (project convention: no CDK)
- Do NOT build a full custom video player or override native controls for play/pause/seek
- Do NOT fetch MovieDetail/ShowDetail in the player — use the dedicated subtitle endpoint
- Do NOT add audio track selection — that's Story 5.5
- Do NOT add watch progress tracking — that's Epic 6
- Do NOT use a third-party subtitle rendering library
- Do NOT add the `default` attribute to any `<track>` element (all start disabled)
- Do NOT dynamically create/remove `<track>` DOM elements on selection (use TextTrack.mode instead)
- Do NOT block video playback while subtitle fetch is in progress (fire and forget)
- Do NOT add loading indicators for subtitle fetch
- Do NOT modify the existing subtitle serving endpoint (`GET /api/media/subtitles/:subtitleId`)
- Do NOT pass subtitle data as query parameters from detail pages

### Previous Story Intelligence (5-3)

**What was established in Story 5.3:**

- PlayerComponent uses `ViewChild` with `ElementRef` for video/audio element refs
- `AfterViewInit`/`OnDestroy` lifecycle hooks for DOM interaction
- `inject()` function style for DI (ActivatedRoute, Location)
- Event listeners managed via `addListener()` helper with cleanup in `ngOnDestroy`
- Conditional template using `@if (isTier2)` with two separate `<video>` elements
- `#videoEl` template ref only on the Tier 2 video — **THIS MUST CHANGE for subtitles** (need ref on both)
- `isMirroring` flag pattern for preventing event feedback loops
- `syncDisabled` flag for graceful degradation on audio error

**What was fixed in review:**

- Unhandled `audio.play()` promise rejections → added `.catch(() => {})`
- `canplay` may fire before listeners → added `readyState >= 3` check
- Audio error fallback leaves stale listeners → added `syncDisabled` flag

**Patterns to maintain:**

- `standalone: true`, `ChangeDetectionStrategy.OnPush`
- `inject()` function style (not constructor injection)
- Co-located spec file
- Minimal code, no over-engineering
- Clean lifecycle cleanup in `ngOnDestroy`

**What changes in this story:**

- Add `#videoEl` to the standard mode video element (needed for TextTrack access)
- Add `HttpClient` injection (first network call from PlayerComponent)
- Add Angular signals for reactive subtitle state
- Add `<track>` elements inside both video branches
- Add subtitle selector overlay UI

### Git Intelligence

**Recent commit pattern:** Short, focused commits (e.g., "implement story 5-3", "Fix audio stutter"). Follow same style.

**Key file changes in last commits:**

- `player.component.ts` — most recently modified for dual-element sync
- `player.component.html` — conditional template with `@if (isTier2)`
- `movie-detail.component.html` / `show-detail.component.html` — added tier query params

### Backend Context (Existing Infrastructure)

**Subtitle serving endpoint (already exists, no changes needed):**

- `GET /api/media/subtitles/:subtitleId` — serves WebVTT file with `Content-Type: text/vtt`
- Returns `StreamableFile` with `createReadStream`
- Validates path (no directory traversal)
- Returns 404 if subtitle not found or `webvtt_path` is NULL

**Subtitles table schema:**

```sql
CREATE TABLE IF NOT EXISTS subtitles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  media_file_id INTEGER NOT NULL REFERENCES media_files(id) ON DELETE CASCADE,
  track_index INTEGER,
  type TEXT NOT NULL CHECK (type IN ('embedded', 'sidecar')),
  language TEXT,
  codec TEXT,
  sidecar_path TEXT,
  webvtt_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Key fields for this story:**

- `id` — used to construct subtitle URL: `/api/media/subtitles/${id}`
- `language` — ISO 639-1/639-2 code (e.g., 'en', 'eng', 'fra'), nullable
- `webvtt_path` — only non-NULL for converted (ready) subtitles

**Frontend SubtitleTrack interface (already exists in library.service.ts):**

```typescript
export interface SubtitleTrack {
  id: number;
  track_index: number | null;
  type: string;
  language: string | null;
  codec: string | null;
  webvtt_path: string | null;
}
```

The player's new endpoint returns a simpler shape: `{ id, language }` only — that's all the player needs.

### Edge Cases to Handle

1. **No subtitles available:** Don't render CC button at all. No empty state needed.
2. **Subtitle fetch fails (network error, 500):** Silently swallow error, set tracks to empty array, don't show CC button.
3. **All subtitles have `language: null`:** Display as "Track 1", "Track 2", etc.
4. **Duplicate language codes:** Display all — user can differentiate by position (e.g., two English tracks: one SDH, one standard). Don't deduplicate.
5. **User selects track before `<track>` elements are fully loaded:** TextTrack mode can be set immediately; the browser will render subtitles once the VTT file loads. No issue.
6. **Very long subtitle list (10+ tracks):** Dropdown should be scrollable (max-height with overflow-y).
7. **Dual-element mode:** `<track>` elements go inside `<video #videoEl>` (the muted video). Subtitles render on the video surface, which is correct — subtitles are visual, not audio.
8. **Fullscreen mode:** The subtitle selector overlay must be inside the player container so it's visible in fullscreen. Native fullscreen only includes the `<video>` element's tracks. Since we're using `<track>` inside `<video>`, subtitles will render correctly in fullscreen via native rendering.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 5, Story 5.4]
- [Source: _bmad-output/planning-artifacts/prd.md — FR26, UX-DR13]
- [Source: _bmad-output/planning-artifacts/architecture.md — Frontend Architecture (Angular, Signals, OnPush)]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Subtitle controls within video player]
- [Source: _bmad-output/implementation-artifacts/5-3-dual-element-audio-sync-for-sidecar-playback.md — Previous story]
- [Source: _bmad-output/implementation-artifacts/3-4-subtitle-extraction-and-webvtt-conversion.md — Subtitle pipeline]
- [Source: apps/backend/src/media/media.controller.ts — Existing subtitle serving endpoint]
- [Source: apps/backend/src/media/media.service.ts — getSubtitleInfo method, subtitles table query]
- [Source: apps/frontend/src/app/player/player.component.ts — Current implementation (dual-element sync)]
- [Source: apps/frontend/src/app/player/player.component.html — Current template]
- [Source: apps/frontend/src/app/services/library.service.ts — SubtitleTrack interface]
- [Source: apps/backend/src/library/browse.service.ts — MovieDetail includes subtitle_tracks, ShowDetail does not]
- [Source: MDN Web Docs — HTMLTrackElement, TextTrack.mode (showing/disabled), track element attributes]

## Dev Agent Record

### Agent Model Used

### Completion Notes List

### Change Log

### File List

### Review Findings
