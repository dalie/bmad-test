---
title: "Product Brief: Cineplex Rigaud Refactoring"
status: "complete"
created: "2026-05-06"
updated: "2026-05-06"
inputs: ["User input", "Explore subagent architectural discovery"]
---

# Product Brief: Cineplex Rigaud Refactoring

## Executive Summary

Cineplex Rigaud is a mature, personalized media server platform built on a NestJS backend and Angular frontend. While feature-rich, the codebase currently suffers from duplicated data contracts (DTOs) between the server and the UI, alongside complex service modules that are difficult to comprehend at a glance. This refactoring initiative focuses purely on technical debt reduction and architectural clarity. By centralizing types into a shared library and streamlining data transfer from the API to the UI, the project aims to dramatically improve developer experience, readability, and system maintainability without altering any existing end-user functionality or database schemas.

## The Problem

Currently, the application relies on direct SQL queries mapped to strongly-typed DTOs that are physically duplicated across the `apps/backend` and `apps/frontend` boundaries. As business logic has evolved, these backend services have become dense, making the data flow from SQL query to HTTP response to Frontend State (`shareReplay` observables) challenging to trace.
Developers face two primary burdens:

1. **Type Drift:** Duplicating DTOs creates a fragility risk where frontend and backend data shapes fall out of sync.
2. **Cognitive Load:** Service logic and API abstraction layers are dense; a new developer cannot discern a service's responsibility strictly "at a glance."

## The Solution

This initiative will introduce a **shared library for types and DTOs** (leveraging npm workspaces) to ensure a single source of truth across the stack. Additionally, we will execute a **service-by-service code simplification pass**, refactoring dense business logic down into easily digestible, highly cohesive units. We will ensure the data transfer patterns (API responses to Angular Observables) are simplified, idiomatic, and clean.

## What Makes This Different

This effort strictly separates technical modernization from product enhancement. Unlike typical refactors that succumb to scope creep, this update enforces a zero-functional-change policy. The SQLite database schema remains 100% untouched.

## Who This Serves

**Primary Users: Developers & Maintainers**
Success looks like a developer opening a service file and immediately understanding its inputs, outputs, and side-effects without tracing deeply nested logic or worrying about disjointed types.

## Success Criteria

- **Zero Regressions:** 100% preservation of existing feature behavior.
- **Architectural Cohesion:** Complete elimination of duplicated DTO files across `apps/frontend` and `apps/backend`.
- **Readability:** Significant reduction in cognitive complexity and line-count within service implementations.

## Scope

**In Scope:**

- Creation of a shared TS library for types/contracts using npm workspaces.
- Refactoring internal logic within backend and frontend services.
- Streamlining data transfer mechanisms between API and UI.

**Out of Scope:**

- Any modifications to the database structure or schema.
- Changes to end-user facing features or UI/UX.
- Altering the core tech stack (remaining with NestJS/Angular/SQLite).

## Vision (Roadmap Thinking)

By establishing a robust structural foundation today, we pave the way for faster feature development, easier onboarding of new team members, and a more resilient application core that could potentially support external API consumers or mobile clients in the future.
