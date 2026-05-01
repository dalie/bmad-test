---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-02b-vision
  - step-02c-executive-summary
  - step-03-success
  - step-04-journeys
  - step-05-domain
  - step-06-innovation
  - step-07-project-type
  - step-08-scoping
  - step-09-functional
  - step-10-nonfunctional
  - step-11-polish
  - step-12-complete
inputDocuments:
  - product-brief-bmad.md
  - product-brief-bmad-distillate.md
workflowType: 'prd'
releaseMode: phased
classification:
  projectType: web_app
  domain: general
  complexity: low
  projectContext: greenfield
---

# Product Requirements Document - Cineplex Rigaud

**Author:** Dude
**Date:** 2026-04-28

## Executive Summary

Cineplex Rigaud is a self-hosted media server that inverts the architecture of every existing solution. Instead of transcoding video on-the-fly when someone hits play — burning CPU, causing seek latency, and degrading under concurrent viewers — it processes only what's necessary at import time, then serves static files directly via HTTP range requests. The result: instant playback, instant seeking, near-zero server load, and hardware requirements low enough to run on a Raspberry Pi.

The product serves two distinct personas. The **admin** is a technically-minded homelabber who maintains a video library (often actively seeding) and wants to share it with family without becoming permanent tech support. The **viewer** is a non-technical family member or friend who opens a browser, picks a movie, and watches — no accounts, no apps, no configuration. Watch progress persists in the browser's localStorage; each device is its own profile.

The smart transcode pipeline handles three tiers: files with web-compatible audio play as-is (zero processing), files with incompatible audio (AC3, DTS, TrueHD) get a small AAC sidecar (~2-3% storage overhead) while the original stays untouched, and the rare non-web video codec triggers a full transcode. Source files are never modified — critical for libraries that are actively seeding.

### What Makes This Special

Every self-hosted media server — Plex, Jellyfin, Emby — made the same architectural bet: defer transcoding to play time. That single decision cascades into CPU saturation, 1-5 second seek latency, hardware requirements (~2000 PassMark per 1080p stream), and buffering under concurrent viewers. Cineplex Rigaud's core insight is that this is the wrong moment to burn resources. Process once at import when nobody's waiting, then serve static files forever. The server's entire job at play time is responding to HTTP range requests.

This is now viable because modern browsers (Chrome, Firefox) play MKV containers with H.264/H.265 natively — the container isn't the blocker, incompatible audio codecs are. That narrow gap is what the sidecar approach exploits: transcode only the audio track, leave everything else alone.

## Project Classification

- **Project Type:** Web application — browser-based UI with backend API
- **Domain:** Media/entertainment (general)
- **Complexity:** Low — standard web technologies, no regulatory requirements
- **Project Context:** Greenfield — new product, no existing codebase

## Success Criteria

### User Success

- **Instant playback:** Sub-1000ms from "hit play" to first frame rendering, for any title in the library
- **Instant seeking:** Seeking to any point in a video completes without visible buffering or re-loading
- **Zero-guidance UI:** An elderly, non-technical user can browse the library, find a movie, play it, and resume where they left off — without any instruction or explanation
- **Watch progress persistence:** Resume position tracked per-device via localStorage, survives browser restarts
- **Subtitle access:** Embedded and sidecar subtitles available as selectable tracks during playback

### Business Success

- Personal project — no revenue or adoption targets
- Success = the admin (you) and your family/friends actively use it as the primary way to watch your library
- Plex is no longer needed
- Nobody calls you for tech support

### Technical Success

- **Playback server load:** Near-zero CPU during playback — static file serving only (HTTP range requests)
- **Concurrent viewers:** Multiple simultaneous viewers with no performance degradation
- **Hardware floor:** Runs comfortably on a first-gen Ryzen 5 system during both import processing and playback
- **Source file integrity:** Source files are never read-written, never modified, never moved — read-only access only
- **Import pipeline:** No time constraint — unattended processing is acceptable. A full 500-title library scan can take hours as long as it completes reliably
- **Audio sidecar overhead:** ~2-3% of library storage size for AAC sidecars

### Measurable Outcomes

| Metric | Target |
|---|---|
| Time to first frame | < 1000ms |
| Seek completion | Instant (native browser range request) |
| Server CPU during playback | < 5% per concurrent viewer |
| Import failure rate | < 1% of titles (with clear error reporting for failures) |
| UI task completion (elderly user) | Browse → Play without assistance |
| Source file modification | Zero — verified by checksum |

