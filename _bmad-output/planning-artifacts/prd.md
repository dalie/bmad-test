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
  - product-brief-cineplex-rigaud-refactor.md
  - product-brief-cineplex-rigaud-refactor-distillate.md
documentCounts:
  briefs: 2
  research: 0
  projectDocs: 0
  projectContext: 0
workflowType: "prd"
releaseMode: single-release
classification:
  projectType: web_app
  domain: general
  complexity: low
  projectContext: brownfield
---

# Product Requirements Document - Cineplex Rigaud Refactoring

**Author:** Dude
**Date:** 2026-05-06

## Executive Summary

Cineplex Rigaud is a mature, self-hosted media server built on NestJS (backend), Angular (frontend), and SQLite. The platform is feature-complete and actively used, but its internal architecture has accumulated structural debt: data transfer objects (DTOs) are physically duplicated across the frontend and backend boundaries, and service modules have grown dense enough that tracing data flow from SQL query to HTTP response to UI observable requires significant cognitive effort.

This initiative is a pure structural refactoring with a zero-functional-change guarantee. No features are added, no features are removed, no database schemas are altered, and no end-user behavior changes. The goal is to make the codebase dramatically easier to understand, extend, and maintain by a solo developer operating across the full stack.

Two structural interventions drive the refactor: (1) a shared TypeScript library via npm workspaces that becomes the single source of truth for all data contracts between backend and frontend, eliminating type drift entirely; and (2) a service-by-service simplification pass that decomposes dense business logic into highly cohesive, "understandable at a glance" units with clear inputs, outputs, and side-effects.

### What Makes This Special

This is not a feature initiative disguised as a refactor. The strict zero-change policy on user-facing behavior and database schemas forces architectural discipline — every decision must improve clarity without hiding behind "while we're in there" scope creep. The shared library approach also creates an organic path toward OpenAPI/Swagger generation, positioning the codebase for potential external API consumers without requiring additional work today.

The core insight: duplicated types and dense services aren't static debt — they compound. Every future feature built on top of the current structure pays a tax in debugging time, regression risk, and onboarding friction. This refactor pays down that compounding cost once, reducing the marginal cost of every subsequent change.

## Project Classification

- **Project Type:** Web application — browser-based SPA with backend API
- **Domain:** General (personal media server, no regulatory requirements)
- **Complexity:** Low — well-understood technologies, standard refactoring patterns
- **Project Context:** Brownfield — mature existing codebase undergoing structural improvement

## Success Criteria

### User Success

- **At-a-glance comprehension:** Any service file (frontend or backend) can be understood in terms of its inputs, outputs, and side-effects without tracing through nested logic or cross-referencing distant files.
- **Single source of truth:** When checking a DTO shape, there is exactly one place to look — the shared library. No mental overhead wondering if frontend and backend are in sync.
- **Confident modification:** Adding or changing an endpoint requires touching only the relevant service + the shared type — no "did I forget to update the other copy?" anxiety.

### Business Success

- Personal project — no revenue or adoption targets.
- Success = every service file across both apps has been reviewed, simplified, and signed off by the developer (with AI-assisted review).
- The codebase feels maintainable and inviting to work in again rather than something to dread opening.

### Technical Success

- **Zero regressions:** All existing feature behavior preserved, verified through manual spot-checking of core user flows (browsing, playback, admin functions).
- **DTO elimination:** Zero duplicated type/interface/DTO files remaining across `apps/frontend` and `apps/backend` — all moved to the shared library.
- **Service clarity:** Backend and frontend services refactored to be highly cohesive with clear, minimal responsibilities. Dense multi-concern methods decomposed.
- **Build integrity:** The monorepo builds cleanly with the new shared workspace package. No circular dependencies introduced.

### Measurable Outcomes

| Metric                         | Target                                      |
| ------------------------------ | ------------------------------------------- |
| Duplicated DTO/interface files | 0 (all in shared lib)                       |
| Services reviewed & signed off | 100% (frontend + backend)                   |
| Regressions introduced         | 0 (manual spot-check verification)          |
| Shared library package         | Builds independently, consumed by both apps |
| Database schema changes        | 0                                           |
| End-user behavior changes      | 0                                           |

## User Journeys

### Journey 1: Dude Traces a Bug Report (Debugging with Clarity)

**Dude, solo developer, receives a report** that a movie's metadata isn't rendering correctly on the detail page. He opens the codebase.

**Before refactor:** He traces from the Angular component → service → API call → backend controller → service → SQL query. Along the way, he checks the frontend DTO interface, then cross-references the backend DTO — they're defined separately. He spots a field name mismatch introduced weeks ago when he updated one side but forgot the other. Twenty minutes of detective work for a one-character fix.

**After refactor:** He opens the shared type definition — single source of truth. He checks the backend service (now a focused, single-responsibility unit) and immediately sees where the SQL mapping diverges from the contract. Found in under two minutes.

