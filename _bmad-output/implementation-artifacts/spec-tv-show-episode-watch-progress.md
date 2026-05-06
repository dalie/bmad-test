---
title: "TV Show Episode Watch Progress"
type: "feature"
created: "2026-05-05"
status: "done"
baseline_commit: "491248e"
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The TV show detail page lists episodes with a plain "Play" button but shows no watch progress — viewers can't tell which episodes they've watched, which are in progress, or resume from where they left off.

**Approach:** Read per-episode watch progress from localStorage in the show detail component. Display a progress bar and watched state on each episode row, and replace the "Play" link text with "Resume" / "Start from beginning" / "Play" based on episode state.

## Boundaries & Constraints

**Always:** Reuse the existing `WatchProgressService` and its key format (`tv:{tmdbId}:s{season}:e{episode}`). Mirror poster-grid visual patterns (3px orange progress bar, dimmed text for watched). Keep all state client-side in localStorage.

**Ask First:** Adding a checkmark icon or badge for watched episodes beyond text dimming.

**Never:** Modify the watch-progress service data shape. Add server-side watch tracking. Change the player resume logic.

## I/O & Edge-Case Matrix

| Scenario             | Input / State                                         | Expected Output / Behavior                        | Error Handling |
| -------------------- | ----------------------------------------------------- | ------------------------------------------------- | -------------- |
| Unwatched episode    | No entry in localStorage                              | "Play" link, no progress bar, normal styling      | N/A            |
| In-progress episode  | Entry with `watched: false`, position 600/3600        | "Resume" link, 17% progress bar shown             | N/A            |
| Watched episode      | Entry with `watched: true`                            | "Play" link, dimmed episode row, no progress bar  | N/A            |
| In-progress near end | Entry with `watched: false`, position 3420/3600 (95%) | "Start from beginning" link, 95% progress bar     | N/A            |
| Multiple seasons     | Mix of watched/in-progress/unwatched across seasons   | Each episode reflects its own state independently | N/A            |

</frozen-after-approval>

## Code Map

- `apps/frontend/src/app/show-detail/show-detail.component.ts` — add progress data loading and helper methods
- `apps/frontend/src/app/show-detail/show-detail.component.html` — add progress bar, watched class, conditional link text
- `apps/frontend/src/app/show-detail/show-detail.component.css` — progress bar and watched episode styles
- `apps/frontend/src/app/services/watch-progress.service.ts` — existing service (read-only reference)
- `apps/frontend/src/app/services/library.service.ts` — existing EpisodeItem/ShowDetail interfaces (read-only reference)

## Tasks & Acceptance

**Execution:**

- [x] `apps/frontend/src/app/show-detail/show-detail.component.ts` — inject `WatchProgressService`, load progress entries on init, add `getEpisodeProgress(seasonNum, episodeNum)` and `getEpisodeLabel(seasonNum, episodeNum)` helpers that compute state per episode using show `id` and the `tv:{id}:s{s}:e{e}` key format
- [x] `apps/frontend/src/app/show-detail/show-detail.component.html` — wrap each episode row with a watched class, render a progress bar element below the episode when in-progress, replace static "Play" text with the computed label
- [x] `apps/frontend/src/app/show-detail/show-detail.component.css` — add `.episode--watched` dimmed style (opacity 0.5), `.episode__progress` bar style (3px height, deep orange, bottom-positioned within the episode row)

**Acceptance Criteria:**

- Given a viewer has partially watched S01E03 (position 600 of 3600s), when they open the show detail page, then S01E03 shows a 17% progress bar and the link reads "Resume"
- Given a viewer has watched ≥90% of S01E01, when they open the show detail page, then S01E01 appears dimmed and the link reads "Play"
- Given a viewer has watched ≥95% of an episode (not yet flagged watched), when they open the show detail page, then the link reads "Start from beginning"
- Given no watch data exists for an episode, when the viewer opens the show detail page, then the episode shows "Play" with no progress bar and normal styling

## Verification

**Commands:**

- `npm run build -w apps/frontend` — expected: zero errors

**Manual checks:**

- Open a TV show detail page → episodes without progress show "Play"
- Partially watch an episode → return to detail page → progress bar visible, "Resume" label shown
- Watch an episode past 90% → return → episode row dimmed, "Play" label
- Watch an episode to 95%+ without triggering watched flag → "Start from beginning" label

## Suggested Review Order

- Progress state logic: effect loads localStorage data, three helpers derive per-episode state
  [`show-detail.component.ts:35`](../../apps/frontend/src/app/show-detail/show-detail.component.ts#L35)

- Label resolution: Play / Resume / Start from beginning based on position thresholds
  [`show-detail.component.ts:59`](../../apps/frontend/src/app/show-detail/show-detail.component.ts#L59)

- Template bindings: watched class, dynamic label text, and conditional progress bar
  [`show-detail.component.html:41`](../../apps/frontend/src/app/show-detail/show-detail.component.html#L41)

- Styles: dimmed watched rows (opacity 0.4) and 3px progress bar matching poster-grid pattern
  [`show-detail.component.css:101`](../../apps/frontend/src/app/show-detail/show-detail.component.css#L101)