## User Journeys

### Journey 1: Marie's Movie Night (Viewer — Happy Path)

**Marie, 72, retired.** Her son set up Cineplex Rigaud on his home server and texted her a bookmark link. She's on her iPad in the living room.

She opens the link and sees a clean grid of movie posters — recognizable, inviting, like browsing a video store. She spots a movie her friend mentioned last week, taps the poster, reads the description. She taps Play. The movie starts immediately — no loading spinner, no buffering. Midway through, she pauses to make tea. The next evening she opens the same bookmark — the movie shows her progress bar. She taps it, resumes exactly where she stopped. She finishes the movie, it's marked as watched. She browses for the next one.

She never created an account. She never configured anything. She never called her son.

**Reveals:** Library browsing, poster grid UI, instant playback, localStorage watch progress, resume functionality, watched status tracking, responsive design (iPad).

### Journey 2: Marc's Foreign Film (Viewer — Subtitles & Edge Cases)

**Marc, 35, cinephile, watches on his desktop.** He picks a Japanese film from the library, hits play — instant start. The audio is Japanese. He clicks the subtitle selector overlay during playback, sees "English" and "French" tracks extracted from the original file, picks English. WebVTT subtitles appear immediately. Later he tries an older title that had a non-web video codec — the server already transcoded it to MP4 at import time. Marc doesn't notice any difference. Playback is instant, seeking is instant. The system handled it silently.

**Reveals:** Subtitle track selection during playback, WebVTT extraction pipeline, transparent Tier 2/3 transcode handling, desktop responsive layout.

### Journey 3: Sophie's Saturday Cartoons (Viewer — Age-Filtered Profile) [Post-MVP]

**Sophie, 8, uses the family laptop.** Her dad set up a profile called "Sophie" with an age preference. When she opens Cineplex Rigaud and selects her profile, she only sees movies and shows rated G and PG — the R-rated horror movies and mature TV shows aren't visible. She browses animated movies, picks one, and watches. Her watch progress is separate from her parents'. She doesn't know content is being filtered — it just looks like a library of stuff she'd like.

Her dad switches to his own profile on the same laptop and sees the full library, unrestricted. Profiles are just names with an age preference — no passwords, selectable from a simple picker.

**Reveals:** Profile selector (name + age preference), TMDB content rating filtering, per-profile watch progress, profile switching without authentication, responsive layout.

### Journey 4: Dude's Setup Day (Admin — Initial Setup & Maintenance)

**Dude, the homelabber.** He pulls the Docker image, maps his media volume (`/mnt/media/movies`, `/mnt/media/tv`), and starts the container. He opens the web UI from his desktop — since he's on the same LAN as the server, an admin section is visible in the navigation.

In the admin panel he sees the import pipeline running: 300 files detected, TMDB matching in progress, transcode queue processing. Most files are H.264 + AC3 — the pipeline generates AAC sidecars for each. 12 files fail TMDB matching due to ambiguous filenames — they show up in a "Needs Attention" list where he can manually search TMDB and assign the correct match. The whole process runs unattended over a few hours.

A week later he drops 5 new movies into the media folder. The folder watcher detects them, automatically scans, matches, and processes. His family is already watching other content — zero interruption, the new titles just appear in the library.

He checks the admin panel occasionally — sees import status, library stats, any files that need attention. When he's away from home, the admin section isn't visible to viewers on the network.

**Reveals:** Docker deployment, folder watcher, TMDB matching pipeline, manual match fallback, import status dashboard, LAN-only admin visibility, unattended processing, library growth without disruption.

### Journey Requirements Summary

| Journey | Capabilities Revealed | Scope |
|---|---|---|
| Marie's Movie Night | Library browsing, poster grid, instant playback, watch progress (localStorage), resume, responsive (tablet/mobile) | **MVP** |
| Marc's Foreign Film | Subtitle selection, WebVTT pipeline, transparent multi-tier transcode, responsive (desktop) | **MVP** |
| Sophie's Cartoons | Profile selector, age-based content filtering (TMDB ratings), per-profile watch progress | **Post-MVP** |
| Dude's Setup Day | Docker deployment, folder watcher, TMDB matching + manual fallback, import pipeline dashboard, LAN-only admin UI | **MVP** |

## Innovation & Novel Patterns

### Detected Innovation Areas

**Architectural Inversion: Import-Time Processing, Zero-Runtime Compute**

