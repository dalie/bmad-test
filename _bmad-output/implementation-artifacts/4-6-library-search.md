# Story 4.6: Library Search

Status: done

## Story

As a viewer,
I want to search the library by title,
so that I can quickly find a specific movie or show.

## Acceptance Criteria

```gherkin
Given the viewer is on the home page
When the viewer types in the search input
Then the A-Z library grid is filtered to show only titles matching the search query
And search is case-insensitive and matches partial title strings
And search results update as the user types
And clearing the search restores the full A-Z grid
And search does not filter the Continue Watching or Recently Added sections
And for TV content, matching is performed against the show title only, not episode titles
And the search input is accessible (labeled, keyboard navigable)
```

## Tasks / Subtasks

- [x] 1. Add search state and filtered library derivation in `apps/frontend/src/app/home/home.component.ts` (AC: 1, 2, 3, 4)
  - [x] 1.1 Add a writable `searchQuery` signal initialized to `''`
  - [x] 1.2 Add a small `updateSearchQuery(value: string)` method that stores the raw input text
  - [x] 1.3 Add a computed `filteredLibraryItems` signal that:
    - trims the query only for the empty/non-empty check
    - lowercases query and title values for case-insensitive matching
    - uses partial substring matching via `includes(...)`
    - treats TV entries exactly like the current `LibraryItem` contract does: searchable text is the show title already present on the card, not episode names
    - returns `allItems()` unchanged when the trimmed query is empty
  - [x] 1.4 Add a computed `hasActiveSearch` signal for template branching and empty-state rendering
  - [x] 1.5 Keep `allItems` as the canonical full-library source; do not mutate or re-sort filtered results separately

- [x] 2. Add an accessible search control to the home page in `apps/frontend/src/app/home/home.component.html` (AC: 1, 3, 4, 5)
  - [x] 2.1 Place the search UI inside the A-Z Library section so Continue Watching and Recently Added remain unchanged above it
  - [x] 2.2 Add a visible `<label>` tied to a single `<input type="search">` with `id="library-search"`
  - [x] 2.3 Bind the input to `searchQuery` using an input event handler; do not introduce a new route or modal UI
  - [x] 2.4 Change the Library section loop from `allItems()` to `filteredLibraryItems()`
  - [x] 2.5 Preserve existing poster card routing and watch-progress rendering in filtered results by continuing to call `isWatched(item)` and `getProgressPercent(item)`
  - [x] 2.6 Render a simple empty state inside the Library section when a non-empty search has zero matches:
    - message text: `No titles match your search.`
    - placement: directly below the search control, above the grid area
    - styling: plain text using existing spacing and muted color tokens, no icons or animation

- [x] 3. Add minimal search styles in `apps/frontend/src/app/home/home.component.css` (AC: 5)
  - [x] 3.1 Add semantic classes for the search field wrapper, label, and input
  - [x] 3.2 Use existing design tokens (`--space-*`, `--color-*`, `--font-size-*`) and preserve the existing hand-written CSS approach
  - [x] 3.3 Preserve calm UI rules and accessibility requirements: no animations, no hover-driven behavior, no hidden labels, no `outline: none`, maintain existing WCAG AA-friendly contrast/focus treatment
  - [x] 3.4 Ensure the search control works cleanly on desktop, tablet, and mobile widths without changing the grid behavior

- [x] 4. Extend frontend tests for the new behavior (AC: 1, 2, 3, 4, 5)
  - [x] 4.1 Update `apps/frontend/src/app/home/home.component.spec.ts` to verify typing filters only the Library section items
  - [x] 4.2 Add a case-insensitive partial-match test, for example `ali` matching `Alien`
  - [x] 4.3 Add a clearing test that restores the full A-Z Library grid
  - [x] 4.4 Add an accessibility-oriented assertion that the search input has an associated visible label and `type="search"`
  - [x] 4.5 Add a regression test that Continue Watching and Recently Added still render while the Library section is filtered
  - [x] 4.6 Add a TV-specific regression test proving search is based on show title only and does not attempt to match individual episode names

- [x] 5. Keep this story scoped to the existing frontend browsing flow
  - [x] 5.1 Do not add or change backend code unless you uncover a defect in the existing `/api/library/search` implementation
  - [x] 5.2 Do not add a dedicated search route, search results page, debounce library, state library, or component library
  - [x] 5.3 Do not change movie/show detail navigation, watch-progress storage keys, or section ordering

## Dev Notes

- Primary implementation choice: use client-side filtering of the existing `allItems()` signal. This is the smallest change that satisfies the ACs and best matches the UX requirement for instant-feeling updates.
- The backend search API already exists and is tested. Reusing it is not necessary for this story because the home page already loads the full A-Z library data for rendering.
- Search only filters the A-Z Library section. Continue Watching and Recently Added remain visible and unchanged.
- TV search behavior is show-level only. The searchable string for TV items is the show title already surfaced in `LibraryItem`; episode titles are out of scope for this story.
- Search state is intentionally ephemeral. Leaving the home route and returning should reset the query to the component's default empty state; do not persist search text to the URL or localStorage in this story.
- Preserve current route semantics:
  - movies route with `/movie/:id`
  - shows route with `/show/:id`
  - Continue Watching items still link to `/play/:fileId`
