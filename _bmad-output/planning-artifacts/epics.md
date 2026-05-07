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

# Cineplex Rigaud Refactoring - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for the Cineplex Rigaud structural refactoring, decomposing the requirements from the PRD and Architecture into implementable stories. This is a zero-functional-change refactor — no features added, no features removed, no database schemas altered, no end-user behavior changes.

## Requirements Inventory

### Functional Requirements

FR1: Developer can create a new npm workspace package that contains all shared TypeScript types, interfaces, and enums
FR2: Developer can import shared types from the library into both the backend (NestJS) and frontend (Angular) applications
FR3: Developer can build both applications successfully with the shared library as a workspace dependency
FR4: Developer can add, modify, or remove a shared type and have TypeScript compilation flag all affected consumers in both apps
FR5: Developer can identify all duplicated DTO/interface definitions in the backend and migrate them to the shared library
FR6: Developer can decompose multi-concern backend service methods into focused, single-responsibility units
FR7: Developer can review any backend service and understand its inputs, outputs, and side-effects without tracing nested logic
FR8: Developer can modify API response shapes where inconsistencies are discovered during review
FR9: Developer can verify that each refactored backend service preserves its existing behavior through manual spot-checking
FR10: Developer can replace all duplicated frontend interface/type definitions with imports from the shared library
FR11: Developer can simplify frontend service logic for clean, readable API-to-observable data flow
FR12: Developer can review any frontend service and understand its data sourcing, transformation, and caching strategy at a glance
FR13: Developer can verify that each refactored frontend service preserves its existing UI behavior through manual spot-checking
FR14: Developer can configure both tsconfig.json files to resolve the shared workspace package without path alias conflicts
FR15: Developer can run the full monorepo build and have all three packages (shared, backend, frontend) compile without errors
FR16: Developer can add the shared library without modifying the existing Docker deployment configuration (unless required)
FR17: Developer can conduct an AI-assisted review of each service to validate simplification quality
FR18: Developer can sign off each service as "complete" after review and regression spot-check
FR19: Developer can confirm zero duplicated type definitions remain across the frontend and backend after all migrations

### NonFunctional Requirements

NFR1: Every refactored service must be reviewable and comprehensible without scrolling through more than one screen of method logic (single-responsibility methods)
NFR2: The shared library must contain zero runtime code — only type definitions, interfaces, and enums (no side-effects on import)
NFR3: No circular dependencies may exist between the shared library and either application package
NFR4: The full monorepo build (npm run build for all packages) must complete without errors after every individual service migration
NFR5: The shared library must compile independently without importing from either application
NFR6: TypeScript strict mode must remain enabled across all packages — no loosening of compiler options to accommodate the refactor
NFR7: End-user-facing behavior (browsing, playback, admin functions) must remain identical after refactoring — verified by manual spot-check
NFR8: Database schema and data must remain 100% untouched — no migrations, no alterations
NFR9: Docker deployment configuration must continue to work without modification (unless shared lib requires build step changes)

### Additional Requirements

- npm workspaces monorepo structure must be preserved (apps/backend, apps/frontend, new shared package)
- Both apps use TypeScript with strict mode — must remain strict throughout refactor
- snake_case convention for API JSON fields and database columns must be maintained
- Module-per-feature backend structure (NestJS) must be respected during decomposition
- Standalone components with OnPush change detection in frontend must be maintained
- No barrel/index.ts files — direct imports only (per Architecture enforcement rules)
- NestJS Logger class for all backend logging (not console.log)
- Co-located .spec.ts test files pattern preserved
- Signal-based input() for Angular component inputs must be maintained
- Observable variables suffixed with $ must be maintained
- kebab-case file naming consistent with NestJS and Angular CLI defaults
- System must remain functional throughout refactor — no "big bang" migration; each service migrated independently
- When an API response shape changes, the corresponding frontend service/component must be updated in the same pass

### UX Design Requirements

N/A — This is a pure structural refactoring with explicit zero-functional-change guarantee. The PRD states "No features are added, no features are removed, no database schemas are altered, and no end-user behavior changes." All UX behavior described in the UX Design Specification must be preserved identically. No UX design requirements apply to this scope.

