---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
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
