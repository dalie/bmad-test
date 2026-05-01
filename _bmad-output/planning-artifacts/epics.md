---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
inputDocuments:
  - prd.md
  - architecture.md
  - ux-design-specification.md
---

# Cineplex Rigaud - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Cineplex Rigaud, decomposing the requirements from the PRD, UX Design, and Architecture into implementable stories.

## Requirements Inventory

### Functional Requirements

- FR1: Admin can configure one or more media source folders for the system to monitor
- FR2: System can detect new, modified, and removed video files in monitored folders
- FR3: System can parse video filenames to extract title, year, season, and episode information
- FR4: System can match detected files against TMDB for metadata (title, description, poster, ratings, episode info)
- FR5: Admin can manually search TMDB and assign a match when automatic matching fails
- FR6: Admin can view a list of files that failed automatic TMDB matching ("Needs Attention" queue)
- FR7: System can detect and catalog embedded subtitle tracks and sidecar subtitle files (.srt, .ass, etc.)
- FR8: System can probe video files to determine video codec, audio codec, and container format
- FR9: System can classify each file into the appropriate transcode tier (Tier 1: serve original, Tier 2: audio sidecar, Tier 3: full transcode)
- FR10: System can extract and transcode incompatible audio tracks to AAC sidecar files without modifying the source file
- FR11: System can perform full video transcode to MP4 with faststart for files with non-web-compatible video codecs
- FR12: System can convert embedded and sidecar subtitles to WebVTT format
- FR13: System can process the transcode queue unattended in the background
- FR14: Admin can view transcode pipeline status (queued, processing, completed, failed)
- FR15: Viewer can browse the library as a poster grid of movies
- FR16: Viewer can browse the library as a poster grid of TV shows
- FR17: Viewer can view detail information for a movie (title, description, poster, year, rating, runtime)
- FR18: Viewer can view detail information for a TV show including season and episode listings
- FR19: Viewer can see watch progress indicators on titles they've partially watched
- FR20: Viewer can see watched status on titles they've completed
- FR21: Viewer can search the library by title
- FR22: Viewer can play any video file in the library with sub-1000ms time to first frame
- FR23: Viewer can seek to any point in a video with instant response
- FR24: System can serve video content via HTTP range requests with no server-side processing at play time
- FR25: System can synchronize playback of a muted video element with a separate audio sidecar element (dual-element sync)
- FR26: Viewer can select from available subtitle tracks during playback
- FR27: Viewer can select from available audio tracks during playback (when multiple exist)
- FR28: Viewer can pause, resume, and control playback volume
- FR29: Viewer can enter and exit fullscreen playback
- FR30: System can persist watch progress per-title in the browser's localStorage
- FR31: Viewer can resume playback from their last watched position
- FR32: System can mark a title as "watched" when playback reaches near the end
- FR33: System can detect whether the client is on the same local network as the server
- FR34: Admin can access the admin panel only when viewing from the server's LAN
- FR35: Admin can view library statistics (total titles, movies, TV shows, transcode status breakdown)
- FR36: Admin can trigger a manual library rescan
- FR37: Admin can view import and transcode error details for failed files
- FR38: Admin can deploy the application as a single Docker container
- FR39: Admin can configure media source folders via Docker volume mounts
- FR40: System can serve the frontend SPA and backend API from the same container

### NonFunctional Requirements

- NFR1: Time to first frame must be < 1000ms for any title in the library
- NFR2: Seeking must complete within the browser's native range-request response time (no server-side delay)
- NFR3: Server CPU usage during playback must be < 5% per concurrent viewer (static file serving only)
- NFR4: Library browsing page load must feel instant (< 1s perceived) using lazy loading
- NFR5: API metadata responses must return within 200ms
- NFR6: SPA page-to-page navigation must complete in < 100ms (client-side routing)
- NFR7: Poster grid must scroll smoothly with virtualized rendering and lazy image loading
- NFR8: Dual-element audio sync drift must stay within 50ms correction threshold during normal playback, seek, pause, and resume
- NFR9: Source media files must never be modified — read-only filesystem access only
- NFR10: Admin panel routes must only be accessible from the server's local network subnet
- NFR11: No user credentials, tokens, or sensitive data stored anywhere in the system
- NFR12: TMDB API key must not be exposed to the frontend client
- NFR13: Import pipeline must recover gracefully from individual file failures without halting the entire scan
- NFR14: Failed TMDB matches must be queued for manual resolution, not silently dropped
- NFR15: Failed transcodes must be logged with error details and retryable
- NFR16: Folder watcher must handle partially written files (in-progress downloads) without crashing or producing corrupt output
- NFR17: Playback must work independently of import pipeline status — watching is never blocked by processing
- NFR18: System must handle TMDB API rate limits gracefully (backoff/retry, not crash)
- NFR19: System must handle TMDB API unavailability gracefully — library browsing and playback work without TMDB connectivity
- NFR20: FFmpeg must be bundled in the Docker image — no external dependency installation required
- NFR21: TMDB image base URL must be cached and refreshed periodically per API documentation

