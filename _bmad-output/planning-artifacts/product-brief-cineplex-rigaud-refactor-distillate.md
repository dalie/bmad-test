---
title: "Product Brief Distillate: Cineplex Rigaud Refactoring"
type: llm-distillate
source: "product-brief-cineplex-rigaud-refactor.md"
created: "2026-05-06"
purpose: "Token-efficient context for downstream technical design and story creation"
---

- **Architectural Shift:** Move from duplicated frontend/backend DTOs to a unified data contract library powered by npm workspaces.
- **Strict Scope Boundaries:** Zero end-user functionality changes; zero database schema changes (SQLite remains untouched); tech stack remains NestJS/Angular.
- **Service Logic Simplification:** Explicit mandate to refactor backend service logic to be "understandable at a glance." Avoid deeply nested logic and untangle dense abstractions, specifically in `BrowseService` and `LibraryService`.
- **Data Transfer Flow:** Refine how data is fetched and supplied from API responses to the Angular UI's observable streams (specifically looking at the `shareReplay` caching strategy).
- **Testing & Verification (Open Question):** Given the "no regression" rule and zero functional changes, how will the refactor be validated? Need to lean on or expand existing E2E/integration testing, or establish a clear QA process.
- **Future-proofing/Opportunity (Open Question):** Unifying Types/DTOs naturally opens the door for OpenAPI (Swagger) generation. While not explicitly requested, ensuring the new npm workspace shared lib can be decorated or exported cleanly for schemas is heavily encouraged as a downstream benefit.