### FR Coverage Map

| FR   | Epic         | Description                                            |
| ---- | ------------ | ------------------------------------------------------ |
| FR1  | Epic 1       | Create npm workspace shared package                    |
| FR2  | Epic 1       | Import shared types into both apps                     |
| FR3  | Epic 1       | Build both apps with shared lib dependency             |
| FR4  | Epic 1       | Type changes flag all consumers via compilation        |
| FR5  | Epic 2       | Identify and migrate backend DTOs to shared lib        |
| FR6  | Epic 2       | Decompose multi-concern backend methods                |
| FR7  | Epic 2       | Backend services understandable at a glance            |
| FR8  | Epic 2       | Clean up API response shape inconsistencies            |
| FR9  | Epic 2       | Verify each backend service preserves behavior         |
| FR10 | Epic 3       | Replace frontend duplicated interfaces with shared lib |
| FR11 | Epic 3       | Simplify frontend service observable flow              |
| FR12 | Epic 3       | Frontend services readable at a glance                 |
| FR13 | Epic 3       | Verify each frontend service preserves UI behavior     |
| FR14 | Epic 1       | Configure tsconfig resolution for shared package       |
| FR15 | Epic 1       | Full monorepo build compiles all three packages        |
| FR16 | Epic 1       | Shared lib doesn't break Docker deployment             |
| FR17 | Epic 2, 3, 4 | AI-assisted review of each service                     |
| FR18 | Epic 2, 3, 4 | Sign off each service after review                     |
| FR19 | Epic 4       | Confirm zero duplicated types remain                   |

## Epic List

### Epic 1: Shared Type Library Foundation

Developer can create, configure, and consume a shared TypeScript package across both apps — establishing the single source of truth for all data contracts.

After this epic, the shared library exists, compiles independently, and both apps can import from it with correct tsconfig resolution. The build pipeline works end-to-end.

**FRs covered:** FR1, FR2, FR3, FR4, FR14, FR15, FR16
**NFRs addressed:** NFR2, NFR3, NFR4, NFR5, NFR6

### Epic 2: Backend DTO Migration & Service Simplification

Developer can migrate all duplicated backend types to the shared library and decompose dense service methods into focused, single-responsibility units — making every backend service understandable at a glance.

After this epic, the backend has zero duplicated types, all services are simplified, and each one has been reviewed and signed off. API response shapes have been cleaned up where inconsistencies were found.

**FRs covered:** FR5, FR6, FR7, FR8, FR9, FR17, FR18
**NFRs addressed:** NFR1, NFR4, NFR7, NFR8, NFR9

### Epic 3: Frontend Interface Migration & Service Simplification

Developer can replace all duplicated frontend interfaces with shared library imports and simplify service logic — making every frontend service's data flow readable at a glance.

After this epic, the frontend has zero duplicated types, all services have clean API-to-observable flow, and each one has been reviewed and signed off.

**FRs covered:** FR10, FR11, FR12, FR13, FR17, FR18
**NFRs addressed:** NFR1, NFR4, NFR7

### Epic 4: Verification & Completion

Developer can confirm the refactor is fully complete — zero duplicated types remain, all services signed off, and the entire system behaves identically to before.

After this epic, the refactor is done: full-stack type uniqueness confirmed, final regression pass complete, build integrity verified.

**FRs covered:** FR19, FR17, FR18
**NFRs addressed:** NFR4, NFR7, NFR8, NFR9

## Epic 1: Shared Type Library Foundation

Developer can create, configure, and consume a shared TypeScript package across both apps — establishing the single source of truth for all data contracts.

### Story 1.1: Create Shared Library Package

As a developer,
I want to create a new npm workspace package for shared TypeScript types,
So that I have a single location for all data contracts consumed by both apps.

**Acceptance Criteria:**

**Given** the existing monorepo with `apps/backend` and `apps/frontend`
**When** the shared library package is created
**Then** a new package directory exists (e.g. `packages/shared` or `libs/shared`) with its own `package.json` and `tsconfig.json`
**And** the root `package.json` workspaces array includes the new package
**And** the shared library compiles independently via its own build/typecheck command
**And** the package contains zero runtime code — only type definitions, interfaces, and enums
**And** TypeScript strict mode is enabled in the shared library's tsconfig
**And** no circular dependencies exist (shared lib imports nothing from apps)

