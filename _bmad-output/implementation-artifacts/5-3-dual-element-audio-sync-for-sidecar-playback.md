# Story 5.3: Dual-Element Audio Sync for Sidecar Playback

Status: ready-for-dev

## Story

As a viewer,
I want videos with audio sidecars to play seamlessly with synced audio,
so that I never notice the system is doing anything special — it just plays.

## Acceptance Criteria

1. Given a Tier 2 file is loaded in the player (original video + AAC sidecar), when playback starts, then a `<video muted>` element plays the original video file and a separate `<audio>` element plays the AAC sidecar.
2. A `requestAnimationFrame` sync loop keeps audio and video within 50ms drift tolerance (NFR8).
3. Seeking the video also seeks the audio to the same position and re-syncs.
4. Pausing the video pauses the audio; resuming resumes both in sync.
5. Volume controls affect the `<audio>` element (since `<video>` is muted).
6. Fullscreen works correctly with the dual-element setup.
7. The sync mechanism is transparent to the viewer — no visible glitches or controls exposed.

## Tasks / Subtasks

- [ ] Task 1: Pass tier info to player via query parameter (AC: #1)
  - [ ] Update movie-detail template: add `[queryParams]="{tier: m.tier}"` to Play link
  - [ ] Update show-detail template: add `[queryParams]="{tier: ep.tier}"` to episode Play links
  - [ ] Read `tier` from `ActivatedRoute.snapshot.queryParamMap` in PlayerComponent
- [ ] Task 2: Implement dual-element DOM structure for Tier 2 (AC: #1)
  - [ ] Add conditional template: Tier 2 uses `<video muted>` + hidden `<audio>`, others use `<video controls>` as before
  - [ ] Set video src to `/api/media/stream/${fileId}` (same as current)
  - [ ] Set audio src to `/api/media/stream/${fileId}/audio` (sidecar endpoint)
  - [ ] Add `preload="auto"` to both elements
  - [ ] Add `autoplay` to video; audio starts programmatically after sync setup
- [ ] Task 3: Implement requestAnimationFrame sync loop (AC: #2, #7)
  - [ ] Create sync loop function using `requestAnimationFrame`
  - [ ] Check drift: `Math.abs(video.currentTime - audio.currentTime)`
  - [ ] If drift > 0.05 (50ms), correct: `audio.currentTime = video.currentTime`
  - [ ] Store RAF id for cleanup
  - [ ] Start loop after both elements have fired `canplay`
- [ ] Task 4: Implement seek synchronization (AC: #3)
  - [ ] Listen to video `seeking` event → pause audio
  - [ ] Listen to video `seeked` event → set `audio.currentTime = video.currentTime`, resume audio if video is playing
- [ ] Task 5: Implement play/pause synchronization (AC: #4)
  - [ ] Listen to video `play` event → `audio.currentTime = video.currentTime; audio.play()`
  - [ ] Listen to video `pause` event → `audio.pause()`
- [ ] Task 6: Implement volume mirroring (AC: #5)
  - [ ] Listen to video `volumechange` event
  - [ ] Mirror `video.volume` to `audio.volume`
  - [ ] Mirror `video.muted` to `audio.muted` (with guard: re-mute video if user unmutes to prevent double-audio on AC3-capable browsers)
- [ ] Task 7: Verify fullscreen behavior (AC: #6)
  - [ ] Confirm native fullscreen toggle on `<video>` works — audio element continues playing in background
  - [ ] Confirm RAF sync loop continues running during fullscreen
- [ ] Task 8: Cleanup and lifecycle management
  - [ ] Cancel RAF on `ngOnDestroy`
  - [ ] Remove event listeners on `ngOnDestroy`
  - [ ] Pause both elements on destroy to release resources
- [ ] Task 9: Write unit tests (AC: all)
  - [ ] Test standard mode (tier != 2): single `<video controls>` element rendered (no regression)
  - [ ] Test dual-element mode (tier = 2): `<video muted>` + `<audio>` rendered
  - [ ] Test video src and audio src URLs are correct
  - [ ] Test sync loop drift correction logic
  - [ ] Test seek synchronization event handling
  - [ ] Test play/pause synchronization
  - [ ] Test volume mirroring

## Dev Notes

### Architecture & Design Decisions

**Tier detection approach:** Pass `tier` as a query parameter from detail pages. The player reads `ActivatedRoute.snapshot.queryParamMap.get('tier')`. If `tier === '2'`, activate dual-element mode. If missing or any other value, use standard single-element mode (backward compatible, no breaking change).

**Why query param (not route param or API call):**

- No extra network call → preserves NFR1 (sub-1000ms start)
- No route structure change (`/play/:fileId` stays the same)
- Detail pages already have `tier` info in their data models
- Graceful degradation: if query param missing, standard mode works (just no sidecar audio for Tier 2 — same as current behavior)

**Dual-element strategy (from architecture doc):** Using `<video muted>` + `<audio>` with JS sync is an unconventional but intentional approach that enables the sidecar strategy without requiring MediaSource Extensions or HLS segmentation.

**Why `<video muted>` is necessary (safety):**

- Tier 2 means video codec is compatible but audio codec is NOT (AC3/DTS/TrueHD)
- Most browsers cannot decode AC3/DTS → no audio from video element anyway
- BUT some browsers (Safari on macOS, Edge with system codecs) CAN decode AC3 via platform APIs
- Explicit `muted` prevents double-audio (video audio + sidecar audio simultaneously) on those platforms
- Trade-off: native controls show muted icon. Acceptable because audio IS audible from `<audio>` element

**Volume control strategy:**

- Native `controls` attribute remains on `<video>` for play/pause/seek/fullscreen
- `volumechange` event listener on video mirrors volume to audio element
- If user clicks "unmute" in native controls → immediately re-mute video and ensure audio is not muted
- Use a `isMirroring` flag to prevent event listener feedback loops
- Net effect: native volume slider effectively controls audio element volume

**Sync mechanism:** `requestAnimationFrame` loop at ~60fps checks drift. Only corrects when drift exceeds 50ms threshold (avoids constant micro-corrections). Correction sets `audio.currentTime = video.currentTime` (audio seeks to match video, not vice versa).

**Autoplay for dual-element:** The video element has `autoplay`. The audio element starts programmatically AFTER both elements fire `canplay` to ensure sync from frame 1. Use a readiness gate: wait for both `canplay` events, then `audio.play()`.

### Critical Implementation Details

**Conditional template pattern:**

```html
@if (isTier2) {
<!-- Dual-element mode -->
<video
  #videoEl
  class="player-video"
  [src]="videoSrc"
  muted
  autoplay
  controls
  preload="auto"
></video>
<audio #audioEl [src]="audioSrc" preload="auto"></audio>
} @else {
<!-- Standard mode (unchanged from Story 5.2) -->
<video
  class="player-video"
  [src]="videoSrc"
  autoplay
  controls
  preload="auto"
></video>
}
```

**URLs:**

- Video: `/api/media/stream/${fileId}` (all tiers — same as Story 5.2)
- Audio sidecar: `/api/media/stream/${fileId}/audio` (Tier 2 only — returns 404 for non-Tier 2)

**Sync loop pseudocode:**

```typescript
private syncLoop(): void {
  if (!this.videoEl || !this.audioEl) return;
  const drift = Math.abs(this.videoEl.currentTime - this.audioEl.currentTime);
  if (drift > 0.05) { // 50ms threshold (NFR8)
    this.audioEl.currentTime = this.videoEl.currentTime;
  }
  this.rafId = requestAnimationFrame(() => this.syncLoop());
}
```

**Event handlers to wire up in `ngAfterViewInit`:**

```typescript
// Seek sync
video.addEventListener("seeking", () => audio.pause());
video.addEventListener("seeked", () => {
  audio.currentTime = video.currentTime;
  if (!video.paused) audio.play();
});

// Play/pause sync
video.addEventListener("play", () => {
  audio.currentTime = video.currentTime;
  audio.play();
});
video.addEventListener("pause", () => audio.pause());

// Volume mirror
video.addEventListener("volumechange", () => {
  if (this.isMirroring) return;
  this.isMirroring = true;
  audio.volume = video.volume;
  // Prevent unmuting video (safety against double-audio)
  if (!video.muted) {
    video.muted = true;
  }
  audio.muted = false; // Audio should never be muted when video volume changes
  this.isMirroring = false;
});
```

**Readiness gate for initial sync:**

```typescript
private videoReady = false;
private audioReady = false;

// In setup:
video.addEventListener('canplay', () => { this.videoReady = true; this.tryStartSync(); });
audio.addEventListener('canplay', () => { this.audioReady = true; this.tryStartSync(); });

private tryStartSync(): void {
  if (this.videoReady && this.audioReady) {
    this.audioEl.currentTime = this.videoEl.currentTime;
    this.audioEl.play();
    this.syncLoop();
  }
}
```

**Fullscreen behavior:** When user clicks fullscreen in native controls:

- Video element goes fullscreen (browser handles this)
- Audio element remains in DOM, continues playing unaffected
- `requestAnimationFrame` continues firing (not tied to element visibility)
- Sync loop works identically in fullscreen mode
- No additional code needed

**Angular lifecycle:**

- Use `ViewChild` with `ElementRef` to get video/audio native elements
- Set up listeners in `ngAfterViewInit` (elements exist in DOM)
- Clean up in `ngOnDestroy`: cancel RAF, remove listeners, pause elements

### Project Structure Notes

**Files to MODIFY:**

```
apps/frontend/src/app/player/player.component.ts    ← Add dual-element logic
apps/frontend/src/app/player/player.component.html  ← Add conditional template
apps/frontend/src/app/player/player.component.css   ← Hide audio element
apps/frontend/src/app/player/player.component.spec.ts ← Add dual-element tests
apps/frontend/src/app/movie-detail/movie-detail.component.html ← Add tier query param to Play link
apps/frontend/src/app/show-detail/show-detail.component.html   ← Add tier query param to Play links
```

**No new files needed.** No backend changes needed — endpoints already exist from Story 5.1.

**No new dependencies needed.** Pure browser APIs: `requestAnimationFrame`, `HTMLMediaElement` events, `currentTime`, `volume`, `muted`.

### Component Pattern to Follow

Follow patterns established in Story 5.2:

- `standalone: true`
- `ChangeDetectionStrategy.OnPush`
- `inject()` function style
- Co-located spec file
- `AfterViewInit` / `OnDestroy` lifecycle hooks (new for this story)
- `ViewChild` for element references (new for this story)

**New imports needed in PlayerComponent:**

- `AfterViewInit`, `OnDestroy`, `ViewChild`, `ElementRef` from `@angular/core`
- `ActivatedRoute` already imported

### Styling Requirements

**Audio element must be hidden:**

```css
audio {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
}
```

No other styling changes. The video element styling remains identical to Story 5.2.

### Testing Standards

- Use Angular TestBed with standalone component testing (same as Story 5.2)
- Mock `ActivatedRoute` with both `paramMap` (fileId) and `queryParamMap` (tier)
- Test standard mode: when tier is not 2, single video element rendered, no audio element
- Test dual-element mode: when tier is 2, video has `muted` attribute, audio element present
- Test URL construction: video src and audio src correct
- Test sync logic with mock `currentTime` values (unit test the drift correction threshold)
- Do NOT test actual media playback (integration concern)
- Do NOT test RAF timing (unit test the callback logic, not the scheduling)

### What NOT To Do (Anti-Patterns)

- Do NOT use MediaSource Extensions (MSE) — overkill for this use case
- Do NOT use HLS/DASH segmentation — unnecessary for LAN streaming
- Do NOT build a full custom video player — keep native `controls` attribute
- Do NOT add `@angular/cdk` or any external player library
- Do NOT fetch metadata from library API in the player — tier comes via query param
- Do NOT modify backend endpoints — they already exist and work
- Do NOT add subtitle logic — that's Story 5.4
- Do NOT add audio track selection — that's Story 5.5
- Do NOT add watch progress tracking — that's Epic 6
- Do NOT use `timeupdate` event for sync (fires only 4-8x/sec, too infrequent for 50ms tolerance)
- Do NOT correct drift by adjusting video.currentTime (always adjust audio to match video)
- Do NOT add loading/buffering indicators — UX spec forbids them
- Do NOT remove `controls` attribute from video element (play/pause/seek/fullscreen must use native controls)

### Previous Story Intelligence (5-2)

**What was established:**

- Player route: `/play/:fileId` with lazy loading
- Component: `PlayerComponent` standalone, OnPush, inject-style DI
- Template: `<video>` with `[src]`, `autoplay`, `controls`, `preload="auto"`
- Styling: full-viewport, dark background, centered video, back button top-left
- Tests: TestBed with mocked ActivatedRoute, assertions on DOM attributes

**Code patterns to maintain:**

- `inject(ActivatedRoute).snapshot.paramMap.get('fileId')` for route params
- `inject(Location)` for back navigation
- Minimal component — no services needed for media URLs (computed from fileId)
- Clean, minimal code — no over-engineering

**What changes in this story:**

- Add `queryParamMap` reading for tier
- Add `ViewChild` refs to video and audio elements
- Add `AfterViewInit` / `OnDestroy` lifecycle hooks
- Add conditional template rendering based on tier
- Add sync logic (event listeners + RAF loop)

### Backend Context (Already Complete — No Changes Needed)

**Existing endpoints from Story 5.1:**

- `GET /api/media/stream/:fileId` — serves video file (works for all tiers)
- `GET /api/media/stream/:fileId/audio` — serves AAC sidecar (Tier 2 only, 404 for others)

**Sidecar file details from Story 3.2:**

- Stored at: `{CACHE_PATH}/sidecars/{file_id}.m4a`
- Format: AAC in M4A container, 192kbps stereo, `+faststart` moov atom
- M4A container supports HTTP range requests (seeking works natively)
- Audio element preload/seek behavior identical to video

**Content-Type served:** `audio/aac` (from `media.controller.ts`)

### Edge Cases to Handle

1. **Audio element fails to load (404 or network error):** If `/audio` endpoint returns 404 (e.g., sidecar not yet generated), fall back to standard mode (video plays without sidecar audio). Listen for `error` event on audio element.
2. **Browser starts video before audio is ready:** The readiness gate (`canplay` on both) prevents this. Video has `autoplay` but audio starts via JS only after both are ready.
3. **User seeks while audio is still loading:** The `seeking`/`seeked` handler pauses audio during seek and re-syncs after. If audio hasn't loaded yet, `audio.currentTime` assignment is a no-op until data is available.
4. **Rapid seeking (multiple seeks before seeked fires):** Each `seeking` event pauses audio. Each `seeked` event re-syncs. Only the final `seeked` matters — intermediate ones are harmless.
5. **Tab becomes inactive (RAF pauses):** When tab is backgrounded, RAF stops. On return, the sync loop resumes and corrects any accumulated drift on the next frame. This is acceptable — drift correction is instantaneous.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 5, Story 5.3]
- [Source: _bmad-output/planning-artifacts/prd.md — FR25, NFR8]
- [Source: _bmad-output/planning-artifacts/architecture.md — Frontend Architecture (Angular, Signals, OnPush)]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Video Playback UX, Native Controls]
- [Source: _bmad-output/implementation-artifacts/5-2-video-player-with-standard-playback-controls.md — Previous story]
- [Source: _bmad-output/implementation-artifacts/5-1-media-file-serving-via-http-range-requests.md — Backend endpoints]
- [Source: _bmad-output/implementation-artifacts/3-2-aac-audio-sidecar-generation-tier-2.md — Sidecar format/storage]
- [Source: apps/frontend/src/app/player/player.component.ts — Current implementation]
- [Source: apps/frontend/src/app/player/player.component.html — Current template]
- [Source: apps/frontend/src/app/movie-detail/movie-detail.component.html — Play link to update]
- [Source: apps/frontend/src/app/show-detail/show-detail.component.html — Episode play links to update]
- [Source: apps/backend/src/media/media.controller.ts — Stream endpoints (no changes needed)]
- [Source: apps/frontend/src/app/services/library.service.ts — MovieDetail.tier, EpisodeItem.tier interfaces]
- [Source: MDN Web Docs — HTMLMediaElement.currentTime, seeking/seeked/play/pause/volumechange events, requestAnimationFrame]

## Dev Agent Record

### Agent Model Used

### Completion Notes List

### Change Log

### File List
