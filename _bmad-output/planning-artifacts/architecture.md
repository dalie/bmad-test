## Infrastructure & Deployment Decision

### Chosen Path: Dockerized, Self-Hosted, Minimal CI/CD

- **Hosting:** Self-hosted, single Docker container
- **CI/CD:** Manual or simple script-based deployment (no complex pipeline)
- **Environment Configuration:** .env files for secrets/config
- **Backup/Restore:** Manual backup of media and SQLite DB
- **Monitoring/Logging:** Minimal, use built-in NestJS/Angular logging

**Rationale:**
- Simplicity and reliability for LAN-only, single-user deployment
- Docker ensures consistent environment and easy updates
- Manual backup and minimal logging reduce operational overhead
## Frontend Architecture Decision

### Chosen Path: Angular (Signals), No CDK

- **State Management:** Angular Signals for local/UI state, RxJS for async/streams, NgRx only if complexity demands
- **Component Architecture:** Feature modules, presentational/container split, standalone components for new code
- **Routing:** Angular Router with lazy loading, route guards as needed
- **Performance:** OnPush change detection, bundle splitting, no Angular CDK
- **Bundle Optimization:** Angular CLI production build, strict tree shaking, regular bundle audits

**Rationale:**
- Signals and RxJS provide a modern, maintainable state solution
- Feature modules and presentational/container split improve organization and testability
- Lazy loading and OnPush maximize performance without CDK
- Excluding Angular CDK reduces dependency footprint and complexity
## API & Communication Design Decision

### Chosen Path: REST API, No Documentation

- **API Style:** REST (standard HTTP endpoints)
- **API Documentation:** None (no Swagger/OpenAPI)
- **Error Handling:** Standard NestJS exception filters, consistent error responses
- **Rate Limiting:** Basic rate limiting middleware (e.g., express-rate-limit)
- **Inter-service Communication:** Not required (single-container, monolith)

**Rationale:**
- Simplicity and speed prioritized for trusted, LAN-only use
- No need for public API documentation or external integrations
- REST is well-supported and easy to consume for the Angular frontend
## Authentication & Security Decision

### Chosen Path: No Authentication (LAN-Only)

- **Authentication:** None (no user login, no OAuth, no API keys)
- **Authorization:** Not required
- **Security Middleware:** Use Helmet for HTTP headers, enable CORS as needed, basic rate limiting
- **Data Encryption:** Rely on LAN isolation; no encryption at rest, HTTPS optional for local use
- **API Security:** Restrict access to LAN only (firewall, Docker network config)

**Rationale:**
- System is designed for trusted, LAN-only environments with no external exposure
- Simplicity and ease of use prioritized over multi-user or remote access
- Security is enforced at the network level, not the application level
## Data Architecture Decision

### Chosen Path: Raw SQLite (No ORM)

- **Approach:** Direct SQL queries using the official sqlite3 or better-sqlite3 Node.js package, no ORM abstraction layer.
- **Migrations:** Manual SQL migration scripts, optionally managed with a lightweight runner (e.g., umzug).
- **Validation:** Implemented at the DTO/service layer (class-validator or Zod).
- **Caching:** In-memory or Redis as needed for performance.

**Rationale:**
- Fastest and most lightweight approach, minimal dependencies, and full control over schema and queries.
- Avoids ORM complexity and "magic," but requires careful documentation and discipline for maintainability.
- Best suited for a single-developer or small-team project where schema changes are infrequent and performance is critical.
---
stepsCompleted:
  - step-01-init
  - step-02-context
inputDocuments:
  - prd.md
  - product-brief-bmad.md
  - product-brief-bmad-distillate.md
workflowType: 'architecture'
project_name: 'Cineplex Rigaud'
user_name: 'Dude'
date: '2026-04-28'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
40 FRs across 7 capability areas: Library Management (FR1-8), Transcode Pipeline (FR9-14), Media Browsing (FR15-21), Video Playback (FR22-29), Watch Progress (FR30-32), Admin Panel (FR33-37), Deployment (FR38-40). The heaviest architectural weight falls on the transcode pipeline and video playback — these define the system's novel behavior.

**Non-Functional Requirements:**
21 NFRs that drive architecture: performance (sub-1000ms playback, <5% CPU per viewer, <200ms API, 50ms sync drift), security (read-only source, LAN-only admin, no credentials), reliability (fault-tolerant pipeline, graceful TMDB failure), integration (TMDB rate limiting, bundled FFmpeg).

**Scale & Complexity:**

- Primary domain: Full-stack web (SPA + backend API + background job processing)
- Complexity level: Medium
- Estimated architectural components: 6-8 major components

### Technical Constraints & Dependencies

- **FFmpeg** — file probing, audio extraction/transcode, full video transcode, subtitle conversion to WebVTT
- **TMDB API** — metadata fetching, poster images, content ratings, TV show hierarchy (Show → Season → Episode)
- **Browser codec support** — H.264/H.265 in MKV containers, AAC audio decode
- **Docker** — single-container deployment, volume mounts for media source folders
- **Filesystem watchers** — inotify/polling for new content detection
- **Source file integrity** — read-only access to media files, all generated artifacts in separate location

### Cross-Cutting Concerns Identified

- **File artifact management** — sidecar AAC files, WebVTT subtitles, thumbnails, transcoded MP4s must be organized in a managed cache directory separate from source files
- **Library state persistence** — metadata, transcode status, file-to-TMDB mappings, file probe results all require a database or structured store
- **Error isolation** — individual file failures (probe, match, transcode) must never block pipeline progress or playback of other titles
- **Import/serve separation** — the architecture must strictly separate the import pipeline (heavy processing) from the playback path (static file serving) to guarantee NFR3 (<5% CPU per viewer)

## Starter Template Decision

### Chosen Stack & Structure

- **Backend:** Node.js/NestJS/TypeScript (Nest CLI, monorepo mode)
- **Database:** SQLite (via better-sqlite3, raw SQL)
- **Frontend:** Latest Angular (with Signals)
- **Monorepo:** npm workspaces for unified dependency management

### Rationale

This structure leverages:
- Official NestJS CLI for monorepo scaffolding and best practices
- Angular CLI for the latest Angular app (Signals-ready)
- npm workspaces for seamless monorepo management
- SQLite for robust, embedded metadata storage

This approach ensures rapid development, maintainability, and alignment with your technical preferences and project requirements.

### Next Steps

1. Scaffold the monorepo using Nest CLI (`nest new my-monorepo --monorepo`)
2. Add Angular frontend as a workspace package (`ng new frontend --directory=apps/frontend --no-git`)
3. Configure npm workspaces in root `package.json`
4. Add SQLite support to backend (better-sqlite3, raw SQL with umzug migrations)
5. Dockerize the full stack for single-container deployment