### Story 1.2: Configure App Consumption of Shared Library

As a developer,
I want both the backend and frontend apps to resolve imports from the shared library,
So that I can use shared types across the stack without path alias conflicts.

**Acceptance Criteria:**

**Given** the shared library package from Story 1.1
**When** the backend `tsconfig.json` is configured to resolve the shared package
**Then** the backend can import types from the shared library without compilation errors
**And** when the frontend `tsconfig.json` is configured to resolve the shared package
**Then** the frontend can import types from the shared library without compilation errors
**And** the full monorepo build (`npm run build` for all packages) completes without errors
**And** no `tsconfig` path alias conflicts are introduced
**And** TypeScript strict mode remains enabled in both apps

### Story 1.3: Verify Type Propagation and Docker Compatibility

As a developer,
I want to confirm that modifying a shared type flags all affected consumers,
So that I have compiler-enforced safety across the stack and deployment still works.

**Acceptance Criteria:**

**Given** a type is imported in both the backend and frontend from the shared library
**When** the type definition is modified (e.g., a field is added or renamed)
**Then** TypeScript compilation flags all files in both apps that reference the changed type
**And** the Docker build process still succeeds with the shared library in place
**And** the Docker deployment configuration requires no modification (or minimal, documented changes)
**And** the full monorepo build passes cleanly after resolving flagged consumers

## Epic 2: Backend DTO Migration & Service Simplification

Developer can migrate all duplicated backend types to the shared library and decompose dense service methods into focused, single-responsibility units — making every backend service understandable at a glance.

### Story 2.1: Migrate Browse & Media Interfaces to Shared Library

As a developer,
I want to move all browse-related and media-serving interfaces (MovieListItem, ShowListItem, AudioTrack, SubtitleTrackInfo, MovieDetail, EpisodeItem, SeasonInfo, ShowDetail, RecentItem, MediaFileInfo, SubtitleInfo) to the shared library,
So that frontend and backend share a single source of truth for all viewer-facing API contracts.

**Acceptance Criteria:**

**Given** the browse.service.ts and media.service.ts contain inline interface definitions
**When** those interfaces are moved to the shared library
**Then** browse.service.ts and media.service.ts import them from the shared package
**And** the full monorepo build passes without errors
**And** no behavioral change occurs in browse or media endpoints (verified by manual spot-check)
**And** no duplicate interface definitions remain in these files

### Story 2.2: Migrate Pipeline, Scanner, and Admin Interfaces to Shared Library

As a developer,
I want to move all pipeline, scanner, and admin interfaces (PipelineStatus, PipelineJob, ScannedFile, ParsedFilename, ProbeResult, ScanRecord, MediaSource, AdminStats, PipelineMonitorStatus, FailedJobSummary, JobDetail, TmdbSearchResult, TmdbMovieDetails, TmdbTvDetails, TmdbSeasonDetails, MatchResult) to the shared library,
So that all internal data contracts are centralized and the backend has zero inline type definitions.

**Acceptance Criteria:**

**Given** pipeline.service.ts, scanner.service.ts, probe.service.ts, filename-parser.service.ts, library.service.ts, config.service.ts, admin-stats.service.ts, admin-jobs.service.ts, tmdb.service.ts, and matching.service.ts contain inline interfaces
**When** those interfaces and types are moved to the shared library
**Then** all affected services import them from the shared package
**And** the full monorepo build passes without errors
**And** no behavioral change occurs in any endpoint (verified by manual spot-check)
**And** zero exported interface/type definitions remain inline in backend service files

### Story 2.3: Simplify Library Module Services

As a developer,
I want to decompose dense methods in library.service.ts, matching.service.ts, pipeline.service.ts, and browse.service.ts into focused, single-responsibility units,
So that each service is understandable at a glance without tracing nested logic.

**Acceptance Criteria:**