### Additional Requirements

- Starter template: NestJS monorepo + Angular (with Signals) + npm workspaces, scaffolded via Nest CLI and Angular CLI
- Database: Raw SQLite via better-sqlite3 (no ORM), manual SQL migration scripts (e.g., umzug)
- Validation at DTO/service layer (class-validator or Zod)
- Dockerized single-container deployment with .env files for secrets/config
- No authentication — LAN-only, trusted environment
- REST API (standard HTTP endpoints), no Swagger/OpenAPI documentation
- Security middleware: Helmet for HTTP headers, CORS, basic rate limiting (express-rate-limit)
- Manual backup of media and SQLite DB
- FFmpeg bundled in Docker image
- Frontend built to static assets served by the backend
- No WebSocket/real-time requirements in V1 — polling or manual refresh for library updates
- Angular: Signals for local/UI state, RxJS for async/streams, feature modules, presentational/container split, standalone components, lazy loading, OnPush change detection
- No Angular CDK

### UX Design Requirements

- UX-DR1: Implement hand-written CSS design system — global stylesheet with reset.css, variables.css, typography.css, layout.css; Angular component-scoped styles for component-specific rules. No CSS framework, no preprocessor.
- UX-DR2: Implement CSS custom property design tokens — spacing scale (xs through 2xl), color palette (bg, surface, surface-raised, text, text-muted, text-dim, accent, accent-hover, error, success), typography scale (xs through 2xl), and layout tokens (poster-width: 180px, poster-ratio: 2/3, grid-gap, content-max-width: 1400px). Dark theme by default.
- UX-DR3: Implement poster grid layout — CSS Grid with auto-fill and minmax(180px, 1fr), 24px gap. Three sections in fixed order: Continue Watching (conditional on localStorage progress), Recently Added, Full Library A-Z. Section headers in --font-size-lg, left-aligned.
- UX-DR4: Implement movie/show detail page — poster left, text info right. Title in --font-size-xl, metadata in muted text, description in base size. Large deep orange Play button. Back link to library. Standard semantic HTML structure.
- UX-DR5: Implement watch progress indicators — thin deep orange progress bar at poster bottom edge (no overlay, no badge). Watched titles visually distinguished (dimmed). Continue Watching row only appears when localStorage has progress data.
- UX-DR6: Implement responsive layout — CSS Grid auto-fill handles poster count per row naturally. One or two @media breakpoints for poster sizing (larger on mobile, denser on desktop). No JavaScript for responsive behavior. Content max-width 1400px with generous padding.
- UX-DR7: Implement system font stack — system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif. No external font downloads. Generous line-height (1.6 base). rem-based sizing throughout.
- UX-DR8: Implement pre-sized image containers — all poster slots pre-sized with fixed 2:3 aspect ratio to prevent cumulative layout shift. Native loading="lazy" for images below the fold. No intersection observer theatrics.
- UX-DR9: Implement BEM-lite naming convention for global CSS classes (.poster-grid, .poster-grid__item, .poster-grid--loading). Semantic class names describing content, not appearance. Angular component encapsulation for component-scoped styles.
- UX-DR10: Enforce zero-animation policy — no CSS animations/transitions for UI elements, no hover effects, no expand/collapse, no autoplay previews, no skeleton screens, no shimmer effects. Prefers-reduced-motion satisfied by default.
- UX-DR11: Implement accessibility baseline — WCAG AA contrast ratios for all text/background combos, browser-default focus outlines preserved (never outline: none), high-contrast focus via --color-accent for keyboard navigation, minimum 44x44px touch targets, rem-based font sizing respects browser zoom.
- UX-DR12: Implement standard page navigation — all poster clicks are <a> tags linking to /movie/:id or /show/:id. Back button returns to grid at same scroll position. SPA routing behaves like real pages (bookmarkable, URL-driven state). No modals, no overlays.
- UX-DR13: Implement video player page — dual-element sync (video muted + audio) with requestAnimationFrame sync loop, subtitle selection via <track> element with WebVTT, standard playback controls (pause/resume, volume, fullscreen, seek). Audio sidecar sync logic lives entirely in the frontend.
- UX-DR14: Implement admin page as a separate route (/admin) — visible only when client IP is on server's LAN. Import pipeline status, TMDB matching queue, manual match UI, library statistics. No polish overhead — functional over beautiful.

### FR Coverage Map

