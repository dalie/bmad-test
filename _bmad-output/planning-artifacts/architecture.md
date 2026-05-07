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
- step-03-starter
- step-04-decisions
- step-05-patterns
- step-06-structure
- step-07-validation
- step-08-complete
  inputDocuments:
- prd.md
- product-brief-bmad.md
- product-brief-bmad-distillate.md
  workflowType: 'architecture'
  status: 'complete'
  completedAt: '2026-05-06'
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

## Implementation Patterns & Consistency Rules

### Database Patterns

| Pattern      | Convention                                 | Example                                     |
| ------------ | ------------------------------------------ | ------------------------------------------- |
| Table names  | plural, snake_case                         | `media_files`, `tv_episodes`                |
| Column names | snake_case                                 | `media_file_id`, `created_at`               |
| Primary keys | `id INTEGER PRIMARY KEY AUTOINCREMENT`     | Every table                                 |
| Foreign keys | `{singular_table}_id`, `ON DELETE CASCADE` | `media_file_id REFERENCES media_files(id)`  |
| Indexes      | `idx_{table}_{column}`                     | `idx_media_files_status`                    |
| Timestamps   | ISO text, `datetime('now')` default        | `created_at TEXT DEFAULT (datetime('now'))` |
| Booleans     | `is_` prefix, INTEGER 0/1                  | `is_active INTEGER DEFAULT 0`               |
| Enums        | CHECK constraints                          | `CHECK (type IN ('movies', 'tv'))`          |
| Engine       | better-sqlite3, WAL mode, foreign keys ON  | —                                           |

### API Patterns

| Pattern             | Convention                                           | Example                                     |
| ------------------- | ---------------------------------------------------- | ------------------------------------------- |
| Endpoints           | Plural nouns, flat routes                            | `GET /library/movies`, `POST /library/scan` |
| JSON fields         | snake_case (matches DB)                              | `{ poster_url, media_file_id }`             |
| Pagination          | `{ items: T[], total, offset, limit }`               | —                                           |
| Async operations    | HTTP 202 + `{ id, status }`                          | `{ scanId, status: "in_progress" }`         |
| Errors              | Standard NestJS HTTP exceptions                      | `NotFoundException`, `BadRequestException`  |
| No response wrapper | Return data directly (no `{ data, error }` envelope) | —                                           |

### File & Code Naming

| Pattern            | Convention                  | Example                       |
| ------------------ | --------------------------- | ----------------------------- |
| Backend files      | kebab-case + NestJS suffix  | `filename-parser.service.ts`  |
| Frontend files     | kebab-case + Angular suffix | `watch-progress.service.ts`   |
| Tests              | Co-located `.spec.ts`       | `browse.controller.spec.ts`   |
| Classes/Interfaces | PascalCase                  | `ScanRecord`, `MovieListItem` |
| Variables/methods  | camelCase                   | `scanId`, `getFiles()`        |
| Constants          | SCREAMING_SNAKE             | `WATCH_PROGRESS_KEY`          |
| Observables        | `$` suffix                  | `movies$`, `searchResults$`   |

### Project Structure

| Pattern            | Convention                                 |
| ------------------ | ------------------------------------------ |
| Backend            | Module-per-feature, flat within module     |
| Frontend           | Standalone components, lazy-loaded routes  |
| Shared services    | `src/app/services/`                        |
| Feature components | `src/app/{feature-name}/`                  |
| Change detection   | OnPush everywhere                          |
| Imports            | Direct imports, no barrel `index.ts` files |

### Frontend State & Communication

| Pattern               | Convention                                        |
| --------------------- | ------------------------------------------------- |
| HTTP data             | Services return RxJS Observables                  |
| Component consumption | `toSignal()` to convert observables for templates |
| Component inputs      | Signal-based `input()` function                   |
| Reactive UI state     | Angular `signal()` and `computed()`               |

### Error Handling

| Pattern             | Convention                                                          |
| ------------------- | ------------------------------------------------------------------- |
| Backend services    | Throw descriptive errors or domain error classes                    |
| Backend controllers | Catch and map to NestJS HTTP exceptions                             |
| Domain errors       | Custom classes (e.g., `TmdbUnavailableError`) → specific HTTP codes |
| Guards              | Throw HTTP exceptions directly                                      |
| Frontend            | `catchError` in RxJS pipes, `try/catch` for storage                 |