**Given** the library module services may contain multi-concern methods
**When** the services are reviewed and refactored
**Then** no method exceeds one screen of logic (roughly 30-40 lines of method body)
**And** each method has a single, clear responsibility with descriptive naming
**And** complex orchestration is broken into named helper methods or extracted services where appropriate
**And** API response shapes are cleaned up if inconsistencies are discovered (frontend updated in same pass)
**And** the full monorepo build passes without errors
**And** existing behavior is preserved (verified by manual spot-check)
**And** each service is reviewed (AI-assisted) and signed off

### Story 2.4: Simplify Remaining Backend Services

As a developer,
I want to review and simplify database.service.ts, media.service.ts, config.service.ts, admin-stats.service.ts, admin-jobs.service.ts, and lan-detection.service.ts,
So that every backend service meets the single-responsibility standard and is signed off.

**Acceptance Criteria:**

**Given** the remaining backend services outside the library module
**When** each service is reviewed and refactored where needed
**Then** no method exceeds one screen of logic
**And** each method has a single, clear responsibility
**And** all services are reviewed (AI-assisted) and individually signed off
**And** the full monorepo build passes without errors after each service migration
**And** existing behavior is preserved (verified by manual spot-check)
**And** the database schema remains 100% untouched

## Epic 3: Frontend Interface Migration & Service Simplification

Developer can replace all duplicated frontend interfaces with shared library imports and simplify service logic — making every frontend service's data flow readable at a glance.

### Story 3.1: Replace Frontend Interfaces with Shared Library Imports

As a developer,
I want to replace all duplicated interface definitions in the frontend (library.service.ts, admin-stats.service.ts, admin-jobs.service.ts, admin-rescan.service.ts, home.component.ts, watch-progress.service.ts) with imports from the shared library,
So that the frontend consumes the same type contracts as the backend with zero duplication.

**Acceptance Criteria:**

**Given** the frontend contains 19 interface/type definitions that duplicate or mirror backend types
**When** each interface is replaced with an import from the shared library
**Then** zero duplicated interface/type definitions remain in frontend source files
**And** any frontend-only types (e.g., ContinueWatchingItem extending a shared type, WatchProgressEntry/WatchProgressRecord) are either added to the shared library or remain as documented frontend-specific extensions
**And** the full monorepo build passes without errors
**And** no behavioral change occurs in any frontend component (verified by manual spot-check)

### Story 3.2: Simplify Frontend Services

As a developer,
I want to review and simplify library.service.ts, watch-progress.service.ts, admin-access.service.ts, admin-stats.service.ts, admin-jobs.service.ts, and admin-rescan.service.ts for clean API-to-observable data flow,
So that each frontend service's data sourcing, transformation, and caching strategy is readable at a glance.

**Acceptance Criteria:**

**Given** frontend services that may have complex observable chains or unclear data flow
**When** each service is reviewed and refactored
**Then** observable data flow follows a clear pattern: HTTP call → optional transformation → expose as observable/signal
**And** no method exceeds one screen of logic
**And** service responsibilities are clear and minimal (no multi-concern methods)
**And** all services are reviewed (AI-assisted) and individually signed off
**And** the full monorepo build passes without errors
**And** existing UI behavior is preserved (verified by manual spot-check)

## Epic 4: Verification & Completion

Developer can confirm the refactor is fully complete — zero duplicated types remain, all services signed off, and the entire system behaves identically to before.

### Story 4.1: Full-Stack Type Audit and Final Regression Verification

As a developer,
I want to audit the entire codebase confirming zero duplicated type definitions remain and conduct a final regression spot-check of all core user flows,
So that I have complete confidence the refactor is done with no loose ends or regressions.

**Acceptance Criteria:**

**Given** all backend and frontend services have been migrated and simplified in Epics 2 and 3
**When** a full-stack type audit is performed
**Then** zero duplicated interface/type/enum definitions exist across `apps/backend` and `apps/frontend` — all are in the shared library
**And** a final full monorepo build passes without errors
**And** manual spot-check of core user flows confirms identical behavior: browsing (poster grid, detail pages), playback (video, audio sync, subtitles), watch progress (save/resume), and admin functions (stats, pipeline, rescan)
**And** the Docker deployment builds and runs successfully
**And** the database schema is confirmed untouched (no migrations, no alterations)
**And** all services across both apps have been reviewed and signed off
**And** the refactor is declared complete
