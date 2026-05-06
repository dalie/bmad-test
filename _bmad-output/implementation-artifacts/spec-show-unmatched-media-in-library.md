---
title: "Show unmatched media in library with question mark placeholder"
type: "feature"
created: "2026-05-06"
status: "done"
baseline_commit: "f72d851"
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Media files that fail TMDB matching (`status = 'match_failed'`) are invisible to users — hidden in the admin Needs Attention queue while the library pretends they don't exist.

**Approach:** Include `match_failed` items in the library browse queries using a readable title derived from the filename (capitalize words, strip non-alphanumeric chars and extension) and null poster. Render a large question mark in the existing poster fallback placeholder on both the grid and detail pages. Detail pages show a short "This media could not be matched" description.

## Boundaries & Constraints

**Always:** Use existing fallback `<div>` — add question mark inside it; keep sort order (unmatched sort by readable title); derive media type from `media_sources.type`; title = filename without extension, non-alphanumeric replaced with spaces, words capitalized.

**Ask First:** N/A — all decisions resolved.

**Never:** Do not alter the Needs Attention admin queue; do not auto-match; do not change schema.

## I/O & Edge-Case Matrix

| Scenario                  | Input / State                                                           | Expected Output / Behavior                                                                                        | Error Handling |
| ------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------- |
| Movie with match_failed   | media_file from 'movies' source, status='match_failed', no metadata row | Appears in library movies grid with "?" poster, readable title from filename                                      | N/A            |
| TV file with match_failed | media_file from 'tv' source, status='match_failed', no metadata row     | Appears in library shows grid with "?" poster, readable title from filename                                       | N/A            |
| Detail page for unmatched | User clicks unmatched item                                              | Detail page shows "?" poster, readable title, description = "This media could not be matched to any known title." | N/A            |
| Search includes unmatched | User searches term matching readable title                              | Unmatched item appears in search results with "?" poster                                                          | N/A            |

</frozen-after-approval>

## Code Map

- `apps/backend/src/library/browse.service.ts` -- movie/show/search/detail queries that currently exclude unmatched items
- `apps/frontend/src/app/home/home.component.html` -- poster grid template with existing fallback div
- `apps/frontend/src/app/home/home.component.css` -- fallback placeholder styling (needs question mark)
- `apps/frontend/src/app/movie-detail/movie-detail.component.html` -- movie detail poster fallback
- `apps/frontend/src/app/show-detail/show-detail.component.html` -- show detail poster fallback
- `apps/frontend/src/app/movie-detail/movie-detail.component.css` -- movie detail fallback styling
- `apps/frontend/src/app/show-detail/show-detail.component.css` -- show detail fallback styling

## Tasks & Acceptance

**Execution:**

- [x] `apps/backend/src/library/browse.service.ts` -- Add helper `readableTitle(filename)` that strips extension, replaces non-alphanumeric with spaces, capitalizes words
- [x] `apps/backend/src/library/browse.service.ts` -- Add UNION query to `getMovies()` selecting `match_failed` files from movie sources with readable title, NULL poster_path/year/rating/runtime
- [x] `apps/backend/src/library/browse.service.ts` -- Add UNION query to `getShows()` selecting `match_failed` files from TV sources with readable title, NULL poster/rating
- [x] `apps/backend/src/library/browse.service.ts` -- Update `search()` to include `match_failed` items when readable title matches search term
- [x] `apps/backend/src/library/browse.service.ts` -- Update movie/show detail methods to return unmatched items with description = "This media could not be matched to any known title."
- [x] `apps/frontend/src/app/home/home.component.html` -- Add a "?" character inside every `.poster-grid__image--fallback` div
- [x] `apps/frontend/src/app/home/home.component.css` -- Style the question mark (centered, large, muted color) within the fallback container
- [x] `apps/frontend/src/app/movie-detail/movie-detail.component.html` -- Add "?" inside `.detail-poster--fallback` div
- [x] `apps/frontend/src/app/movie-detail/movie-detail.component.css` -- Style question mark (centered, large) in detail fallback
- [x] `apps/frontend/src/app/show-detail/show-detail.component.html` -- Add "?" inside `.detail-poster--fallback` div
- [x] `apps/frontend/src/app/show-detail/show-detail.component.css` -- Style question mark (centered, large) in detail fallback

**Acceptance Criteria:**

- Given a movie file with `status = 'match_failed'`, when the library page loads, then the item appears in the movies grid with a large "?" instead of a poster and a readable title derived from its filename
- Given a TV file with `status = 'match_failed'`, when the library page loads, then the item appears in the shows grid with a large "?" and readable title
- Given the user clicks an unmatched item, when the detail page loads, then it shows "?" poster, readable title, and description "This media could not be matched to any known title."
- Given an unmatched file whose readable title contains the search term, when the user searches, then the item appears in results with a "?" poster

## Design Notes

Title derivation logic (`readableTitle`): strip file extension → replace dots/underscores/hyphens/brackets with spaces → collapse whitespace → capitalize each word. Example: `the.dark.knight.2008.bluray.mkv` → `The Dark Knight 2008 Bluray`.

For the question mark, use a plain `?` text character styled with CSS (font-size, centering, muted color) — no icon library dependency needed. Same style on both grid fallback and detail page fallback.

## Verification

**Commands:**

- `cd apps/backend && npx jest --testPathPattern=browse` -- expected: tests pass (if they exist)
- `cd apps/frontend && npx ng build` -- expected: build succeeds with no errors

**Manual checks:**

- Load the library page with at least one `match_failed` movie file in the database — verify it appears with "?" poster
- Search for the parsed title of an unmatched file — verify it appears in results