| FR | Epic | Description |
|---|---|---|
| FR1 | Epic 2 | Configure media source folders |
| FR2 | Epic 2 | Detect new/modified/removed files |
| FR3 | Epic 2 | Parse filenames for metadata |
| FR4 | Epic 2 | TMDB metadata matching |
| FR5 | Epic 2 | Manual TMDB match fallback |
| FR6 | Epic 2 | Needs Attention queue |
| FR7 | Epic 2 | Subtitle track cataloging |
| FR8 | Epic 2 | Video file probing |
| FR9 | Epic 3 | Transcode tier classification |
| FR10 | Epic 3 | AAC audio sidecar extraction |
| FR11 | Epic 3 | Full video transcode |
| FR12 | Epic 3 | Subtitle conversion to WebVTT |
| FR13 | Epic 3 | Unattended queue processing |
| FR14 | Epic 3 | Pipeline status visibility |
| FR15 | Epic 4 | Movie poster grid |
| FR16 | Epic 4 | TV show poster grid |
| FR17 | Epic 4 | Movie detail page |
| FR18 | Epic 4 | TV show detail with seasons/episodes |
| FR19 | Epic 4 | Watch progress indicators |
| FR20 | Epic 4 | Watched status |
| FR21 | Epic 4 | Library search |
| FR22 | Epic 5 | Sub-1000ms playback start |
| FR23 | Epic 5 | Instant seeking |
| FR24 | Epic 5 | HTTP range request serving |
| FR25 | Epic 5 | Dual-element audio sync |
| FR26 | Epic 5 | Subtitle track selection |
| FR27 | Epic 5 | Audio track selection |
| FR28 | Epic 5 | Playback controls |
| FR29 | Epic 5 | Fullscreen toggle |
| FR30 | Epic 6 | localStorage watch progress |
| FR31 | Epic 6 | Resume from last position |
| FR32 | Epic 6 | Auto-mark as watched |
| FR33 | Epic 7 | LAN detection |
| FR34 | Epic 7 | LAN-only admin access |
| FR35 | Epic 7 | Library statistics |
| FR36 | Epic 7 | Manual rescan trigger |
| FR37 | Epic 7 | Error detail viewing |
| FR38 | Epic 1 | Docker deployment |
| FR39 | Epic 1 | Volume mount config |
| FR40 | Epic 1 | Single-container serving |

## Epic List

### Epic 1: Project Foundation & Docker Deployment
The admin can deploy the application as a Dockerized single container with NestJS backend and Angular frontend, configure media source folders, and access both the SPA and API from a single endpoint.
**FRs covered:** FR38, FR39, FR40

### Epic 2: Library Scanning & Metadata Matching
The admin can point the system at media folders and have it automatically detect video files, parse filenames, probe codecs, match against TMDB for metadata, and manually resolve failures — building a complete, browseable library.
**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8

### Epic 3: Smart Transcode Pipeline
The system processes the transcode queue unattended — classifying files into tiers, generating AAC audio sidecars, performing full transcodes when needed, extracting subtitles to WebVTT — while the admin monitors status and errors.
**FRs covered:** FR9, FR10, FR11, FR12, FR13, FR14

### Epic 4: Media Browsing & Library UI
Viewers can browse movies and TV shows as a poster grid with three sections (Continue Watching, Recently Added, A-Z), view detail pages with metadata, search the library, and see watch progress indicators — all with instant-feeling navigation.
**FRs covered:** FR15, FR16, FR17, FR18, FR19, FR20, FR21

### Epic 5: Video Playback & Dual-Element Sync
Viewers can play any title with sub-1000ms start, seek instantly, use dual-element audio sync for sidecar files, select subtitles and audio tracks, and control playback (pause/resume, volume, fullscreen).
**FRs covered:** FR22, FR23, FR24, FR25, FR26, FR27, FR28, FR29

### Epic 6: Watch Progress & Resume
The system persists watch progress in localStorage, viewers can resume from their last position, and completed titles are marked as watched — powering the Continue Watching row and progress indicators.
**FRs covered:** FR30, FR31, FR32

### Epic 7: Admin Panel & LAN-Only Access
The admin can access a LAN-only admin panel to view library stats, trigger rescans, monitor import/transcode status, and review error details — while viewers never see admin elements.
**FRs covered:** FR33, FR34, FR35, FR36, FR37

---

## Epic 1: Project Foundation & Docker Deployment

The admin can deploy the application as a Dockerized single container with NestJS backend and Angular frontend, configure media source folders, and access both the SPA and API from a single endpoint.

### Story 1.1: Scaffold Monorepo with NestJS Backend and Angular Frontend

As an admin,
I want a working monorepo with a NestJS backend and Angular frontend served from a single entry point,
So that I have a deployable application skeleton to build features on.

**Acceptance Criteria:**

**Given** a fresh checkout of the repository
**When** the developer runs `npm install` and starts the application
**Then** the NestJS backend starts and serves the Angular frontend as static assets on a single port
**And** the Angular app renders a placeholder home page at the root URL
**And** the backend responds to a health-check endpoint (`GET /api/health`) with a 200 status
**And** npm workspaces manage both `apps/backend` and `apps/frontend` packages
**And** the global CSS foundation is in place (reset.css, variables.css with design tokens, typography.css, layout.css, and global.css importing them all) per UX-DR1 and UX-DR2

### Story 1.2: Docker Deployment with Media Volume Mounts

As an admin,
I want to deploy the application as a single Docker container with configurable media source folders,
So that I can run Cineplex Rigaud on any machine with Docker and point it at my media library.

**Acceptance Criteria:**