- Preserve current watch-progress behavior on filtered items. The IDs returned in `allItems()` must continue to align with localStorage keys:
  - movie progress key uses `movie:{media_files.id}`
  - TV progress key uses `tv:{tmdb_id}:{file_id}` while `HomeComponent` lookup for grid items uses `tv:{tmdb_id}`

### Current State Intelligence

#### `apps/frontend/src/app/home/home.component.ts`

- Current state:
  - Builds three viewer-facing collections:
    - `recentItems` from `libraryService.getRecent()`
    - `allItems` from `forkJoin([getMovies(), getShows()])`, then sorted A-Z with `localeCompare(..., { sensitivity: 'base' })`
    - `continueWatchingItems` from localStorage
  - Uses Angular Signals and `toSignal(...)` in an `OnPush` standalone component.
  - Exposes `getProgressPercent(item)` and `isWatched(item)` that the template already uses for poster overlays/dimming.
- What this story changes:
  - Add local search state and a computed filtered library list.
  - Keep all filtering derived from existing signals; do not add a second library-fetch pipeline.
- What must be preserved:
  - Current A-Z ordering from `allItems`
  - Existing progress and watched-state rendering
  - Existing error handling around `getMovies()` and `getShows()`

#### `apps/frontend/src/app/home/home.component.html`

- Current state:
  - Renders three sections in order: Continue Watching, Recently Added, Library.
  - Uses the same poster-card markup pattern in Recently Added and Library.
- What this story changes:
  - Add a labeled search input in the Library section.
  - Swap the Library loop to use `filteredLibraryItems()`.
  - Add a zero-results message when a search is active and no titles match.
- What must be preserved:
  - Section order
  - Poster card links
  - Native lazy-loading on poster images
  - Watch-progress bars and watched dimming inside Library results

#### `apps/frontend/src/app/home/home.component.css`

- Current state:
  - Contains section spacing, poster-grid styling, progress bar styling, and watched-state dimming.
  - Follows the repo's semantic, hand-written CSS approach.
- What this story changes:
  - Add only the search-control styles needed for label/input/empty state.
- What must be preserved:
  - No animation or hover-driven UI
  - Existing poster-grid sizing and responsive behavior
  - Focus visibility

#### `apps/frontend/src/app/home/home.component.spec.ts`

- Current state:
  - Already covers section visibility, router links, A-Z sort order, and watch-progress behavior.
- What this story changes:
  - Add search-focused tests in the same spec file.
- What must be preserved:
  - Existing 4-5 regression coverage

#### `apps/backend/src/library/browse.controller.ts` and `apps/backend/src/library/browse.service.ts`

- Current state:
  - `GET /api/library/search?q=...` already exists.
  - `BrowseService.search(q)` performs case-insensitive substring matching with `LIKE ? COLLATE NOCASE`, orders by `m.title ASC`, collapses TV episodes to one show entry, and limits results to 100.
- What this story changes:
  - Nothing by default.
- What must be preserved:
  - Only `ready`/`completed` titles appear in viewer-facing results.
  - Movie IDs remain `media_files.id`; TV IDs remain `tmdb_id`.
  - TV search semantics remain show-level; do not widen matching to episode names in this story.

### Architecture Compliance

- Frontend stack: Angular 21 with Signals, `OnPush`, Angular Router, RxJS for async work.
- Backend stack: NestJS 11, REST controllers, SQLite via `better-sqlite3`.
- UI constraints from UX docs:
  - Viewer UI remains a calm poster grid with no menus, overlays, or animations.
  - The three sections stay in fixed order.
  - Search/filtering is one of the few justified JavaScript interactions on the page.
- Implementation guardrail:
  - Prefer a computed signal for search filtering. Do not create repeated `toSignal(...)` subscriptions from input changes.

### Library / Framework Requirements

- Use the existing Angular stack already in the repo:
  - `@angular/core` `^21.2.0`
  - `@angular/router` `^21.2.0`
  - `rxjs` `~7.8.0`
- No new runtime dependency is needed.
- Prefer direct input event handling over introducing extra form machinery for a single field.
- Keep using `toSignal(...)` only for stable Observable sources created once in component construction.

### File Structure Requirements

- Expected update files:
  - `apps/frontend/src/app/home/home.component.ts`
  - `apps/frontend/src/app/home/home.component.html`
  - `apps/frontend/src/app/home/home.component.css`
  - `apps/frontend/src/app/home/home.component.spec.ts`
- Expected no-change files unless a real defect is discovered:
  - `apps/backend/src/library/browse.controller.ts`
  - `apps/backend/src/library/browse.service.ts`
  - `apps/frontend/src/app/app.routes.ts`
  - `apps/frontend/src/app/services/library.service.ts`