### Logging & Documentation

| Pattern         | Convention                                |
| --------------- | ----------------------------------------- |
| Backend logging | NestJS `Logger` class (not `console.log`) |
| Comments        | No comments unless logic is complex       |
| JSDoc           | Not required                              |

### Enforcement Guidelines

**All AI agents MUST:**

- Use snake_case for all database columns AND API JSON fields (no camelCase mapping)
- Use NestJS `Logger` for all backend logging
- Make all Angular components standalone with OnPush change detection
- Use signal-based `input()` for component inputs
- Suffix observable variables with `$`
- Co-locate test files as `.spec.ts` next to source
- Import directly — never create barrel/index files

## Project Structure & Boundaries

### Complete Project Directory Structure

```
cineplex-rigaud/
├── package.json                    # Root workspace config (npm workspaces)
├── package-lock.json
├── tsconfig.json                   # Root TypeScript config
├── docker-compose.yml              # Single-container deployment
├── Dockerfile                      # Production build
├── .env.example                    # Environment template
├── data/                           # Runtime data (Docker volume)
│   ├── cineplex.db                 # SQLite database (WAL mode)
│   ├── sidecars/                   # AAC audio sidecar files ({fileId}.m4a)
│   ├── subtitles/                  # Extracted WebVTT files ({subtitleId}.vtt)
│   └── transcodes/                 # Full video transcodes ({fileId}.mp4)
├── apps/
│   ├── backend/
│   │   ├── package.json
│   │   ├── nest-cli.json
│   │   ├── tsconfig.json
│   │   ├── tsconfig.build.json
│   │   └── src/
│   │       ├── main.ts
│   │       ├── app.module.ts
│   │       ├── database/
│   │       │   ├── database.module.ts
│   │       │   ├── database.service.ts        # Schema + migrations
│   │       │   └── database.service.spec.ts
│   │       ├── config/
│   │       │   ├── config.module.ts
│   │       │   ├── config.service.ts
│   │       │   ├── config.controller.ts
│   │       │   └── config.controller.spec.ts
│   │       ├── library/
│   │       │   ├── library.module.ts
│   │       │   ├── library.controller.ts      # POST /library/scan, sources
│   │       │   ├── library.service.ts         # Orchestration
│   │       │   ├── browse.controller.ts       # GET /library/movies, shows, search
│   │       │   ├── browse.service.ts          # Query & browse logic
│   │       │   ├── scanner.service.ts         # Folder scanning
│   │       │   ├── probe.service.ts           # FFmpeg probing
│   │       │   ├── filename-parser.service.ts # Title/year extraction
│   │       │   ├── tmdb.service.ts            # TMDB API client
│   │       │   ├── tmdb.controller.ts         # Manual match endpoints
│   │       │   ├── matching.service.ts        # Match orchestration
│   │       │   ├── classification.service.ts  # Transcode tier logic
│   │       │   ├── transcode.service.ts       # FFmpeg transcode jobs
│   │       │   ├── subtitle.service.ts        # Subtitle extraction
│   │       │   ├── pipeline.controller.ts     # Pipeline status endpoints
│   │       │   ├── pipeline.service.ts        # Queue processing
│   │       │   ├── watcher.service.ts         # Filesystem watcher
│   │       │   └── *.spec.ts                  # Co-located tests
│   │       ├── media/
│   │       │   ├── media.module.ts
│   │       │   ├── media.controller.ts        # GET /media/stream/:fileId
│   │       │   ├── media.service.ts           # Range requests, file serving
│   │       │   └── *.spec.ts
│   │       ├── admin/
│   │       │   ├── admin.module.ts
│   │       │   ├── admin.controller.ts        # GET /admin/stats, pipeline
│   │       │   ├── admin-stats.service.ts     # Library statistics
│   │       │   ├── admin-jobs.service.ts      # Job monitoring
│   │       │   ├── lan-detection.service.ts   # IP-based LAN check
│   │       │   ├── lan.guard.ts               # Route guard
│   │       │   └── *.spec.ts
│   │       └── health/
│   │           ├── health.controller.ts       # GET /health
│   │           └── health.controller.spec.ts
│   └── frontend/
│       ├── package.json
│       ├── angular.json
│       ├── tsconfig.json
│       ├── tsconfig.app.json
│       ├── tsconfig.spec.json
│       └── src/
│           ├── main.ts
│           ├── index.html
│           ├── styles.css
│           ├── styles/
│           │   ├── variables.css
│           │   ├── reset.css
│           │   ├── typography.css
│           │   ├── layout.css
│           │   └── global.css
│           └── app/
│               ├── app.ts                     # Root component
│               ├── app.html
│               ├── app.css
│               ├── app.config.ts              # Providers
│               ├── app.routes.ts              # Lazy-loaded routes
│               ├── services/
│               │   ├── library.service.ts     # API client for library
│               │   ├── watch-progress.service.ts  # localStorage persistence
│               │   └── admin-access.service.ts    # LAN detection
│               ├── home/
│               │   ├── home.component.ts
│               │   ├── home.component.html
│               │   └── home.component.css
│               ├── movie-detail/
│               │   ├── movie-detail.component.ts
│               │   ├── movie-detail.component.html
│               │   └── movie-detail.component.css
│               ├── show-detail/
│               │   ├── show-detail.component.ts
│               │   ├── show-detail.component.html
│               │   └── show-detail.component.css
│               ├── player/
│               │   ├── player.component.ts
│               │   ├── player.component.html
│               │   └── player.component.css
│               └── admin/
│                   ├── admin.component.ts
│                   ├── admin.guard.ts
│                   ├── needs-attention.component.ts
│                   ├── pipeline-monitor.component.ts
│                   ├── rescan.component.ts
│                   ├── admin-stats.service.ts
│                   ├── admin-jobs.service.ts
│                   └── admin-rescan.service.ts
└── _media/                         # Source media (read-only Docker volume)
    ├── movies/
    └── tv/
```