**Reveals:** Shared type library eliminates cross-boundary debugging. Simplified services make data flow traceable at a glance.

### Journey 2: Dude Adds a New Field (Confident Modification)

**Dude wants to add a "date added" field** to the library poster grid so recently added titles appear first.

**Before refactor:** He updates the backend DTO, modifies the SQL query mapping, then navigates to the frontend, finds the duplicated interface file, adds the field there too, updates the service, and the component. He's never fully confident both sides are in sync until he manually tests it.

**After refactor:** He adds the field to the shared type. TypeScript compilation immediately tells him every file in both apps that needs updating. He modifies the backend query, and the frontend already imports the correct shape. The compiler is his safety net — no forgotten copies.

**Reveals:** Single shared type = compiler-enforced consistency. Modification confidence without manual cross-checking.

### Journey 3: Dude Reviews a Service (Simplification Payoff)

**Dude opens `BrowseService`** to remind himself how library filtering works before extending it.

**Before refactor:** The service is a dense wall — data fetching, transformation, caching logic, and business rules interleaved in long methods. He has to read the whole file and mentally parse which blocks handle which concerns. He keeps a scratch pad of notes just to track state.

**After refactor:** The service has a clear public API with descriptively named methods. Each method does one thing. Helper functions are extracted with obvious names. He reads the method signatures and immediately understands the service's responsibilities without reading implementation details.

**Reveals:** Service decomposition enables comprehension without deep-reading. Method naming becomes self-documenting.

### Journey 4: Dude Returns After 6 Months (Future-Self Onboarding)

**Dude hasn't touched the codebase in months.** A family member asks for a feature. He opens the project.

The shared types directory serves as a living API contract — he can browse the data shapes and immediately remember what the system exchanges. Services read like a table of contents: `ScannerService`, `TranscodeService`, `MetadataService` — each with obvious boundaries. He's productive within minutes rather than spending an afternoon re-learning his own code.

**Reveals:** Structural clarity compounds over time. The refactor's biggest payoff is for future-you, not present-you.

### Journey Requirements Summary

| Journey              | Capabilities Revealed                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------- |
| Bug Trace            | Shared types eliminate cross-boundary debugging; service clarity enables fast root-cause identification |
| Add New Field        | Compiler-enforced type safety across the stack; single source of truth for data contracts               |
| Review Service       | Service decomposition; single-responsibility methods; self-documenting structure                        |
| Return After Absence | Structural clarity as documentation; browsable type directory; obvious service boundaries               |

## Web Application Specific Requirements

### Project-Type Overview

This is a structural refactoring of an existing single-page application (Angular frontend) with a RESTful backend API (NestJS). The refactor does not alter the application's runtime architecture — it reorganizes internal code structure and introduces a shared workspace package for type definitions. HTTP response shapes may be adjusted where inconsistencies or unnecessary complexity are discovered during service review.

### Technical Architecture Considerations

- **Monorepo structure:** npm workspaces managing `apps/backend`, `apps/frontend`, and a new shared library package
- **Shared library:** TypeScript-only package (types, interfaces, enums) — no runtime dependencies, no bundled code that executes
- **Build pipeline:** The shared library must be consumable by both the Angular CLI build (frontend) and the NestJS TypeScript compilation (backend). Build configuration changes may be required to resolve workspace package imports.
- **API contract flexibility:** HTTP response shapes may be modified where the refactor reveals unnecessary complexity, inconsistency, or redundancy. Both frontend and backend are updated together since both are owned by the same developer.
- **No browser impact:** No changes to compiled frontend output, bundle size, or browser compatibility.

### Implementation Considerations

- Services are refactored one at a time — the system must remain functional throughout the refactor (no "big bang" migration)
- Each service migration is independently reviewable and verifiable
- When an API response shape changes, the corresponding frontend service/component is updated in the same pass
- The shared library can be introduced first as a standalone package, then types migrated incrementally
- Angular and NestJS both resolve TypeScript path aliases — the shared package must work with both `tsconfig` setups
- No changes to routing, state management patterns, or component architecture

## Project Scoping

### Strategy & Philosophy

**Approach:** Single-release structural refactor executed in three sequential phases of work (not separate releases — the system remains functional throughout, but work proceeds in dependency order).

**Resource Requirements:** Solo developer with AI-assisted code review. Each service reviewed and signed off before moving to the next.

### Execution Order

1. **Shared library setup** — Create the npm workspace package, establish the type/interface structure, configure both apps to consume it
2. **Backend services** — Migrate DTOs to shared lib, simplify service logic, decompose dense methods. One service at a time, verified before moving on.
3. **Frontend services** — Replace duplicated interfaces with shared lib imports, simplify observable data flow patterns, clean up service logic.

### Complete Feature Set

