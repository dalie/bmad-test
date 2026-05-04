# Story 5.2: Video Player with Standard Playback Controls

Status: ready-for-dev

## Story

As a viewer,
I want a video player with standard controls (play, pause, seek, volume, fullscreen),
so that I can watch content with the controls I'm already familiar with.

## Acceptance Criteria

1. Given the viewer navigates to the player page (via Play button on a detail page), when the player loads, then for Tier 1 and Tier 3 files, a standard `<video>` element is used with the media source URL.
2. Playback starts within 1000ms of the player page loading (NFR1).
3. The viewer can pause and resume playback (FR28).
4. The viewer can seek to any point with instant response via native range requests (FR23, NFR2).
5. The viewer can adjust volume (FR28).
6. The viewer can enter and exit fullscreen (FR29).
7. The player page has a back link to return to the detail page.

## Tasks / Subtasks

- [ ] Task 1: Create player component and route (AC: #1, #7)
  - [ ] Create `apps/frontend/src/app/player/player.component.ts`
  - [ ] Create `apps/frontend/src/app/player/player.component.html`
  - [ ] Create `apps/frontend/src/app/player/player.component.css`
  - [ ] Add lazy-loaded route `play/:fileId` to `app.routes.ts`
- [ ] Task 2: Implement video element with streaming source (AC: #1, #2, #4)
  - [ ] Read `fileId` from route params (`ActivatedRoute.snapshot.paramMap`)
  - [ ] Set `<video>` element `src` to `/api/media/stream/${fileId}`
  - [ ] Add `autoplay` attribute for instant playback on navigation
  - [ ] Add `controls` attribute for native HTML5 player controls
  - [ ] Set `preload="auto"` to begin buffering immediately
- [ ] Task 3: Implement standard playback controls via native `<video controls>` (AC: #3, #4, #5, #6)
  - [ ] Native controls provide: play/pause, seek bar, volume slider, fullscreen toggle
  - [ ] Verify native seek works via HTTP range requests (no custom seek logic needed)
  - [ ] Verify volume adjustment works via native controls
  - [ ] Verify fullscreen enter/exit works via native controls
- [ ] Task 4: Implement back navigation (AC: #7)
  - [ ] Add back link/button that calls `location.back()`
  - [ ] Style consistently with detail page back-link pattern
- [ ] Task 5: Style player page (AC: #1)
  - [ ] Full-viewport video element (dark background, centered)
  - [ ] Back link positioned top-left, visible on hover or always visible
  - [ ] Responsive: video fills available space at all viewports
- [ ] Task 6: Write component tests (AC: all)
  - [ ] Test component creates with route param
  - [ ] Test video element has correct `src` attribute based on fileId
  - [ ] Test video element has `controls`, `autoplay`, and `preload` attributes
  - [ ] Test back button exists and triggers navigation

## Dev Notes

### Architecture & Design Decisions

**Component approach:** Create a standalone Angular component `PlayerComponent` at `apps/frontend/src/app/player/`. Use the native HTML5 `<video controls>` element — the UX spec explicitly states "Standard HTML5 video controls pattern." Do NOT build custom controls for this story.

**Why native controls:** The UX design spec says "Standard HTML5 video controls pattern" and "Controls within the video player during playback." Browser-native controls satisfy all ACs (play, pause, seek, volume, fullscreen) with zero custom JS. Custom controls would add unnecessary complexity and accessibility burden.

**Autoplay:** The user navigates to `/play/:fileId` by clicking a Play link on a detail page. This explicit user gesture satisfies browser autoplay policies. Use the `autoplay` attribute. If autoplay fails (e.g., strict browser policy), the user simply clicks the play button in the native controls — this is acceptable degradation.

**Tier 2 handling in this story:** The backend serves the original video file at `GET /api/media/stream/:fileId` regardless of tier. For Tier 2 files, the original video will play but audio may not decode (incompatible codec is why the sidecar exists). This is EXPECTED — Story 5.3 adds dual-element audio sync for Tier 2. Do NOT add any tier detection or sidecar logic in this story.

**No metadata fetch needed:** The player does not display title, poster, or any metadata. The `fileId` comes directly from the route parameter. The only backend interaction is the browser's native fetch of the video `src` URL. No Angular HttpClient call is needed in this component.

**Route structure:** `/play/:fileId` where `fileId` is `media_files.id` (integer). This matches the existing `[routerLink]="['/play', m.file_id]"` links already in `movie-detail.component.html` and `show-detail.component.html`.

### Critical Implementation Details

**Video source URL:** `/api/media/stream/${fileId}` — this is the exact backend endpoint from Story 5.1. The backend handles range requests, MIME type detection, and tier-based file resolution transparently.

**Range request support is automatic:** The `<video>` element's native fetch behavior sends Range headers. The backend responds with 206 Partial Content. The developer does NOT need to implement any range logic on the frontend — it's all browser-native.

**Playback start time (NFR1 < 1000ms):** Achieved by:

1. No API calls before rendering the video element
2. `preload="auto"` starts buffering immediately
3. `autoplay` begins playback as soon as sufficient data is buffered
4. Backend serves static files with no processing (NFR3)
5. LAN network latency is negligible

### Project Structure Notes

**New files to create:**

```
apps/frontend/src/app/player/
├── player.component.ts
├── player.component.html
├── player.component.css
└── player.component.spec.ts
```

**Files to modify:**

- `apps/frontend/src/app/app.routes.ts` — add player route

**Naming conventions (matching existing patterns):**

- Folder: `player/` (same level as `home/`, `movie-detail/`, `show-detail/`)
- Selector: `app-player`
- Route path: `play/:fileId`

### Component Pattern to Follow

Follow the exact same patterns as `MovieDetailComponent`:

- `standalone: true`
- `ChangeDetectionStrategy.OnPush`
- `inject(ActivatedRoute)` for route params
- `inject(Location)` for back navigation
- `templateUrl` + `styleUrl` (separate files)
- Import `RouterLink` if needed (for back link as anchor)

**Minimal component — no service injection needed.** The video src is computed directly from the route param.

### Styling Requirements

- Page background: `var(--color-bg)` (#1a1a1a) — dark, cinema-like
- Video element: fill available viewport space (use `width: 100%`, `max-height: 100vh`, `object-fit: contain`)
- Back link: positioned at top-left, styled like existing `.back-link` pattern (button with `location.back()`)
- No layout chrome — the video IS the page content
- Responsive: works at tablet (primary device per UX spec), phone, and desktop

### Testing Standards

- Use Angular TestBed with standalone component testing
- Provide `ActivatedRoute` mock with `snapshot.paramMap.get('fileId')` returning a test ID
- Provide `Location` mock for back navigation testing
- Test file: `player.component.spec.ts` co-located with source
- Assertions: video src binding, attributes present, back button exists
- Do NOT test actual video playback (integration concern, not unit test)

### What NOT To Do (Anti-Patterns)

- Do NOT build custom video controls (seek bar, play button, volume slider) — use native `<video controls>`
- Do NOT add tier detection or sidecar logic — that's Story 5.3
- Do NOT add subtitle track logic — that's Story 5.4
- Do NOT add audio track selection — that's Story 5.5
- Do NOT fetch metadata from the library API — the player doesn't need it
- Do NOT add watch progress tracking — that's Epic 6
- Do NOT add loading spinners or buffering indicators — UX spec says "No buffering indicator ever appears"
- Do NOT add `@angular/cdk` or any external player library
- Do NOT override `outline: none` on focusable elements (UX accessibility requirement)

### Previous Story Intelligence (5-1)

**Established backend patterns:**

- Media streaming endpoint: `GET /api/media/stream/:fileId` serves video with range requests
- Audio sidecar: `GET /api/media/stream/:fileId/audio` (Tier 2 only — NOT used in this story)
- Subtitles: `GET /api/media/subtitles/:subtitleId` (NOT used in this story)
- Backend uses `StreamableFile` with 206 responses, proper Content-Range headers
- Files only served when status is "ready" or transcode is "completed"
- Path traversal prevention via validation in `MediaService`

**Code quality patterns from previous stories:**

- Single commit per story (e.g., "implement 5-1")
- Clean, minimal code — no over-engineering
- Tests co-located with source files (`.spec.ts`)
- OnPush change detection on all components
- `toSignal()` for reactive data (though NOT needed here — no async data)
- `inject()` function style over constructor injection

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 5, Story 5.2]
- [Source: _bmad-output/planning-artifacts/prd.md — FR22, FR23, FR28, FR29, NFR1, NFR2]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Video Playback, Standard HTML5 Controls]
- [Source: _bmad-output/planning-artifacts/architecture.md — Frontend Architecture (Angular Signals, OnPush, Standalone)]
- [Source: apps/frontend/src/app/app.routes.ts — Existing routing pattern]
- [Source: apps/frontend/src/app/movie-detail/movie-detail.component.ts — Component pattern reference]
- [Source: apps/frontend/src/app/movie-detail/movie-detail.component.html — Play button links to /play/:file_id]
- [Source: apps/frontend/src/app/show-detail/show-detail.component.html — Episode play links to /play/:file_id]
- [Source: apps/backend/src/media/media.controller.ts — Stream endpoint implementation]
- [Source: _bmad-output/implementation-artifacts/5-1-media-file-serving-via-http-range-requests.md — Previous story]

## Dev Agent Record

### Agent Model Used

### Completion Notes List

### Change Log

### File List

### Review Findings