### Architectural Boundaries

**API Boundaries:**

| Boundary           | Controller            | Access                 |
| ------------------ | --------------------- | ---------------------- |
| Library browsing   | `browse.controller`   | Public (LAN)           |
| Library management | `library.controller`  | Public (LAN)           |
| Media streaming    | `media.controller`    | Public (LAN)           |
| TMDB matching      | `tmdb.controller`     | Admin only (LAN guard) |
| Admin operations   | `admin.controller`    | Admin only (LAN guard) |
| Pipeline control   | `pipeline.controller` | Admin only (LAN guard) |
| Configuration      | `config.controller`   | Public (LAN)           |

**Data Boundaries:**

| Layer           | Responsibility                           | Access Pattern               |
| --------------- | ---------------------------------------- | ---------------------------- |
| Controllers     | HTTP ↔ service mapping, validation       | Call services only           |
| Services        | Business logic, orchestration            | Call DatabaseService for SQL |
| DatabaseService | Raw SQL execution, connection management | Single point of DB access    |

**File System Boundaries:**

| Path               | Access                             | Purpose                             |
| ------------------ | ---------------------------------- | ----------------------------------- |
| `_media/`          | Read-only                          | Source media files (never modified) |
| `data/cineplex.db` | Read-write                         | Application state                   |
| `data/sidecars/`   | Write (pipeline), Read (streaming) | Generated AAC audio                 |
| `data/subtitles/`  | Write (pipeline), Read (streaming) | Generated WebVTT                    |
| `data/transcodes/` | Write (pipeline), Read (streaming) | Generated MP4                       |

### Requirements to Structure Mapping

| Epic                    | Backend Location                                             | Frontend Location                                            |
| ----------------------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| E1: Foundation          | Root configs, `database/`                                    | Root configs                                                 |
| E2: Scanning & Matching | `library/` (scanner, probe, parser, tmdb, matching, watcher) | `admin/needs-attention`                                      |
| E3: Transcode Pipeline  | `library/` (classification, transcode, subtitle, pipeline)   | `admin/pipeline-monitor`                                     |
| E4: Media Browsing      | `library/` (browse controller/service)                       | `home/`, `movie-detail/`, `show-detail/`, `services/library` |
| E5: Video Playback      | `media/` (stream, subtitles, audio)                          | `player/`                                                    |
| E6: Watch Progress      | — (client-side only)                                         | `services/watch-progress`                                    |
| E7: Admin Panel         | `admin/` (stats, jobs, LAN guard)                            | `admin/` (all sub-components)                                |