**Given** a Dockerfile and docker-compose.yml exist in the repository root
**When** the admin runs `docker compose up`
**Then** a single container builds and starts, serving both the Angular SPA and NestJS API
**And** media source folders are configurable via Docker volume mounts (e.g., `/mnt/media/movies`, `/mnt/media/tv`)
**And** application configuration (TMDB API key, port, etc.) is loaded from `.env` files
**And** FFmpeg is bundled in the Docker image and available on the container's PATH
**And** the container runs with read-only access to mounted media source volumes (NFR9)
**And** a managed cache/output directory is mounted for generated artifacts (sidecars, thumbnails, transcodes)

---

## Epic 2: Library Scanning & Metadata Matching

The admin can point the system at media folders and have it automatically detect video files, parse filenames, probe codecs, match against TMDB for metadata, and manually resolve failures — building a complete, browseable library.

### Story 2.1: SQLite Database Setup and Media Source Configuration

As an admin,
I want to configure media source folders and have the system store library data in a SQLite database,
So that the system knows where to find my files and can persist library state.

**Acceptance Criteria:**

**Given** the application starts for the first time
**When** the backend initializes
**Then** a SQLite database is created (via better-sqlite3) with migration support (umzug or similar)
**And** initial migration creates tables for: media_sources (path, type, created_at), media_files (path, filename, source_id, status, probe_data, created_at, updated_at)
**And** media source folders are configurable via environment variables (e.g., `MEDIA_MOVIES_PATH`, `MEDIA_TV_PATH`)
**And** a REST endpoint `GET /api/config/sources` returns the configured media source folders
**And** the database file is stored in the managed cache directory (not in media source folders)

### Story 2.2: Folder Scanning and File Detection

As an admin,
I want the system to scan configured media folders and detect video files,
So that all my media is discovered and tracked in the library.

**Acceptance Criteria:**

**Given** media source folders are configured with video files present
**When** a library scan is triggered (on startup or via API endpoint `POST /api/library/scan`)
**Then** the system recursively scans all configured folders for video files (mkv, mp4, avi, etc.)
**And** new files are added to the media_files table with status "discovered"
**And** removed files are marked as "missing" in the database (not deleted)
**And** modified files (changed size/mtime) are flagged for re-processing
**And** the scan recovers gracefully from individual file access errors without halting (NFR13)
**And** partially written files (in-progress downloads) are skipped via stability checks (NFR16)
**And** source files are accessed read-only — never modified (NFR9)

### Story 2.3: Video File Probing with FFmpeg

As an admin,
I want the system to probe each discovered file for codec and format information,
So that the transcode pipeline knows how to process each file.

**Acceptance Criteria:**

**Given** a file exists in the media_files table with status "discovered"
**When** the probe service processes the file
**Then** FFmpeg (ffprobe) extracts: video codec, audio codec(s), container format, duration, resolution, and embedded subtitle tracks
**And** probe results are stored in the media_files table (probe_data JSON column)
**And** the file status is updated to "probed"
**And** embedded subtitle tracks and sidecar subtitle files (.srt, .ass, .sub) are cataloged in a subtitles table (FR7)
**And** probe failures are logged with error details and the file status is set to "probe_failed" (NFR13)

### Story 2.4: Filename Parsing and TMDB Metadata Matching

As an admin,
I want the system to parse filenames and automatically match files against TMDB for rich metadata,
So that my library has posters, descriptions, and accurate title information.

**Acceptance Criteria:**

**Given** a file has been probed successfully (status "probed")
**When** the matching service processes the file
**Then** the filename is parsed to extract: title, year, season number, and episode number (handling common torrent naming patterns)
**And** the system queries the TMDB API to find the best match based on extracted title/year
**And** matched metadata (title, description, poster URL, ratings, runtime, content rating) is stored in a metadata table
**And** for TV shows, season and episode info is fetched from TMDB and stored hierarchically
**And** the TMDB image base URL is cached and refreshed periodically (NFR21)
**And** the file status is updated to "matched"
**And** TMDB API rate limits are respected with exponential backoff/retry (NFR18)
**And** if TMDB is unavailable, the file is queued for retry and library browsing/playback of already-matched titles continues working (NFR19)

### Story 2.5: Manual TMDB Match and Needs Attention Queue

As an admin,
I want to see files that failed automatic matching and manually search TMDB to assign the correct match,
So that no files are silently lost from my library.

**Acceptance Criteria:**

**Given** a file has failed automatic TMDB matching
**When** the file status is set to "match_failed"
**Then** the file appears in the "Needs Attention" queue accessible via `GET /api/library/unmatched`
**And** the admin can search TMDB manually via `GET /api/tmdb/search?query=...&type=movie|tv`
**And** the admin can assign a TMDB match to a file via `POST /api/library/files/:id/match` with the TMDB ID
**And** once manually matched, metadata is fetched and stored, and the file status updates to "matched"
**And** failed matches are never silently dropped — they remain in the queue until resolved (NFR14)

