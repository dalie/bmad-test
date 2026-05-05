# Story 5.5: Audio Track Selection During Playback

Status: ready-for-dev

## Story

As a viewer,
I want to select from available audio tracks when multiple exist,
so that I can choose my preferred language for multi-language titles.

## Acceptance Criteria

1. Given the current title has multiple audio tracks available, when the viewer opens the audio track selector during playback, then available audio tracks are listed with their language labels.
2. The viewer can switch audio tracks.
3. For Tier 2 files, switching audio changes the `<audio>` element source and re-syncs to the video's current time.
4. Playback position is preserved when switching audio tracks (no restart from beginning).
5. The audio selector is accessible (keyboard navigable, labeled).
6. If only one audio track is available (or zero), the audio selector button is not rendered.
7. If the audio track fetch fails or returns an empty array, the audio selector is not rendered.

## Tasks / Subtasks

- [ ] Task 1: Add backend endpoint to list audio tracks for a file (AC: #1)
  - [ ] Add `getAudioTracksForFile(fileId)` method to `MediaService` — queries `probe_data.audioTracks` from `media_files` for the given `id`, returns `Array<{ index, language, codec, channels }>`
  - [ ] Add `GET /api/media/:fileId/audio-tracks` route to `MediaController` — returns array of available audio tracks
  - [ ] Write unit tests for the new endpoint (single track returns `[]` or 1-element array, multiple tracks, invalid fileId, missing probe_data)
- [ ] Task 2: Fetch audio tracks in PlayerComponent (AC: #1, #6, #7)
  - [ ] Add a new interface `AudioTrackInfo { index: number; language: string | null; codec: string; channels: number; }` in player.component.ts (alongside existing `SubtitleTrackInfo`)
  - [ ] On component init, call `GET /api/media/${fileId}/audio-tracks` to fetch available tracks
  - [ ] Store result in `audioTracks` signal (type: `AudioTrackInfo[]`)
  - [ ] Handle fetch error gracefully (empty tracks, no selector shown)
  - [ ] Re-use the existing `LANG_NAMES` constant for language label display
- [ ] Task 3: Build audio selector UI (AC: #1, #5, #6)
  - [ ] Add an "AUDIO" button in the player UI overlay (position: bottom-right, below the CC button if present)
  - [ ] Only render the AUDIO button when `audioTracks().length > 1`
  - [ ] On click, toggle a dropdown/menu listing available audio tracks
  - [ ] Highlight the currently active track
  - [ ] Add `aria-label="Audio track selector"` on the button
  - [ ] Add `role="menu"` on the dropdown, `role="menuitemradio"` on each option
  - [ ] Support keyboard navigation: Enter/Space to toggle menu, arrow keys to navigate options, Escape to close
  - [ ] Add `#audioControls` template ref for click-outside detection (same pattern as `#subtitleControls`)
- [ ] Task 4: Implement track selection logic for Tier 2 (AC: #2, #3, #4)
  - [ ] When user selects a track in **Tier 2 mode** (`isTier2 === true`):
    - [ ] Get `currentTime` from `videoEl.nativeElement`
    - [ ] Set `audioEl.nativeElement.src` to per-track sidecar URL (see Critical Details below)
    - [ ] Set `audioEl.nativeElement.currentTime = video.currentTime` (preserve position)
    - [ ] If video is playing: call `audioEl.nativeElement.play().catch(() => {})` to resume sync
    - [ ] Update `activeAudioIndex` signal
    - [ ] Close menu
- [ ] Task 5: Implement track selection logic for Tier 1/3 (AC: #2, #4)
  - [ ] When user selects a track in **standard mode** (`isTier2 === false`):
    - [ ] Access `videoEl.nativeElement.audioTracks` — this is the native `AudioTrackList`
    - [ ] If `audioTracks` property exists on the element and has length: enable the selected track and disable all others
    - [ ] If the native `audioTracks` API is not available (empty or undefined): no-op (graceful degradation — the selector shows info but cannot switch)
    - [ ] Update `activeAudioIndex` signal
    - [ ] Close menu
    - [ ] Do NOT pause/restart the video
- [ ] Task 6: Style the audio selector (AC: #5)
  - [ ] Reuse the exact same CSS patterns as `.cc-button`, `.subtitle-controls`, and `.subtitle-menu` — create parallel classes: `.audio-button`, `.audio-controls`, `.audio-menu`, `.audio-menu__item`
  - [ ] Position the `.audio-controls` block below `.subtitle-controls` (use `bottom: 8rem` or adjust so they don't overlap)
  - [ ] Active track has visual indicator (checkmark prefix like subtitle selector)
- [ ] Task 7: Handle edge cases
  - [ ] If no audio tracks available (`audioTracks().length <= 1`): do NOT render the AUDIO button
  - [ ] If audio fetch fails: do NOT render the AUDIO button
  - [ ] Close menu when clicking outside (re-use `@HostListener('document:click')` pattern — check `audioControlsRef`)
  - [ ] Close menu on Escape key
  - [ ] For Tier 2: if the new sidecar src causes an audio error (404 for non-primary track), the existing `syncDisabled` fallback will handle it gracefully
- [ ] Task 8: Write unit tests (AC: all)
  - [ ] Test: AUDIO button hidden when 0 or 1 audio tracks available
  - [ ] Test: AUDIO button visible when 2+ audio tracks available
  - [ ] Test: Dropdown opens on AUDIO button click
  - [ ] Test: Track list renders correct labels
  - [ ] Test: Selecting a track in Tier 2 mode changes `audioEl.src`
  - [ ] Test: Selecting a track in Tier 2 mode preserves currentTime
  - [ ] Test: Selecting a track in standard mode attempts `videoEl.audioTracks` (or no-ops gracefully)
  - [ ] Test: Dropdown closes after selection
  - [ ] Test: Keyboard navigation (Escape closes, arrow keys navigate)
  - [ ] Test: Audio fetch error does not render AUDIO button
  - [ ] Test: No audio fetch when fileId is missing (same pattern as subtitle test)

## Dev Notes

### Architecture & Design Decisions

**Why a dedicated endpoint `GET /api/media/:fileId/audio-tracks`:**

The `audio_tracks` data is already returned as part of `GET /api/library/movies/:id` and `GET /api/library/shows/:id/detail`. However, the player should NOT re-fetch the full MovieDetail/ShowDetail just to get audio tracks. A dedicated endpoint keeps the player lightweight and works identically for both movies and TV episodes (no special-casing needed), mirroring the exact same design decision made in story 5-4 for subtitles.

**Audio track data source:** The data comes from `media_files.probe_data` which contains an `audioTracks` array parsed by FFprobe at import time. This is the exact same data already exposed by `BrowseService.getAudioTracks()`.

**Tier 2 audio switching — per-track sidecar URL design:**

The existing `GET /api/media/stream/:fileId/audio` endpoint serves the sidecar for the primary audio track (index 0), stored at `{CACHE_PATH}/sidecars/{file_id}.m4a`.

For this story, extend the endpoint to accept an optional `trackIndex` query parameter:
- `GET /api/media/stream/:fileId/audio` → serves `{CACHE_PATH}/sidecars/{file_id}.m4a` (primary track, existing behavior)
- `GET /api/media/stream/:fileId/audio?trackIndex=0` → same as above
- `GET /api/media/stream/:fileId/audio?trackIndex=N` → serves `{CACHE_PATH}/sidecars/{file_id}_track_{N}.m4a` (additional track)

**IMPORTANT:** Currently, only the primary track sidecar (`{file_id}.m4a`) is generated by the transcode pipeline (story 3-2 uses `-map 0:a:0`). Additional track sidecar files (`{file_id}_track_1.m4a`, etc.) do NOT exist. This means:
- For Tier 2 files, the AUDIO selector will only be useful if `audioTracks().length > 1` but currently only track 0 has a sidecar
- Selecting a non-primary track in Tier 2 mode will result in the audio element 404-ing, which triggers the existing `syncDisabled` fallback (video unmutes, audio element is effectively disabled)
- Multi-track sidecar generation is a future enhancement outside this story's scope

**For the frontend:** When in Tier 2 mode and the user selects track N, set `audioEl.nativeElement.src` to `/api/media/stream/${fileId}/audio?trackIndex=${index}`. For track 0, this is the same sidecar that's already playing. The `trackIndex` param for track 0 can be omitted (backward compatible).

**Tier 1/3 audio switching — native AudioTrackList API:**

For non-Tier 2 files, the browser's `HTMLVideoElement.audioTracks` property provides an `AudioTrackList`. To enable a specific track:
```typescript
const nativeTracks = videoEl.nativeElement.audioTracks as AudioTrackList | undefined;
if (nativeTracks && nativeTracks.length > 0) {
  for (let i = 0; i < nativeTracks.length; i++) {
    (nativeTracks[i] as AudioTrack).enabled = (nativeTracks[i].id === selectedNativeId);
  }
}
```

**Browser support caveat:** Chrome exposes `audioTracks` on `HTMLVideoElement` but only for certain media sources (e.g., DASH/HLS via MSE). For plain MP4/MKV files served via range requests (which is this system's approach), `videoEl.audioTracks` is typically `undefined` or has `length === 0`. The selector STILL SHOWS the available tracks (so the user knows what tracks exist), but actual switching may silently no-op. Document this in a code comment. Do NOT add error messages or loading indicators.

**Language label display:** Re-use the existing `LANG_NAMES` constant and `getTrackLabel()` method. For audio tracks, fall back to `"Track N (codec)"` format if language is null (to differentiate from subtitle track labels):
```typescript
getAudioTrackLabel(track: AudioTrackInfo): string {
  if (track.language && LANG_NAMES[track.language]) {
    return LANG_NAMES[track.language];
  }
  const index = this.audioTracks().indexOf(track);
  return `Track ${index + 1}`;  // simple fallback, same as subtitle pattern
}
```

**Selector position:** Place `.audio-controls` div BELOW `.subtitle-controls`:
- `.subtitle-controls`: `bottom: 4.5rem`
- `.audio-controls`: `bottom: 8rem` (stacks above the CC button area)

Or alternatively, position them side-by-side horizontally. Follow the simplest approach that avoids overlap.

**Separate HostListener scope:** The existing `onDocumentClick()` handler checks `subtitleControlsRef`. For the audio menu, add a check for `audioControlsRef`:
```typescript
@HostListener('document:click', ['$event'])
onDocumentClick(event: MouseEvent): void {
  if (this.subtitleMenuOpen() && this.subtitleControlsRef) {
    if (!this.subtitleControlsRef.nativeElement.contains(event.target as Node)) {
      this.subtitleMenuOpen.set(false);
    }
  }
  if (this.audioMenuOpen() && this.audioControlsRef) {
    if (!this.audioControlsRef.nativeElement.contains(event.target as Node)) {
      this.audioMenuOpen.set(false);
    }
  }
}
```

### Critical Implementation Details

**New backend endpoint:**

```typescript
// media.service.ts — new method
getAudioTracksForFile(
  fileId: number,
): Array<{ index: number; language: string | null; codec: string; channels: number }> {
  const db = this.database.getDatabase();
  const row = db
    .prepare(`SELECT probe_data FROM media_files WHERE id = ?`)
    .get(fileId) as { probe_data: string | null } | undefined;

  if (!row) {
    throw new NotFoundException(`Media file not found`);
  }

  if (!row.probe_data) return [];

  try {
    const probe = JSON.parse(row.probe_data) as {
      audioTracks?: Array<{ index: number; codec: string; channels: number; language?: string }>;
    };
    return (probe.audioTracks ?? []).map((t) => ({
      index: t.index,
      language: t.language ?? null,
      codec: t.codec,
      channels: t.channels,
    }));
  } catch {
    return [];
  }
}

// media.controller.ts — new route
@Get(':fileId/audio-tracks')
getAudioTracksForFile(
  @Param('fileId', ParseIntPipe) fileId: number,
): Array<{ index: number; language: string | null; codec: string; channels: number }> {
  return this.mediaService.getAudioTracksForFile(fileId);
}
```

**IMPORTANT route ordering in MediaController:** Current routes are:
1. `@Get('stream/:fileId')` — existing
2. `@Get('stream/:fileId/audio')` — existing (extend with optional `trackIndex` query param)
3. `@Get('subtitles/:subtitleId')` — existing
4. `@Get(':fileId/subtitles')` — added in story 5-4
5. `@Get(':fileId/audio-tracks')` — **NEW** — must come AFTER all existing routes

NestJS matches routes in declaration order. The new route `GET :fileId/audio-tracks` has a literal segment `audio-tracks` as suffix, which does NOT conflict with `GET :fileId/subtitles` (different suffix). However, it COULD conflict with hypothetical catch-all routes. Place it last.

**Extending `streamAudio` to accept `trackIndex`:**

```typescript
@Get('stream/:fileId/audio')
streamAudio(
  @Param('fileId', ParseIntPipe) fileId: number,
  @Query('trackIndex') trackIndexStr?: string,
  @Req() req: Request,
  @Res({ passthrough: true }) res: Response,
): StreamableFile {
  const trackIndex = trackIndexStr !== undefined ? parseInt(trackIndexStr, 10) : 0;
  if (isNaN(trackIndex) || trackIndex < 0) {
    throw new HttpException('Invalid trackIndex', HttpStatus.BAD_REQUEST);
  }
  const sidecarPath = this.mediaService.getAudioSidecarPath(fileId, trackIndex);
  return this.streamFile(sidecarPath, 'audio/aac', req, res);
}
```

**Extending `getAudioSidecarPath` in `MediaService`:**

```typescript
getAudioSidecarPath(fileId: number, trackIndex: number = 0): string {
  const db = this.database.getDatabase();
  const row = db
    .prepare(
      `SELECT mf.tier, tj.output_path, tj.status AS transcode_status
       FROM media_files mf
       LEFT JOIN transcode_jobs tj ON tj.file_id = mf.id
       WHERE mf.id = ?`,
    )
    .get(fileId) as any;

  if (!row) throw new NotFoundException(`Media file not found`);
  if (row.tier !== 2) throw new NotFoundException(`Audio sidecar only available for Tier 2 files`);
  if (row.transcode_status !== 'completed' || !row.output_path) {
    throw new NotFoundException(`Audio sidecar not ready`);
  }

  // Primary track (index 0): use existing sidecar path as-is
  // Other tracks: derive path by appending _track_N before extension
  let sidecarPath: string;
  if (trackIndex === 0) {
    sidecarPath = row.output_path; // e.g., /data/sidecars/42.m4a
  } else {
    // Derive: /data/sidecars/42.m4a → /data/sidecars/42_track_1.m4a
    const ext = path.extname(row.output_path);
    const base = row.output_path.slice(0, -ext.length);
    sidecarPath = `${base}_track_${trackIndex}${ext}`;
  }

  this.validatePath(sidecarPath);
  return sidecarPath;
}
```

**PlayerComponent TypeScript changes:**

New interface (add alongside `SubtitleTrackInfo`):
```typescript
interface AudioTrackInfo {
  index: number;
  language: string | null;
  codec: string;
  channels: number;
}
```

New signals (add alongside existing subtitle signals):
```typescript
audioTracks = signal<AudioTrackInfo[]>([]);
activeAudioIndex = signal<number | null>(null);
audioMenuOpen = signal<boolean>(false);
```

New `@ViewChild`:
```typescript
@ViewChild('audioControls') audioControlsRef?: ElementRef<HTMLElement>;
```

**CAUTION: `audioElRef` is ALREADY used for the sidecar `<audio>` element in Tier 2.** The new `audioControlsRef` is a different ref for the audio SELECTOR overlay container. Use `#audioControls` in the template (NOT `#audioEl` which already exists).

Constructor additions (after subtitle fetch):
```typescript
if (this.fileId) {
  this.http.get<AudioTrackInfo[]>(`/api/media/${this.fileId}/audio-tracks`).subscribe({
    next: (tracks) => this.audioTracks.set(tracks),
    error: () => this.audioTracks.set([]),
  });
}
```

**Two HTTP requests in constructor:** The component now makes TWO parallel HTTP requests in the constructor — one for subtitles, one for audio tracks. This is fine and consistent with the existing pattern.

**`selectAudioTrack` method:**

```typescript
selectAudioTrack(track: AudioTrackInfo): void {
  if (this.isTier2) {
    // Tier 2: switch the <audio> element source
    const audio = this.audioElRef?.nativeElement;
    const video = this.videoElRef?.nativeElement;
    if (!audio || !video) return;

    const savedTime = video.currentTime;
    const wasPlaying = !video.paused;

    // Build sidecar URL for this track
    const trackUrl = track.index === 0
      ? `/api/media/stream/${this.fileId}/audio`
      : `/api/media/stream/${this.fileId}/audio?trackIndex=${track.index}`;

    audio.pause();
    audio.src = trackUrl;
    audio.load();
    audio.currentTime = savedTime;
    if (wasPlaying) {
      audio.play().catch(() => {});
    }
  } else {
    // Tier 1/3: attempt native AudioTrackList API
    const video = this.videoElRef?.nativeElement;
    if (!video) return;
    // AudioTrackList is not in standard TS lib for HTMLVideoElement; cast to any
    const nativeTracks = (video as any).audioTracks as
      | { length: number; [index: number]: { enabled: boolean } }
      | undefined;
    if (nativeTracks && nativeTracks.length > 0) {
      // Enable selected track, disable others
      // Note: nativeTracks indices match probe_data track indices only if tracks are in order
      // Use array-position approach: match by order in audioTracks signal
      const selectedPos = this.audioTracks().findIndex((t) => t.index === track.index);
      for (let i = 0; i < nativeTracks.length; i++) {
        nativeTracks[i].enabled = i === selectedPos;
      }
    }
    // If native audioTracks not available: silent no-op (graceful degradation)
  }

  this.activeAudioIndex.set(track.index);
  this.audioMenuOpen.set(false);
}
```

**`toggleAudioMenu` method:**

```typescript
toggleAudioMenu(): void {
  this.audioMenuOpen.update((v) => !v);
}
```

**`getAudioTrackLabel` method:**

```typescript
getAudioTrackLabel(track: AudioTrackInfo): string {
  if (track.language && LANG_NAMES[track.language]) {
    return LANG_NAMES[track.language];
  }
  const index = this.audioTracks().indexOf(track);
  return `Track ${index + 1}`;
}
```

**`onAudioMenuKeydown` method** — same pattern as `onMenuKeydown`:
```typescript
onAudioMenuKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    this.audioMenuOpen.set(false);
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const items = (event.currentTarget as HTMLElement).querySelectorAll('[role="menuitemradio"]');
    const focused = document.activeElement;
    const currentIndex = Array.from(items).indexOf(focused as Element);
    const next =
      event.key === 'ArrowDown'
        ? (currentIndex + 1) % items.length
        : (currentIndex - 1 + items.length) % items.length;
    (items[next] as HTMLElement).focus();
  }
}
```

**Player template additions — audio selector overlay:**

Add after the existing `@if (subtitleTracks().length > 0)` block:

```html
@if (audioTracks().length > 1) {
  <div class="audio-controls" #audioControls>
    <button
      type="button"
      class="audio-button"
      [class.audio-button--active]="activeAudioIndex() !== null"
      (click)="toggleAudioMenu()"
      aria-label="Audio track selector"
      [attr.aria-expanded]="audioMenuOpen()"
    >
      AUDIO
    </button>
    @if (audioMenuOpen()) {
      <div class="audio-menu" role="menu" (keydown)="onAudioMenuKeydown($event)">
        @for (track of audioTracks(); track track.index) {
          <button
            type="button"
            role="menuitemradio"
            [attr.aria-checked]="activeAudioIndex() === track.index"
            (click)="selectAudioTrack(track)"
            class="audio-menu__item"
            [class.audio-menu__item--active]="activeAudioIndex() === track.index"
          >
            {{ getAudioTrackLabel(track) }}
          </button>
        }
      </div>
    }
  </div>
}
```

**CSS additions** (mirror subtitle CSS patterns):

```css
.audio-controls {
  position: absolute;
  bottom: 8rem;   /* stacked above subtitle-controls at 4.5rem */
  right: 1rem;
  z-index: 20;
}

.audio-button {
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  padding: 0.4rem 0.6rem;
  font-size: 0.7rem;
  font-weight: 700;
  cursor: pointer;
  letter-spacing: 0.05em;
}

.audio-button:hover,
.audio-button:focus {
  background: rgba(0, 0, 0, 0.85);
  border-color: rgba(255, 255, 255, 0.6);
  outline: none;
}

.audio-button--active {
  background: rgba(255, 255, 255, 0.2);
  border-color: #fff;
}

.audio-menu {
  position: absolute;
  bottom: 100%;
  right: 0;
  margin-bottom: 0.4rem;
  background: rgba(20, 20, 20, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  padding: 0.3rem 0;
  min-width: 10rem;
  max-height: 15rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.audio-menu__item {
  background: none;
  border: none;
  color: #ddd;
  padding: 0.5rem 1rem;
  text-align: left;
  cursor: pointer;
  font-size: 0.85rem;
  white-space: nowrap;
}

.audio-menu__item:hover,
.audio-menu__item:focus {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  outline: none;
}

.audio-menu__item--active {
  color: #fff;
  font-weight: 600;
}

.audio-menu__item--active::before {
  content: '✓ ';
}
```

**Updated `onDocumentClick` HostListener:**

The existing method must be extended to also close the audio menu:

```typescript
@HostListener('document:click', ['$event'])
onDocumentClick(event: MouseEvent): void {
  if (this.subtitleMenuOpen() && this.subtitleControlsRef) {
    if (!this.subtitleControlsRef.nativeElement.contains(event.target as Node)) {
      this.subtitleMenuOpen.set(false);
    }
  }
  if (this.audioMenuOpen() && this.audioControlsRef) {
    if (!this.audioControlsRef.nativeElement.contains(event.target as Node)) {
      this.audioMenuOpen.set(false);
    }
  }
}
```

### Project Structure Notes

**Files to MODIFY:**

```
apps/backend/src/media/media.controller.ts    ← Add GET /:fileId/audio-tracks, extend GET stream/:fileId/audio with trackIndex query param
apps/backend/src/media/media.service.ts       ← Add getAudioTracksForFile(), extend getAudioSidecarPath() with trackIndex param
apps/frontend/src/app/player/player.component.ts    ← Add AudioTrackInfo interface, audio fetch, selectAudioTrack, toggleAudioMenu, getAudioTrackLabel, onAudioMenuKeydown, audioControlsRef ViewChild, update onDocumentClick
apps/frontend/src/app/player/player.component.html  ← Add audio selector overlay
apps/frontend/src/app/player/player.component.css   ← Add audio-controls, audio-button, audio-menu CSS classes
apps/frontend/src/app/player/player.component.spec.ts ← Add audio track tests
apps/backend/src/media/media.controller.spec.ts ← Add tests for new endpoint
apps/backend/src/media/media.service.spec.ts    ← Add tests for new methods
```

**No new files needed.** No new Angular modules, services, or components.

**No changes to:**
- `apps/backend/src/database/database.service.ts` (schema unchanged)
- `apps/backend/src/library/browse.service.ts` (audio tracks already returned via MovieDetail)
- Any detail page components (movie-detail, show-detail)
- Any other player-adjacent components

### Testing Standards

- Use Angular TestBed with standalone component testing (same pattern as Story 5-4)
- Mock `HttpClient` using `provideHttpClient()` + `HttpTestingController` from `@angular/common/http/testing`
- The existing `setup()` helper in the spec currently flushes ONE subtitle HTTP request. After this story, the constructor fires TWO requests (subtitles + audio tracks). **Update the `setup()` helper to flush both:**

```typescript
function setup(
  fileId = '42',
  tier?: string,
  subtitleTracks: Array<{ id: number; language: string | null }> = [],
  audioTracks: AudioTrackInfo[] = [],
) {
  // ... TestBed setup ...

  const fixture = TestBed.createComponent(PlayerComponent);
  fixture.detectChanges();

  // Must flush both requests (order matches constructor call order)
  const subReq = httpTesting.expectOne(`/api/media/${fileId}/subtitles`);
  subReq.flush(subtitleTracks);

  const audioReq = httpTesting.expectOne(`/api/media/${fileId}/audio-tracks`);
  audioReq.flush(audioTracks);

  fixture.detectChanges();
  return fixture;
}
```

⚠️ **CRITICAL:** ALL existing tests go through the `setup()` helper. Updating `setup()` to flush both requests is the single change needed to avoid `httpTesting.verify()` failures in existing tests (the verify call would catch an unflushed audio-tracks request in every test). This is NOT optional — forgetting this will cause ALL existing tests to fail.

- Mock audio tracks: `[{ index: 0, language: 'jpn', codec: 'ac3', channels: 6 }, { index: 1, language: 'eng', codec: 'ac3', channels: 2 }]`
- Test AUDIO button visibility based on track count
- Test dropdown open/close behavior
- Test `selectAudioTrack` in Tier 2 mode: verify `audioEl.src` changed and `currentTime` set
- Test graceful no-op in standard mode when native `audioTracks` not available
- Do NOT test actual audio switching via browser AudioTrackList (browser engine concern)
- Do NOT test sidecar file existence (backend concern)

### What NOT To Do (Anti-Patterns)

- Do NOT use `@angular/cdk` for the dropdown (project convention: no CDK)
- Do NOT try to build a full MSE player or use HLS.js/Dash.js for audio track switching — far out of scope
- Do NOT re-fetch MovieDetail/ShowDetail to get audio tracks — use the dedicated endpoint
- Do NOT modify the subtitle selector implementation in any way
- Do NOT add audio track selection for the native `<audio>` element (this is for the `<video>` audioTracks API and sidecar switching)
- Do NOT add loading indicators for the audio fetch
- Do NOT block video playback while audio fetch is in progress (fire and forget)
- Do NOT rename `audioElRef` — it is already used for the Tier 2 sidecar audio element. The new `#audioControls` ref is for the SELECTOR overlay container, not the audio element.
- Do NOT add watch progress tracking — that's Epic 6
- Do NOT modify the transcode pipeline to generate multiple sidecars — that's a future story

### Previous Story Intelligence (5-4)

**What was established in Story 5-4:**

- `SubtitleTrackInfo` interface and `LANG_NAMES` constant exist in player.component.ts — **REUSE THESE EXACT PATTERNS** for `AudioTrackInfo`
- `HttpClient` is already injected in the component via `inject(HttpClient)`
- HTTP fetch pattern in constructor already established: `.subscribe({ next, error })`
- `subtitleTracks`, `activeSubtitleId`, `subtitleMenuOpen` signals established — **MIRROR** with `audioTracks`, `activeAudioIndex`, `audioMenuOpen`
- `@ViewChild('subtitleControls')` pattern established — **MIRROR** with `@ViewChild('audioControls')`
- `onMenuKeydown` keyboard handler established — **MIRROR** as `onAudioMenuKeydown`
- `@HostListener('document:click')` close-on-outside-click handler exists — **EXTEND** (don't replace) to also handle audio menu
- Both `#videoEl` refs exist in both `@if (isTier2)` and `@else` template branches
- Subtitle track UI overlay CSS patterns are complete in player.component.css — **REUSE** as-is

**HTTP request count change:** Story 5-4 left the component with ONE HTTP request in the constructor (subtitles). Story 5-5 adds a SECOND one (audio tracks). The spec file's `setup()` helper MUST be updated to flush both requests, otherwise ALL existing tests will fail with `httpTesting.verify()` errors. This is the highest-risk regression in this story.

**What was fixed in review (5-4):**
- Pattern: always use `?.nativeElement` when accessing ViewChild refs to avoid null errors
- Pattern: `subtitleMenuOpen.set(false)` in selection to ensure menu closes

**Patterns to maintain:**

- `standalone: true`, `ChangeDetectionStrategy.OnPush`
- `inject()` function style (not constructor injection syntax for DI)
- `signal()` for all reactive state
- Co-located spec file
- Minimal code, no over-engineering
- Clean lifecycle cleanup in `ngOnDestroy`

### Git Intelligence

**Recent commit pattern:** Short, focused commits (e.g., "implement 5-4", "create story 5-3"). Follow same style for this story: "implement 5-5".

**Key files modified in last commit (5-4):**

- `apps/backend/src/media/media.controller.ts` — route ordering is critical; append new routes at end
- `apps/backend/src/media/media.service.ts` — added `getSubtitlesForFile()`; mirror this for `getAudioTracksForFile()`
- `apps/frontend/src/app/player/player.component.ts` — fully established subtitle selection patterns
- `apps/frontend/src/app/player/player.component.html` — subtitle overlay template in place
- `apps/frontend/src/app/player/player.component.css` — subtitle CSS classes in place
- `apps/frontend/src/app/player/player.component.spec.ts` — `setup()` helper flushes ONE subtitle request; must be updated to flush TWO requests

### Backend Context (Existing Infrastructure)

**`probe_data` JSON shape** (from `probe.service.ts`):
```typescript
interface ProbeResult {
  format: { container: string; duration: number; bitrate: number; }
  video: { codec: string; width: number; height: number; profile?: string; } | null;
  audioTracks: Array<{ index: number; codec: string; channels: number; language?: string; }>
  subtitleTracks: Array<{ index: number; codec: string; language?: string; }>
}
```

**Existing sidecar path convention** (from story 3-2):
- Tier 2 primary sidecar: `{CACHE_PATH}/sidecars/{file_id}.m4a`
- New per-track sidecar paths (for future multi-track generation): `{CACHE_PATH}/sidecars/{file_id}_track_{N}.m4a`

**`media_files` schema:**
```sql
id INTEGER PRIMARY KEY AUTOINCREMENT,
path TEXT NOT NULL,
filename TEXT,
source_id INTEGER REFERENCES media_sources(id) ON DELETE CASCADE,
status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','probed','matched','classified','ready')),
size INTEGER,
mtime TEXT,
probe_data TEXT,   ← source of audio track data
tier INTEGER,
created_at TEXT NOT NULL DEFAULT (datetime('now')),
updated_at TEXT NOT NULL DEFAULT (datetime('now'))
```

**`validatePath()` in MediaService:** Already used; apply to sidecar paths for per-track sidecars (path traversal protection). The existing implementation checks for `..` and path normalization — include the derived `_track_N` path in this validation.

**Query params in NestJS controllers:** Use `@Query('trackIndex') trackIndexStr?: string` decorator. The value will be `undefined` when the parameter is not present. Parse with `parseInt(..., 10)` and validate with `isNaN()` guard. Import `Query, HttpException, HttpStatus` from `@nestjs/common` (most are already imported).

### Key Constraints Summary

| Constraint | Impact |
|-----------|--------|
| `transcode_jobs` only has one sidecar per file | Tier 2 audio switching only works for track 0 (primary); other tracks 404 gracefully |
| `HTMLMediaElement.audioTracks` not reliable for range-served files | Tier 1/3 switching is best-effort; silent no-op if API not available |
| `setup()` helper flushes one request | **MUST** update to flush two requests (subtitles + audio) or all existing tests break |
| Route ordering in NestJS | New routes must come after all existing routes to avoid conflicts |
| `audioElRef` already used | Do NOT use `#audioEl` for the audio selector overlay; use `#audioControls` |

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.6

### Debug Log References

### Completion Notes List

### File List