### Integration Points

**Internal:**

- `library.service` orchestrates scanner → probe → parser → matching → classification → pipeline
- `pipeline.service` drives transcode → subtitle extraction sequentially per file
- `browse.service` queries DB with joins across `media_files`, `tv_episodes`, `transcode_jobs`

**External:**

- TMDB API (rate-limited, fault-tolerant via `TmdbUnavailableError`)
- FFmpeg CLI (spawned as child process for probe/transcode/subtitle operations)
- Filesystem watchers (inotify for new content detection)

**Data Flow:**

```
Source Files → Scanner → Probe → Parser → TMDB Match → Classification → Pipeline Queue
                                                                              ↓
                                                              Transcode / Subtitle / Sidecar
                                                                              ↓
                                                              data/{transcodes,subtitles,sidecars}/
```

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**

- NestJS + Angular + SQLite (better-sqlite3) + npm workspaces — all well-tested together, no version conflicts
- Raw SQL approach aligns with single-developer simplicity goal
- Docker single-container supports the monorepo + SQLite combination naturally
- No authentication aligns with LAN-only deployment decision

**Pattern Consistency:**

- snake_case flows uniformly from DB → API JSON → frontend interfaces (no mapping layer needed)
- kebab-case file naming is consistent with both NestJS and Angular CLI defaults
- Module-per-feature backend maps cleanly to the epic structure
- Co-located tests with OnPush standalone components follows modern Angular conventions

**Structure Alignment:**

- Project structure directly reflects all architectural decisions
- `data/` separation from `_media/` enforces the read-only source constraint
- Single `DatabaseService` as SQL gateway matches the "no ORM" decision
- Flat module internals align with the intermediate complexity level

### Requirements Coverage ✅

| Epic                    | Architecture Support                                             | Status |
| ----------------------- | ---------------------------------------------------------------- | ------ |
| E1: Foundation          | Monorepo, Docker, DB migrations in DatabaseService               | ✅     |
| E2: Scanning & Matching | library module (scanner, probe, parser, tmdb, matching, watcher) | ✅     |
| E3: Transcode Pipeline  | library module (classification, transcode, subtitle, pipeline)   | ✅     |
| E4: Media Browsing      | browse controller/service + Angular feature components           | ✅     |
| E5: Video Playback      | media module (range requests) + player component                 | ✅     |
| E6: Watch Progress      | Frontend-only (localStorage service)                             | ✅     |
| E7: Admin Panel         | admin module + LAN guard + frontend admin components             | ✅     |

**NFR Coverage:**

- Performance (<200ms API): SQLite WAL + raw SQL = minimal overhead ✅
- Performance (<5% CPU/viewer): Static file serving separated from pipeline ✅
- Security (read-only source): File system boundary enforced ✅
- Security (LAN-only admin): LAN guard on admin/pipeline/tmdb controllers ✅
- Reliability (fault-tolerant pipeline): Error isolation per-file, domain error classes ✅
- Integration (TMDB rate limiting): Dedicated tmdb.service with error handling ✅

### Implementation Readiness ✅

**Decision Completeness:** All critical technology choices documented — no ambiguity about stack, patterns, or conventions.

**Structure Completeness:** Full directory tree defined with file-level granularity. All integration points specified.

**Pattern Completeness:** All potential AI agent conflict points addressed with concrete conventions and enforcement guidelines.

### Architecture Completeness Checklist

- [x] Project context analyzed with all FRs/NFRs
- [x] Technology stack fully specified with rationale
- [x] All 5 decision categories resolved (Data, Auth, API, Frontend, Infra)
- [x] Implementation patterns comprehensive (naming, structure, format, state, errors, logging)
- [x] Complete directory structure defined
- [x] Boundaries clearly established (API, data, filesystem)
- [x] Epic-to-structure mapping complete
- [x] Integration points and data flow documented
- [x] Enforcement guidelines for AI agents specified

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** High

**Key Strengths:**

- Zero ambiguity on conventions — agents cannot diverge
- Structure mirrors requirements 1:1
- snake_case uniformity eliminates mapping bugs
- Boundaries prevent accidental coupling

**Areas for Future Enhancement:**

- WebSocket/SSE for real-time pipeline status (currently poll-based)
- Shared DTO library if refactoring proceeds