### Story 2.6: Folder Watcher for New Content Detection

As an admin,
I want the system to automatically detect when new files are added to my media folders,
So that new content appears in the library without manual intervention.

**Acceptance Criteria:**

**Given** the application is running and media source folders are configured
**When** new video files are added to a monitored folder
**Then** the folder watcher detects the new files (via filesystem events or polling)
**And** new files are automatically queued for probing and matching
**And** the watcher handles partially written files by waiting for file stability before processing (NFR16)
**And** the watcher does not interfere with ongoing playback of existing titles (NFR17)
**And** watcher errors (permissions, disconnected volumes) are logged without crashing the application

---

## Epic 3: Smart Transcode Pipeline

The system processes the transcode queue unattended — classifying files into tiers, generating AAC audio sidecars, performing full transcodes when needed, extracting subtitles to WebVTT — while the admin monitors status and errors.

### Story 3.1: Transcode Tier Classification

As an admin,
I want the system to classify each probed file into the correct transcode tier,
So that only the minimum necessary processing is applied to each file.

**Acceptance Criteria:**

**Given** a file has been probed and matched (status "matched", probe_data populated)
**When** the classification service evaluates the file
**Then** Tier 1 (serve original) is assigned when video codec is web-compatible AND all audio codecs are web-compatible (AAC, Opus)
**And** Tier 2 (audio sidecar) is assigned when video codec is web-compatible BUT audio codec is incompatible (AC3, DTS, TrueHD, etc.)
**And** Tier 3 (full transcode) is assigned when the video codec is not web-compatible
**And** the assigned tier is stored in the media_files table
**And** the file status is updated to "classified"
**And** a transcode_jobs table is created with columns: file_id, tier, status (queued/processing/completed/failed), error_details, created_at, updated_at

### Story 3.2: AAC Audio Sidecar Generation (Tier 2)

As an admin,
I want the system to extract and transcode incompatible audio to AAC sidecar files,
So that video files with AC3/DTS/TrueHD audio can play in browsers without modifying the source.

**Acceptance Criteria:**

**Given** a file is classified as Tier 2 with a transcode job queued
**When** the transcode worker processes the job
**Then** FFmpeg extracts the primary audio track and transcodes it to AAC format
**And** the AAC sidecar file is saved to the managed cache directory (not in the source folder)
**And** the sidecar file path is stored in the database linked to the media file
**And** the source file is never modified — read-only access only (NFR9)
**And** the transcode job status updates to "completed" on success
**And** on failure, the job status updates to "failed" with error details stored and the job is retryable (NFR15)

### Story 3.3: Full Video Transcode (Tier 3)

As an admin,
I want the system to perform a full transcode to MP4 for files with incompatible video codecs,
So that every file in the library is playable in web browsers.

**Acceptance Criteria:**

**Given** a file is classified as Tier 3 with a transcode job queued
**When** the transcode worker processes the job
**Then** FFmpeg transcodes the video to H.264 MP4 with faststart flag enabled
**And** audio is transcoded to AAC in the same output file
**And** the transcoded file is saved to the managed cache directory
**And** the transcoded file path is stored in the database linked to the media file
**And** the source file is never modified (NFR9)
**And** the transcode job status updates to "completed" on success
**And** on failure, the job status updates to "failed" with error details stored and the job is retryable (NFR15)

### Story 3.4: Subtitle Extraction and WebVTT Conversion

As an admin,
I want the system to convert all cataloged subtitles to WebVTT format,
So that subtitles are ready for browser-native playback via the `<track>` element.

**Acceptance Criteria:**

**Given** a file has subtitle tracks cataloged in the subtitles table (embedded or sidecar .srt/.ass/.sub)
**When** the subtitle conversion service processes the file
**Then** each subtitle track is extracted (if embedded) or read (if sidecar) and converted to WebVTT format via FFmpeg
**And** WebVTT files are saved to the managed cache directory with language and track index in the filename
**And** the WebVTT file paths are stored in the subtitles table
**And** conversion failures are logged per-track without blocking other tracks or files (NFR13)

### Story 3.5: Unattended Queue Processing and Pipeline Status

As an admin,
I want the transcode queue to process automatically in the background and expose its status via API,
So that I can drop files into a folder and walk away, checking progress whenever I want.

**Acceptance Criteria:**

**Given** files have been classified and transcode jobs are queued
**When** the background worker runs
**Then** jobs are processed sequentially (one at a time to avoid CPU saturation on modest hardware)
**And** Tier 1 files are marked "ready" immediately (no processing needed)
**And** Tier 2 and Tier 3 jobs are processed in FIFO order
**And** subtitle conversion jobs run after the file's primary transcode job completes
**And** pipeline status is available via `GET /api/pipeline/status` returning counts per status (queued, processing, completed, failed)
**And** individual job details are available via `GET /api/pipeline/jobs`
**And** the pipeline does not block or degrade playback of already-processed titles (NFR17)
**And** the pipeline recovers from crashes — incomplete jobs are reset to "queued" on restart

---