Every self-hosted media server (Plex, Jellyfin, Emby) defers transcoding to play time. Cineplex Rigaud inverts this entirely — all processing happens at import, and the server becomes a static file server during playback. This is not an optimization of the existing model; it's a different architecture.

**Audio-Only Sidecar Strategy**

Rather than remuxing or duplicating entire files, Cineplex Rigaud exploits a narrow compatibility gap: modern browsers play MKV/H.264/H.265 natively, but can't decode AC3/DTS/TrueHD audio. The sidecar approach extracts and transcodes only the audio track (~2-3% storage overhead), leaving source files untouched. This is a novel solution to a well-understood problem.

**Dual-Element Synced Playback**

Using `<video muted>` + `<audio>` with JavaScript sync is an unconventional browser playback approach that enables the sidecar strategy without requiring MediaSource Extensions or HLS segmentation.

### Market Context & Competitive Landscape

- **Plex:** On-the-fly transcode, cloud dependency, paywall, feature bloat
- **Jellyfin:** On-the-fly transcode (same core architecture as Plex), manual hardware acceleration config, volunteer-driven polish
- **Emby:** Closed-source, paid tiers, less community momentum
- **None** offer pre-processing or zero-runtime-compute architecture — this is unoccupied territory

### Validation Approach

1. **Dual-element audio sync** — Needs early prototyping to validate drift tolerance. Key question: does seek/pause/resume introduce sync gaps beyond the ~50ms correction threshold?
2. **H.265 browser support matrix** — Partial browser support means some files may not play as-is. Needs testing across Chrome, Firefox, Edge, Safari on actual target devices.
3. **Filename parsing robustness** — Torrent naming conventions vary widely. The TMDB matching pipeline needs validation against a real library to measure match rate.

## Web Application Specific Requirements

### Project-Type Overview

Cineplex Rigaud is a single-page application (SPA) with a backend API. The frontend is a media browsing and playback interface; the backend handles library scanning, metadata, transcode orchestration, and static file serving. The architecture is designed for perceived speed at every interaction — page transitions, browsing, and playback should all feel instant.

### Browser Support Matrix

| Browser | Support Level | Notes |
|---|---|---|
| Chrome (latest 2 versions) | **Primary** | Full MKV/H.264/H.265 playback, full feature support |
| Firefox (latest 2 versions) | **Primary** | Full MKV/H.264 playback, H.265 requires hardware decoder (137+, Windows) |
| Edge | **Not targeted** | Chromium-based, likely works but not tested |
| Safari | **Not targeted** | Different codec landscape, not a priority |

### Responsive Design

- **Responsive layout** — works on desktop, tablet, and mobile screen sizes
- **Touch-friendly** — large tap targets for poster grid, playback controls, and navigation
- **Browser zoom compatible** — UI must remain functional and readable at 150%+ zoom
- **No minimum resolution** — layout adapts gracefully from phone to ultrawide

### Performance Targets

| Metric | Target | Technique |
|---|---|---|
| Initial page load (library) | < 1s perceived | Route-based code splitting, lazy loading |
| Page-to-page navigation | Instant (< 100ms) | SPA client-side routing, prefetching |
| Poster grid rendering | Instant scroll | Virtualized list/grid, lazy image loading, thumbnail CDN-style caching |
| Image loading | Progressive | Serve low-res blurred placeholders, swap to full poster on load |
| Time to first frame (playback) | < 1000ms | HTTP range requests, no server processing |
| API responses (metadata) | < 200ms | Server-side caching, pre-computed library indexes |

**Snappiness techniques to employ:**
- Optimistic UI updates where applicable
- Prefetch next-likely content (e.g., when hovering a poster, prefetch metadata)
- Image sprite sheets or pre-sized thumbnails to avoid layout shift
- Route preloading for common navigation paths
- Minimal JavaScript bundle — code split aggressively

### SEO Strategy

Not applicable — private self-hosted server, no public indexing needed. No SSR required.

### Accessibility

- No formal WCAG target
- UI must be usable with browser zoom (up to 200%)
- Large, readable text and clear visual hierarchy
- High-contrast poster grid with legible titles
- Playback controls large enough for touch and imprecise input

### Technical Architecture Considerations

- **Frontend:** SPA framework (Angular preferred, architecture decision to confirm). Client-side routing, no SSR.
- **Backend API:** RESTful endpoints for library browsing, metadata, search, import status. Serves media files via HTTP range requests.
- **State management:** localStorage for watch progress. No server-side session state.
- **Admin UI:** Same SPA, admin routes visible only when client IP is on the server's LAN subnet.
- **Deployment:** Docker container — single image bundles frontend + backend.