### Testing Requirements

- Frontend tests are the primary validation surface for this story.
- Minimum test coverage additions:
  - search input renders with visible label and `type="search"`
  - filtering is case-insensitive and partial-match based
  - clearing the input restores the full A-Z Library section
  - Continue Watching and Recently Added are unaffected by an active search
  - progress bars / watched dimming still apply to items shown in filtered Library results
- If implementation scope stays frontend-only, backend tests should remain unchanged.

## Previous Story Intelligence

- Story 4.5 updated only the home-page frontend files plus sprint artifacts:
  - `apps/frontend/src/app/home/home.component.ts`
  - `apps/frontend/src/app/home/home.component.html`
  - `apps/frontend/src/app/home/home.component.css`
  - `apps/frontend/src/app/home/home.component.spec.ts`
- Reuse that edit pattern for 4.6 instead of creating new components or shared abstractions prematurely.
- Story 4.5 established these contracts that 4.6 must preserve:
  - `LibraryItem` is the shared shape rendered in the grid
  - watch-progress lookups depend on current movie/show ID semantics
  - Continue Watching behavior is entirely localStorage-driven and should not be entangled with search

## Git Intelligence Summary

- Recent commits:
  - `a610975` `implement 4-5`
  - `5c152b9` `delete subtitle files`
  - `cc4ee66` `create story 4-5`
- The most relevant implementation commit (`a610975`) touched only the home-page frontend files and sprint artifacts. That strongly suggests 4-6 should stay in the same slice unless a defect forces expansion.

## Latest Tech Information

- Angular 21 signals guidance remains aligned with this repo's current approach:
  - computed signals are appropriate for array filtering and are lazily evaluated
  - reading signals in an `OnPush` template triggers the right Angular updates without manual change detection
  - `toSignal(...)` should not be recreated repeatedly for the same changing input source
- Practical implication for this story:
  - store the search text in one writable signal
  - derive the filtered list with one computed signal
  - do not rebuild Observable subscriptions on every keystroke

## Project Context Reference

- No `project-context.md` files were found in this repository during workflow activation.

## Review Findings

- [x] [Review][Patch] Empty state displayed prematurely during initial data load [home.component.html:72] — fixed: added `allItems().length > 0` guard

## References

- Epics and story definition: `_bmad-output/planning-artifacts/epics.md` — `Epic 4`, `Story 4.6: Library Search`
- Product requirements: `_bmad-output/planning-artifacts/prd.md` — `FR21`, `NFR4`, `NFR5`
- UX guidance: `_bmad-output/planning-artifacts/ux-design-specification.md` — `Grid Layout Structure`, `Minimal JavaScript`, `Search/filter`
- Current frontend implementation: `apps/frontend/src/app/home/home.component.ts`
- Current home template: `apps/frontend/src/app/home/home.component.html`
- Current home styles: `apps/frontend/src/app/home/home.component.css`
- Current home tests: `apps/frontend/src/app/home/home.component.spec.ts`
- Existing backend search contract: `apps/backend/src/library/browse.controller.ts`, `apps/backend/src/library/browse.service.ts`

## Dev Agent Record

### Agent Model Used

GPT-5.4

### Debug Log References

- Activation/config resolution executed via `_bmad/scripts/resolve_customization.py`
- Focused red-phase validation: `npm run test --workspace=apps/frontend -- --watch=false --include='src/app/home/home.component.spec.ts'` (failed before implementation)
- Focused green-phase validation: `npm run test --workspace=apps/frontend -- --watch=false --include='src/app/home/home.component.spec.ts'` (passed after implementation)
- Frontend regression validation: `npm run test --workspace=apps/frontend -- --watch=false`
- Repository regression check: `npm run test --workspace=apps/backend` (unrelated pre-existing failures in `src/library/classification.service.spec.ts`)

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created
- Implementation is intentionally scoped to client-side filtering of the existing A-Z library data
- Existing backend search endpoint was analyzed and retained as-is for this story
- Added a local `searchQuery` signal, a computed `filteredLibraryItems` derivation, and a computed `hasActiveSearch` flag in the home component without changing the canonical `allItems()` source
- Added a labeled `type="search"` control and empty-state messaging inside the Library section while leaving Continue Watching and Recently Added unchanged
- Added search regression coverage for accessible labeling, partial/case-insensitive filtering, clearing behavior, unaffected upper sections, and TV show title-only matching
- Frontend validations passed; backend suite still reports unrelated classification failures outside this story's change slice

### File List

- `_bmad-output/implementation-artifacts/4-6-library-search.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `apps/frontend/src/app/home/home.component.ts`
- `apps/frontend/src/app/home/home.component.html`
- `apps/frontend/src/app/home/home.component.css`
- `apps/frontend/src/app/home/home.component.spec.ts`

## Change Log

- 2026-05-04: Implemented client-side library search on the home page, added focused frontend search coverage, and advanced the story to review
