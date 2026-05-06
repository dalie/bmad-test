---
title: "Display TV episode info on poster grid"
type: "feature"
created: "2026-05-05"
status: "done"
baseline_commit: "91b1bb6"
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** TV show cards in "Continue Watching" and "Recently Added" sections don't display which season/episode they refer to, making it hard to see at a glance what you were watching or what was recently imported.

**Approach:** Show a formatted episode label (e.g., "S02 E05") below the title on TV show poster cards in both sections. For Continue Watching the data already exists on the item; for Recently Added the backend must return the most recently added episode's season/episode numbers.

## Boundaries & Constraints

**Always:** Format as `S{nn} E{nn}` with zero-padded two-digit numbers. Only show for `mediaType === 'tv'`. The label must not push layout or cause overflow

**Ask First:** Changing the Recently Added section to list individual episodes instead of grouped shows.

**Never:** Modify the Library (all items) section. Do not change navigation targets or link behavior. Do not add new API endpoints.

## I/O & Edge-Case Matrix

| Scenario                          | Input / State                                     | Expected Output / Behavior     | Error Handling |
| --------------------------------- | ------------------------------------------------- | ------------------------------ | -------------- |
| TV item in Continue Watching      | `seasonNum: 2, episodeNum: 5`                     | Displays "S02 E05" below title | N/A            |
| Movie in Continue Watching        | No season/episode fields                          | No episode label shown         | N/A            |
| TV show in Recently Added         | API returns `latest_season: 1, latest_episode: 3` | Displays "S01 E03" below title | N/A            |
| Movie in Recently Added           | API returns `null` season/episode                 | No episode label shown         | N/A            |
| TV show with missing episode data | `latest_season: null`                             | No episode label shown         | N/A            |

</frozen-after-approval>

## Code Map

- `apps/backend/src/library/browse.service.ts` -- `getRecent()` query and `RecentItem` interface
- `apps/frontend/src/app/home/home.component.ts` -- `ContinueWatchingItem`, `LibraryItem` interfaces and `recentItems` signal mapping
- `apps/frontend/src/app/home/home.component.html` -- poster grid template for both sections
- `apps/frontend/src/app/home/home.component.css` -- poster card styles
- `apps/frontend/src/app/services/library.service.ts` -- `RecentItem` frontend interface and `getRecent()` HTTP call

## Tasks & Acceptance

**Execution:**

- [x] `apps/backend/src/library/browse.service.ts` -- Add correlated subqueries to `getRecent()` SQL to fetch `latest_season` and `latest_episode` from `tv_episodes` for TV show groups; add fields to `RecentItem` interface; map them in the return
- [x] `apps/frontend/src/app/services/library.service.ts` -- Add optional `latest_season` and `latest_episode` to frontend `RecentItem` interface
- [x] `apps/frontend/src/app/home/home.component.ts` -- Extend the `recentItems` mapping to pass `seasonNum`/`episodeNum` onto `LibraryItem` (add optional fields to `LibraryItem`)
- [x] `apps/frontend/src/app/home/home.component.html` -- Add episode label (`<p class="poster-grid__episode">`) below the title for TV items in both Continue Watching and Recently Added sections, conditionally rendered when season/episode data exists
- [x] `apps/frontend/src/app/home/home.component.css` -- Style `.poster-grid__episode` as muted small text below the title

**Acceptance Criteria:**

- Given a TV show in Continue Watching with `seasonNum: 2, episodeNum: 5`, when viewing the home page, then "S02E05" appears below the title
- Given a movie in Continue Watching, when viewing the home page, then no episode label is shown
- Given a TV show in Recently Added, when viewing the home page, then the most recently added episode's season/episode number appears below the title
- Given a movie in Recently Added, when viewing the home page, then no episode label is shown

## Verification

**Commands:**

- `npm run build -w apps/backend` -- expected: compiles without errors
- `npm run build -w apps/frontend` -- expected: compiles without errors

**Manual checks:**

- Start dev servers, open home page, verify TV shows display "SnnEnn" labels while movies do not

## Suggested Review Order

**Backend data supply**

- Correlated subqueries fetch latest episode's season/episode by most-recent file creation
  [`browse.service.ts:393`](../../apps/backend/src/library/browse.service.ts#L393)

- RecentItem interface extended with nullable episode fields
  [`browse.service.ts:88`](../../apps/backend/src/library/browse.service.ts#L88)

**Frontend plumbing**

- Frontend RecentItem gains matching nullable fields
  [`library.service.ts:35`](../../apps/frontend/src/app/services/library.service.ts#L35)

- LibraryItem extended with optional seasonNum/episodeNum; mapping nulls to undefined
  [`home.component.ts:23`](../../apps/frontend/src/app/home/home.component.ts#L23)

**UI rendering**

- Conditional episode label in Continue Watching section
  [`home.component.html:38`](../../apps/frontend/src/app/home/home.component.html#L38)

- Same pattern in Recently Added section
  [`home.component.html:76`](../../apps/frontend/src/app/home/home.component.html#L76)

- Muted small-text styling for the episode badge
  [`home.component.css:112`](../../apps/frontend/src/app/home/home.component.css#L112)

**Test support**

- Spec mock object updated with new fields
  [`browse.controller.spec.ts:191`](../../apps/backend/src/library/browse.controller.spec.ts#L191)
