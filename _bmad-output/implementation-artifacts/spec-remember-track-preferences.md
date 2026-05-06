---
title: "Remember Audio & Subtitle Track Preferences Per Video"
type: "feature"
created: "2026-05-05"
status: "done"
baseline_commit: "6238fed"
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** When a viewer returns to a previously watched video, the player always resets audio to the first track and subtitles to off — forcing the user to re-select their preferred tracks every time they resume.

**Approach:** Extend the existing `WatchProgressEntry` in localStorage with optional `audioTrackIndex` and `subtitleTrackId` fields. Save the user's selection whenever they switch tracks. On player init, after tracks are fetched from the API, restore the saved selections if they still exist in the available track lists.

## Boundaries & Constraints

**Always:** Use the existing `WatchProgressService` and `cineplex_progress` localStorage key. Track preferences are per-video (same storage key pattern as progress). Validate that a saved track still exists in the fetched track list before applying it.

**Ask First:** Persisting preferences server-side (currently all progress is client-only localStorage).

**Never:** Do not change the localStorage key or break existing progress entries. Do not auto-select tracks that no longer exist (graceful fallback to defaults). Do not add new services — extend the existing pattern.

## I/O & Edge-Case Matrix

| Scenario                       | Input / State                                                              | Expected Output / Behavior                         | Error Handling  |
| ------------------------------ | -------------------------------------------------------------------------- | -------------------------------------------------- | --------------- |
| Happy: audio restored          | Saved entry has `audioTrackIndex: 2`, track index 2 exists in fetched list | Audio track 2 is auto-selected on load             | N/A             |
| Happy: subtitle restored       | Saved entry has `subtitleTrackId: 5`, subtitle ID 5 exists in fetched list | Subtitle track 5 is shown on load                  | N/A             |
| Saved track missing            | Saved `audioTrackIndex: 3`, but API returns only indices 0,1               | Falls back to default (first audio track)          | Silent fallback |
| No prior entry                 | No localStorage entry for this video                                       | Default behavior (first audio, subtitles off)      | N/A             |
| Old entry without track fields | Existing entry has position/duration but no track fields                   | Default behavior — missing fields treated as unset | N/A             |

</frozen-after-approval>

## Code Map

- `apps/frontend/src/app/services/watch-progress.service.ts` -- WatchProgressEntry interface & persistence helpers
- `apps/frontend/src/app/player/player.component.ts` -- Player logic: track fetching, selection signals, progress saving

## Tasks & Acceptance

**Execution:**

- [x] `apps/frontend/src/app/services/watch-progress.service.ts` -- Add optional `audioTrackIndex?: number` and `subtitleTrackId?: number` fields to `WatchProgressEntry` interface
- [x] `apps/frontend/src/app/player/player.component.ts` -- Include `audioTrackIndex` and `subtitleTrackId` in the object passed to `saveEntry()` inside `saveProgress()`, reading from the current signal values
- [x] `apps/frontend/src/app/player/player.component.ts` -- After audio tracks are fetched and default is set, read saved entry and call `selectAudioTrack()` if the saved index exists in the fetched list
- [x] `apps/frontend/src/app/player/player.component.ts` -- After subtitle tracks are fetched, read saved entry and call `selectSubtitle()` if the saved ID exists in the fetched list
- [x] `apps/frontend/src/app/player/player.component.spec.ts` -- Add tests: track preferences are included in saved progress, saved preferences are restored on init, missing tracks fall back to defaults

**Acceptance Criteria:**

- Given a viewer selects audio track 2 and subtitle track 5 during playback, when progress is saved, then the localStorage entry includes `audioTrackIndex: 2` and `subtitleTrackId: 5`
- Given a viewer returns to a video with saved track preferences, when the player loads and fetches tracks, then the previously selected audio and subtitle tracks are automatically activated
- Given a saved audio track index no longer exists in the API response, when the player loads, then it falls back to the first available audio track (default behavior)
- Given a saved subtitle track ID no longer exists in the API response, when the player loads, then subtitles remain off (default behavior)

## Design Notes

The `saveProgress()` method already fires every 5s and on pause — simply adding the two signal values to the saved object is sufficient. No additional save triggers are needed for track changes.

For restoration, the player must read the saved entry **after** the track fetch completes (not before), since it needs to validate that the saved track still exists. Use the same storage key logic (`movie:${id}` or `tv:${id}:s${season}:e${episode}`) already computed for progress.

## Verification

**Commands:**

- `cd apps/frontend && npx ng test --watch=false` -- expected: all tests pass including new track preference tests

## Suggested Review Order

- Schema extension — two optional fields added to the shared progress interface
  [`watch-progress.service.ts:19`](../../apps/frontend/src/app/services/watch-progress.service.ts#L19)

- Persistence — track signals written into the progress entry on every save
  [`player.component.ts:420`](../../apps/frontend/src/app/player/player.component.ts#L420)

- Restoration entry point — constructor hooks restore after track fetches complete
  [`player.component.ts:132`](../../apps/frontend/src/app/player/player.component.ts#L132)

- Core restore logic — reads localStorage, validates track still exists, defers DOM activation
  [`player.component.ts:441`](../../apps/frontend/src/app/player/player.component.ts#L441)

- Subtitle restore — same pattern with subtitleTrackId validation
  [`player.component.ts:455`](../../apps/frontend/src/app/player/player.component.ts#L455)

- Cleanup — pending setTimeout IDs cleared on destroy to prevent leaked callbacks
  [`player.component.ts:236`](../../apps/frontend/src/app/player/player.component.ts#L236)

- Tests — persistence, restoration, and fallback edge cases
  [`player.component.spec.ts:1472`](../../apps/frontend/src/app/player/player.component.spec.ts#L1472)