## Epic 4: Media Browsing & Library UI

Viewers can browse movies and TV shows as a poster grid with three sections (Continue Watching, Recently Added, A-Z), view detail pages with metadata, search the library, and see watch progress indicators — all with instant-feeling navigation.

### Story 4.1: Library API Endpoints for Movies and TV Shows

As a viewer,
I want the backend to serve my library data as fast API responses,
So that the frontend can render the poster grid and detail pages instantly.

**Acceptance Criteria:**

**Given** the library has matched media files with TMDB metadata
**When** the frontend requests library data
**Then** `GET /api/library/movies` returns all movies with: id, title, year, poster_url, runtime, rating, added_at, transcode_tier, playback_ready status
**And** `GET /api/library/shows` returns all TV shows with: id, title, year, poster_url, rating, season_count, added_at
**And** `GET /api/library/movies/:id` returns full movie detail: title, description, year, poster_url, runtime, rating, content_rating, available audio tracks, available subtitle tracks, playback file path info
**And** `GET /api/library/shows/:id` returns show detail with season list, each season with episode list (episode title, number, duration, playback info)
**And** `GET /api/library/recent` returns the most recently added titles (configurable limit, default 20)
**And** `GET /api/library/search?q=...` returns titles matching the search query by title substring
**And** all metadata endpoints respond within 200ms (NFR5)
**And** only titles with status "ready" (pipeline complete) appear in viewer-facing endpoints

### Story 4.2: Poster Grid Home Page with Three Sections

As a viewer,
I want to see a poster grid with Continue Watching, Recently Added, and A-Z Library sections,
So that I can browse my entire library visually from one page.

**Acceptance Criteria:**

**Given** the viewer navigates to the home page
**When** the page renders
**Then** three sections appear in fixed order: Continue Watching (conditional), Recently Added, Full Library A-Z
**And** the "Continue Watching" section only appears if localStorage has watch progress data (UX-DR5)
**And** the "Recently Added" section shows the newest imports
**And** the "Library" section shows all titles sorted alphabetically
**And** each title is displayed as a poster image in a CSS Grid with auto-fill and minmax(180px, 1fr) (UX-DR3)
**And** all poster slots are pre-sized with 2:3 aspect ratio to prevent layout shift (UX-DR8)
**And** images use native `loading="lazy"` for below-the-fold posters (UX-DR8)
**And** section headers use `--font-size-lg`, left-aligned (UX-DR3)
**And** BEM-lite class naming is used (.poster-grid, .poster-grid__item, etc.) (UX-DR9)
**And** no animations, hover effects, or skeleton screens are used (UX-DR10)
**And** the page is responsive — poster count adapts naturally via CSS Grid (UX-DR6)
**And** the page renders within 1 second perceived (NFR4)

### Story 4.3: Movie Detail Page

As a viewer,
I want to click a movie poster and see its full details with a Play button,
So that I can read about a movie before deciding to watch it.

**Acceptance Criteria:**

**Given** the viewer clicks a movie poster on the grid
**When** the browser navigates to `/movie/:id`
**Then** the detail page shows: poster (left), title in `--font-size-xl`, year, runtime, rating in muted text, description in base font size (UX-DR4)
**And** a large deep orange Play button is prominently displayed
**And** a "← Back to Library" link returns to the grid
**And** the back button returns to the grid at the same scroll position (UX-DR12)
**And** poster clicks are `<a>` tags with proper hrefs — bookmarkable, URL-driven (UX-DR12)
**And** SPA navigation completes in < 100ms (NFR6)
**And** WCAG AA contrast ratios are maintained for all text (UX-DR11)
**And** touch targets meet minimum 44x44px (UX-DR11)

### Story 4.4: TV Show Detail Page with Season and Episode Listings

As a viewer,
I want to click a TV show poster and browse all episodes grouped by season,
So that I can find and play specific episodes.

**Acceptance Criteria:**

**Given** the viewer clicks a TV show poster on the grid
**When** the browser navigates to `/show/:id`
**Then** the detail page shows: show poster, title, year, rating, and description
**And** all episodes are listed on the page, grouped by season
**And** seasons are ordered latest first (most recent season at the top)
**And** each episode displays: episode number, title, and duration
**And** each episode has a Play link/button
**And** standard page navigation patterns are used — back button works, URLs are bookmarkable (UX-DR12)
**And** the page uses semantic HTML and consistent styling with the movie detail page

### Story 4.5: Watch Progress Indicators on Poster Grid

As a viewer,
I want to see progress bars on partially watched titles and visual distinction on completed titles,
So that I know what I've been watching and what's finished.

**Acceptance Criteria:**

**Given** the viewer has watch progress stored in localStorage
**When** the poster grid renders
**Then** partially watched titles show a thin deep orange progress bar at the poster bottom edge (UX-DR5)
**And** completed (watched) titles are visually dimmed
**And** for TV shows, the Continue Watching entry links to the last episode the viewer watched in the series, even if previous episodes were skipped
**And** progress data is read from localStorage on page load — no server calls needed
**And** titles with progress appear in the "Continue Watching" section at the top