### Implementation Considerations

- Frontend and backend can be developed and tested independently
- Frontend builds to static assets served by the backend
- No WebSocket/real-time requirements in V1 — polling or manual refresh for library updates
- Audio sidecar sync logic lives entirely in the frontend (JavaScript `requestAnimationFrame` loop)
- Subtitle rendering via native `<track>` element with WebVTT files

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP Approach:** Problem-solving MVP — the minimum that proves the core architectural bet (import-time processing + static file serving) delivers on the promise of instant playback and instant seeking.

**Resource Requirements:** Solo developer. All design, implementation, and testing. This means:
- Prioritize validating risky assumptions early (dual-element sync, TMDB matching)
- Build vertically — get one movie playing end-to-end before building the full library UI
- Accept rough edges in admin UX; polish viewer UX since that's the product surface

### MVP Feature Set (Phase 1)

**Core User Journeys Supported:**
- Marie's Movie Night (viewer happy path)
- Marc's Foreign Film (subtitles, edge cases)
- Dude's Setup Day (admin setup and maintenance)

**Must-Have Capabilities:**
- Folder scanning and video file detection
- TMDB metadata matching (movies and TV shows) with manual fallback for ambiguous filenames
- Smart transcode pipeline: Tier 1 (serve original), Tier 2 (AAC audio sidecar), Tier 3 (full transcode)
- Dual-element synced playback (`<video muted>` + `<audio>`) with `requestAnimationFrame` sync loop
- Subtitle extraction (embedded + sidecar) served as WebVTT
- Web UI: poster grid browse, movie/show detail, video player with subtitle/audio track selection
- Watch progress via localStorage (per-device, per-browser)
- Backend API: library endpoints, metadata, media serving via HTTP range requests
- Admin panel (LAN-only visibility): import status, TMDB matching queue, manual match UI
- Folder watcher for new content detection
- Docker deployment (single container: frontend + backend)
- Responsive layout (mobile, tablet, desktop)

### Post-MVP Features (Phase 2)

- YouTube search integration + yt-dlp downloading
- TorrentDay RSS feed → .torrent file download to pickup folder
- Server-side profiles (unsecured — name + age preference, switchable, no passwords)
- Age-based content filtering using TMDB ratings
- Per-profile watch progress (server-side)
- Smart collections / auto-categorization
- Richer metadata (cast pages, recommendations, related titles)

### Vision Features (Phase 3+)

- Adaptive multi-rendition support for remote/bandwidth-constrained viewers
- Community-contributed UI themes
- Additional content acquisition sources
- NFO file parsing as TMDB matching fallback

### Risk Mitigation Strategy

**Technical Risks:**

| Risk | Severity | Mitigation |
|---|---|---|
| Dual-element audio sync drift | High | Prototype sync early — build a standalone test page before full UI. If drift exceeds tolerance, fall back to remuxed MP4 for affected files |
| H.265 browser support gaps | Medium | Client-side codec detection; flag unsupported files for full transcode at import |
| TMDB filename matching rate | Medium | Start with common torrent naming patterns; manual match UI covers failures; measure match rate against real library |
| Solo developer bottleneck | Medium | Build vertically (one working flow end-to-end), avoid premature polish, focus on core playback first |

**Market Risks:**
- Minimal — personal project, no market validation needed. Success = you and your family use it.

**Resource Risks:**
- Solo developer — if energy/time drops, the MVP is scoped tightly enough to be usable even if post-MVP features never ship. A working library browser with instant playback is valuable on its own.

## Functional Requirements

### Library Management

- **FR1:** Admin can configure one or more media source folders for the system to monitor
- **FR2:** System can detect new, modified, and removed video files in monitored folders
- **FR3:** System can parse video filenames to extract title, year, season, and episode information
- **FR4:** System can match detected files against TMDB for metadata (title, description, poster, ratings, episode info)
- **FR5:** Admin can manually search TMDB and assign a match when automatic matching fails
- **FR6:** Admin can view a list of files that failed automatic TMDB matching ("Needs Attention" queue)
- **FR7:** System can detect and catalog embedded subtitle tracks and sidecar subtitle files (.srt, .ass, etc.)
- **FR8:** System can probe video files to determine video codec, audio codec, and container format