**Must-Have Capabilities:**

- npm workspace shared library package created and configured
- All duplicated DTO/interface/type definitions migrated to shared lib
- Backend services decomposed into single-responsibility, readable units
- Frontend services simplified with clean API-to-observable data flow
- Both `tsconfig` setups correctly resolving the shared package
- Every service reviewed and signed off by the developer
- Manual regression spot-check after each service migration
- API response shapes cleaned up where inconsistencies are found (frontend updated in same pass)

**Nice-to-Have (if discovered during review):**

- Consistent naming conventions across all shared types
- Barrel exports for clean import paths
- Removal of dead code discovered during service review

### Risk Mitigation Strategy

**Technical Risks:**

| Risk                                                 | Severity | Mitigation                                                                                           |
| ---------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| Build configuration breaks when adding shared lib    | Medium   | Set up shared lib with a minimal type first; verify both apps compile before migrating anything else |
| Service simplification accidentally changes behavior | Medium   | Manual spot-check after each service; incremental approach (one service at a time)                   |
| Circular dependency between shared lib and apps      | Low      | Shared lib contains only types/interfaces — no runtime imports from apps                             |
| API response shape changes break frontend            | Low      | Frontend updated in the same pass as the corresponding backend change                                |

**Resource Risks:**

- Solo developer — if energy drops, the shared library + partial backend migration is still valuable on its own. Each completed service is independently beneficial.

### Out of Scope

- OpenAPI/Swagger generation
- Any database schema modifications
- New features or UI/UX changes
- Automated E2E test creation
- Tech stack changes (remains NestJS/Angular/SQLite)
- Performance optimization (unless incidental to simplification)

### Future Opportunity (Post-Refactor)

- OpenAPI generation leveraging the shared type library
- Automated test coverage for critical paths
- External API consumer support

## Functional Requirements

### Shared Type Library

- **FR1:** Developer can create a new npm workspace package that contains all shared TypeScript types, interfaces, and enums
- **FR2:** Developer can import shared types from the library into both the backend (NestJS) and frontend (Angular) applications
- **FR3:** Developer can build both applications successfully with the shared library as a workspace dependency
- **FR4:** Developer can add, modify, or remove a shared type and have TypeScript compilation flag all affected consumers in both apps

### Backend Service Refactoring

- **FR5:** Developer can identify all duplicated DTO/interface definitions in the backend and migrate them to the shared library
- **FR6:** Developer can decompose multi-concern backend service methods into focused, single-responsibility units
- **FR7:** Developer can review any backend service and understand its inputs, outputs, and side-effects without tracing nested logic
- **FR8:** Developer can modify API response shapes where inconsistencies are discovered during review
- **FR9:** Developer can verify that each refactored backend service preserves its existing behavior through manual spot-checking

### Frontend Service Refactoring

- **FR10:** Developer can replace all duplicated frontend interface/type definitions with imports from the shared library
- **FR11:** Developer can simplify frontend service logic for clean, readable API-to-observable data flow
- **FR12:** Developer can review any frontend service and understand its data sourcing, transformation, and caching strategy at a glance
- **FR13:** Developer can verify that each refactored frontend service preserves its existing UI behavior through manual spot-checking

### Build & Configuration

- **FR14:** Developer can configure both `tsconfig.json` files to resolve the shared workspace package without path alias conflicts
- **FR15:** Developer can run the full monorepo build and have all three packages (shared, backend, frontend) compile without errors
- **FR16:** Developer can add the shared library without modifying the existing Docker deployment configuration (unless required)

### Review & Verification

- **FR17:** Developer can conduct an AI-assisted review of each service to validate simplification quality
- **FR18:** Developer can sign off each service as "complete" after review and regression spot-check
- **FR19:** Developer can confirm zero duplicated type definitions remain across the frontend and backend after all migrations

## Non-Functional Requirements

### Code Quality

- **NFR1:** Every refactored service must be reviewable and comprehensible without scrolling through more than one screen of method logic (single-responsibility methods)
- **NFR2:** The shared library must contain zero runtime code — only type definitions, interfaces, and enums (no side-effects on import)
- **NFR3:** No circular dependencies may exist between the shared library and either application package

### Build Integrity

- **NFR4:** The full monorepo build (`npm run build` for all packages) must complete without errors after every individual service migration
- **NFR5:** The shared library must compile independently without importing from either application
- **NFR6:** TypeScript strict mode must remain enabled across all packages — no loosening of compiler options to accommodate the refactor

### Behavioral Preservation

- **NFR7:** End-user-facing behavior (browsing, playback, admin functions) must remain identical after refactoring — verified by manual spot-check
- **NFR8:** Database schema and data must remain 100% untouched — no migrations, no alterations
- **NFR9:** Docker deployment configuration must continue to work without modification (unless shared lib requires build step changes)