### Story 4.6: Library Search

As a viewer,
I want to search the library by title,
So that I can quickly find a specific movie or show.

**Acceptance Criteria:**

**Given** the viewer is on the home page
**When** the viewer types in the search input
**Then** the A-Z library grid is filtered to show only titles matching the search query
**And** search is case-insensitive and matches partial title strings
**And** search results update as the user types (client-side filtering or debounced API call)
**And** clearing the search restores the full A-Z grid
**And** the search input is accessible (labeled, keyboard navigable)

---

## Epic 5: Video Playback & Dual-Element Sync

Viewers can play any title with sub-1000ms start, seek instantly, use dual-element audio sync for sidecar files, select subtitles and audio tracks, and control playback (pause/resume, volume, fullscreen).

### Story 5.1: Media File Serving via HTTP Range Requests

As a viewer,
I want the server to deliver video and audio files via HTTP range requests,
So that playback starts instantly and seeking is instant without any server-side processing.

**Acceptance Criteria:**

**Given** a media file is playback-ready (Tier 1 original, Tier 2 original + sidecar, or Tier 3 transcoded)
**When** the frontend requests the file via `GET /api/media/stream/:fileId`
**Then** the server responds with proper HTTP range request support (Accept-Ranges, Content-Range, 206 Partial Content)
**And** for Tier 1 files, the original file is served directly
**And** for Tier 2 files, the original video file is served at one endpoint and the AAC sidecar at another (`GET /api/media/stream/:fileId/audio`)
**And** for Tier 3 files, the transcoded MP4 is served
**And** subtitle WebVTT files are served via `GET /api/media/subtitles/:subtitleId`
**And** no server-side processing occurs at play time — static file serving only (NFR3)
**And** server CPU stays < 5% per concurrent viewer (NFR3)

### Story 5.2: Video Player with Standard Playback Controls

As a viewer,
I want a video player with standard controls (play, pause, seek, volume, fullscreen),
So that I can watch content with the controls I'm already familiar with.

**Acceptance Criteria:**

**Given** the viewer navigates to the player page (via Play button on a detail page)
**When** the player loads
**Then** for Tier 1 and Tier 3 files, a standard `<video>` element is used with the media source URL
**And** playback starts within 1000ms of the player page loading (NFR1)
**And** the viewer can pause and resume playback (FR28)
**And** the viewer can seek to any point with instant response via native range requests (FR23, NFR2)
**And** the viewer can adjust volume (FR28)
**And** the viewer can enter and exit fullscreen (FR29)
**And** the player page has a back link to return to the detail page

### Story 5.3: Dual-Element Audio Sync for Sidecar Playback

As a viewer,
I want videos with audio sidecars to play seamlessly with synced audio,
So that I never notice the system is doing anything special — it just plays.

**Acceptance Criteria:**

**Given** a Tier 2 file is loaded in the player (original video + AAC sidecar)
**When** playback starts
**Then** a `<video muted>` element plays the original video file and a separate `<audio>` element plays the AAC sidecar
**And** a `requestAnimationFrame` sync loop keeps audio and video within 50ms drift tolerance (NFR8)
**And** seeking the video also seeks the audio to the same position and re-syncs
**And** pausing the video pauses the audio; resuming resumes both in sync
**And** volume controls affect the `<audio>` element (since `<video>` is muted)
**And** fullscreen works correctly with the dual-element setup
**And** the sync mechanism is transparent to the viewer — no visible glitches or controls exposed

### Story 5.4: Subtitle Track Selection During Playback

As a viewer,
I want to select from available subtitle tracks while watching,
So that I can watch foreign films or use subtitles when needed.

**Acceptance Criteria:**

**Given** the current title has WebVTT subtitle files available
**When** the viewer opens the subtitle selector during playback
**Then** available subtitle tracks are listed with their language labels
**And** the viewer can select a track, which loads the WebVTT file via `<track>` element
**And** the viewer can turn subtitles off
**And** subtitle selection takes effect immediately without interrupting playback
**And** the subtitle selector is accessible (keyboard navigable, labeled)

### Story 5.5: Audio Track Selection During Playback

As a viewer,
I want to select from available audio tracks when multiple exist,
So that I can choose my preferred language for multi-language titles.

**Acceptance Criteria:**

**Given** the current title has multiple audio tracks available (e.g., separate sidecar files per language)
**When** the viewer opens the audio track selector during playback
**Then** available audio tracks are listed with their language labels
**And** the viewer can switch audio tracks
**And** for Tier 2 files, switching audio changes the `<audio>` element source and re-syncs
**And** playback position is preserved when switching audio tracks
**And** the selector is accessible (keyboard navigable, labeled)

---

## Epic 6: Watch Progress & Resume

The system persists watch progress in localStorage, viewers can resume from their last position, and completed titles are marked as watched — powering the Continue Watching row and progress indicators.

### Story 6.1: Persist Watch Progress in localStorage