### Transcode Pipeline

- **FR9:** System can classify each file into the appropriate transcode tier (Tier 1: serve original, Tier 2: audio sidecar, Tier 3: full transcode)
- **FR10:** System can extract and transcode incompatible audio tracks to AAC sidecar files without modifying the source file
- **FR11:** System can perform full video transcode to MP4 with faststart for files with non-web-compatible video codecs
- **FR12:** System can convert embedded and sidecar subtitles to WebVTT format
- **FR13:** System can process the transcode queue unattended in the background
- **FR14:** Admin can view transcode pipeline status (queued, processing, completed, failed)

### Media Browsing

- **FR15:** Viewer can browse the library as a poster grid of movies
- **FR16:** Viewer can browse the library as a poster grid of TV shows
- **FR17:** Viewer can view detail information for a movie (title, description, poster, year, rating, runtime)
- **FR18:** Viewer can view detail information for a TV show including season and episode listings
- **FR19:** Viewer can see watch progress indicators on titles they've partially watched
- **FR20:** Viewer can see watched status on titles they've completed
- **FR21:** Viewer can search the library by title

### Video Playback

- **FR22:** Viewer can play any video file in the library with sub-1000ms time to first frame
- **FR23:** Viewer can seek to any point in a video with instant response
- **FR24:** System can serve video content via HTTP range requests with no server-side processing at play time
- **FR25:** System can synchronize playback of a muted video element with a separate audio sidecar element (dual-element sync)
- **FR26:** Viewer can select from available subtitle tracks during playback
- **FR27:** Viewer can select from available audio tracks during playback (when multiple exist)
- **FR28:** Viewer can pause, resume, and control playback volume
- **FR29:** Viewer can enter and exit fullscreen playback

### Watch Progress

- **FR30:** System can persist watch progress per-title in the browser's localStorage
- **FR31:** Viewer can resume playback from their last watched position
- **FR32:** System can mark a title as "watched" when playback reaches near the end

### Admin Panel

- **FR33:** System can detect whether the client is on the same local network as the server
- **FR34:** Admin can access the admin panel only when viewing from the server's LAN
- **FR35:** Admin can view library statistics (total titles, movies, TV shows, transcode status breakdown)
- **FR36:** Admin can trigger a manual library rescan
- **FR37:** Admin can view import and transcode error details for failed files

### Deployment

- **FR38:** Admin can deploy the application as a single Docker container
- **FR39:** Admin can configure media source folders via Docker volume mounts
- **FR40:** System can serve the frontend SPA and backend API from the same container

## Non-Functional Requirements

### Performance

- **NFR1:** Time to first frame must be < 1000ms for any title in the library
- **NFR2:** Seeking must complete within the browser's native range-request response time (no server-side delay)
- **NFR3:** Server CPU usage during playback must be < 5% per concurrent viewer (static file serving only)
- **NFR4:** Library browsing page load must feel instant (< 1s perceived) using lazy loading
- **NFR5:** API metadata responses must return within 200ms
- **NFR6:** SPA page-to-page navigation must complete in < 100ms (client-side routing)
- **NFR7:** Poster grid must scroll smoothly with virtualized rendering and lazy image loading
- **NFR8:** Dual-element audio sync drift must stay within 50ms correction threshold during normal playback, seek, pause, and resume

### Security

- **NFR9:** Source media files must never be modified — read-only filesystem access only
- **NFR10:** Admin panel routes must only be accessible from the server's local network subnet
- **NFR11:** No user credentials, tokens, or sensitive data stored anywhere in the system
- **NFR12:** TMDB API key must not be exposed to the frontend client

### Reliability

- **NFR13:** Import pipeline must recover gracefully from individual file failures without halting the entire scan
- **NFR14:** Failed TMDB matches must be queued for manual resolution, not silently dropped
- **NFR15:** Failed transcodes must be logged with error details and retryable
- **NFR16:** Folder watcher must handle partially written files (in-progress downloads) without crashing or producing corrupt output
- **NFR17:** Playback must work independently of import pipeline status — watching is never blocked by processing

### Integration

- **NFR18:** System must handle TMDB API rate limits gracefully (backoff/retry, not crash)
- **NFR19:** System must handle TMDB API unavailability gracefully — library browsing and playback work without TMDB connectivity
- **NFR20:** FFmpeg must be bundled in the Docker image — no external dependency installation required
- **NFR21:** TMDB image base URL must be cached and refreshed periodically per API documentation