As a viewer,
I want my watch position to be saved automatically as I watch,
So that I never lose my place even if I close the browser.

**Acceptance Criteria:**

**Given** the viewer is watching a video
**When** playback is active
**Then** the current playback position is saved to localStorage periodically (every 5-10 seconds)
**And** for movies, the key includes the movie ID and stores: position, duration, timestamp
**And** for TV shows, the key includes show ID + season + episode and stores: position, duration, timestamp
**And** for TV shows, a separate "last watched episode" entry tracks the most recently watched episode for the show (regardless of episode order)
**And** progress data survives browser restarts and tab closes
**And** no server calls are made — all persistence is client-side localStorage only

### Story 6.2: Resume Playback from Last Position

As a viewer,
I want to resume a movie or episode exactly where I left off,
So that I don't have to remember or manually seek to my spot.

**Acceptance Criteria:**

**Given** the viewer has watch progress stored for a title
**When** the viewer plays that title again (from Continue Watching or detail page)
**Then** playback starts from the saved position (not from the beginning)
**And** for dual-element sync (Tier 2), both video and audio resume from the saved position in sync
**And** if the saved position is within the last 5% of duration, playback starts from the beginning (title was essentially completed)
**And** the resume behavior is seamless — no prompt asking "resume or start over?"

### Story 6.3: Auto-Mark Titles as Watched

As a viewer,
I want titles to be automatically marked as watched when I finish them,
So that I can see what I've already seen at a glance.

**Acceptance Criteria:**

**Given** the viewer is watching a title
**When** playback position reaches near the end (e.g., 90-95% of duration)
**Then** the title is marked as "watched" in localStorage
**And** for movies, the watched flag is stored with the movie ID
**And** for TV shows, the individual episode is marked as watched
**And** for TV shows, if the viewer starts watching an episode that was already marked as watched, the "watched" status of all later episodes in the series is removed
**And** watched status is reflected in the poster grid on the next page load (dimmed poster per UX-DR5)
**And** the Continue Watching entry is removed for fully watched movies (or updated to next unwatched episode for TV shows)

---

## Epic 7: Admin Panel & LAN-Only Access

The admin can access a LAN-only admin panel to view library stats, trigger rescans, monitor import/transcode status, and review error details — while viewers never see admin elements.

### Story 7.1: LAN Detection and Admin Route Guard

As an admin,
I want the admin panel to only be accessible from my local network,
So that viewers outside my LAN never see admin functionality.

**Acceptance Criteria:**

**Given** a client accesses the application
**When** the client requests the admin page or admin API endpoints
**Then** the backend determines whether the client IP is on the server's local network subnet (FR33)
**And** an endpoint `GET /api/admin/access` returns whether the current client has admin access (true/false)
**And** admin API routes (`/api/admin/*`) return 403 Forbidden for non-LAN clients (NFR10)
**And** the Angular frontend uses the access check to conditionally show or hide the admin route
**And** the TMDB API key is never included in any frontend-facing response (NFR12)

### Story 7.2: Admin Dashboard with Library Statistics

As an admin,
I want to see library statistics at a glance on the admin panel,
So that I know the state of my library without digging through files.

**Acceptance Criteria:**

**Given** the admin navigates to `/admin`
**When** the dashboard loads
**Then** library statistics are displayed: total titles, movie count, TV show count
**And** transcode status breakdown is shown: count per tier (Tier 1/2/3), count per status (ready, queued, processing, failed)
**And** import pipeline summary: files discovered, probed, matched, unmatched, total errors
**And** statistics are fetched from `GET /api/admin/stats`
**And** the admin page uses functional, no-frills styling (UX-DR14)

### Story 7.3: Import and Transcode Monitoring with Error Details

As an admin,
I want to view detailed import and transcode status and drill into errors,
So that I can diagnose and resolve pipeline failures.

**Acceptance Criteria:**

**Given** the admin is on the admin panel
**When** the admin views the pipeline section
**Then** the current pipeline status is shown: jobs queued, in-progress, completed, failed
**And** failed jobs are listed with: filename, failure stage (probe/match/transcode/subtitle), error message, timestamp
**And** the admin can view full error details for any failed job via `GET /api/admin/jobs/:id`
**And** failed transcode jobs can be retried via `POST /api/admin/jobs/:id/retry`
**And** the "Needs Attention" queue (unmatched files from Epic 2) is accessible from the admin panel with the manual TMDB search and match UI

### Story 7.4: Manual Library Rescan Trigger

As an admin,
I want to trigger a full library rescan from the admin panel,
So that I can force the system to re-check media folders when needed.

**Acceptance Criteria:**

**Given** the admin is on the admin panel
**When** the admin clicks "Rescan Library"
**Then** a `POST /api/admin/rescan` triggers a full library scan (same as startup scan from Story 2.2)
**And** the scan runs in the background without blocking the admin UI or viewer playback (NFR17)
**And** the admin panel shows scan progress (files found, processed)
**And** newly discovered files enter the standard pipeline (probe → match → classify → transcode)
