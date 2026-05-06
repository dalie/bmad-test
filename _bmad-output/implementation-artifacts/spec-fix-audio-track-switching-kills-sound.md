---
title: "Fix audio track switching kills sound on Tier 2 movies"
type: "bugfix"
created: "2026-05-05"
status: "done"
baseline_commit: "6391c8b"
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** On Tier 2 movies with multiple audio tracks, switching to any track (including the one already playing) permanently kills audio. The frontend sends the absolute ffprobe stream index as `trackIndex` — but audio streams are never at index 0 (that's video), so even the primary track gets routed to a per-track sidecar filename that doesn't exist, causing a 404 and disabling sync permanently.

**Approach:** Map the selected track to its audio-relative position (0-based index within the `audioTracks` array) instead of using the absolute stream index. Position 0 = primary sidecar (omit `trackIndex`); position 1+ = per-track sidecar URL. This restores the ability to switch back to the default track and makes per-track sidecar requests use the correct filename convention.

## Boundaries & Constraints

**Always:** Preserve existing Tier 1/3 native `audioTracks` logic untouched. Preserve sync loop, error fallback, and `syncDisabled` recovery behavior.

**Ask First:** Generating per-track sidecars at transcode time (out of scope here — non-primary tracks will still 404 gracefully, but returning to primary will work).

**Never:** Change the backend sidecar path convention. Change audio element lifecycle or sync architecture.

## I/O & Edge-Case Matrix

| Scenario                                  | Input / State                                    | Expected Output / Behavior                                           | Error Handling                                        |
| ----------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------- | ----------------------------------------------------- |
| Switch to primary track (already playing) | User selects track at array position 0           | URL = `/api/media/stream/{fileId}/audio` (no param), audio continues | N/A                                                   |
| Switch to non-primary track               | User selects track at position 1+                | URL includes `?trackIndex={position}`, loads sidecar if exists       | 404 → syncDisabled, video unmutes (existing fallback) |
| Switch back to primary after failure      | syncDisabled=true, user selects position-0 track | syncDisabled reset, primary sidecar loads, audio resumes             | N/A                                                   |
| Single audio track                        | audioTracks has 1 entry                          | AUDIO button not rendered (existing behavior)                        | N/A                                                   |

</frozen-after-approval>

## Code Map

- `apps/frontend/src/app/player/player.component.ts` -- selectAudioTrack() method, Tier 2 branch builds incorrect URL using absolute stream index
- `apps/frontend/src/app/player/player.component.spec.ts` -- existing tests for audio track selection need updating

## Tasks & Acceptance

**Execution:**

- [x] `apps/frontend/src/app/player/player.component.ts` -- In `selectAudioTrack()` Tier 2 branch, replace `track.index === 0` check with position-based lookup: find the track's index in `this.audioTracks()` array, use position 0 for base URL and position N for `?trackIndex=N` -- fixes incorrect URL that caused all selections to 404
- [x] `apps/frontend/src/app/player/player.component.spec.ts` -- Update the Tier 2 track-switching test to verify correct URL construction: position-0 track uses base URL, position-1+ uses trackIndex=position -- ensures regression coverage

**Acceptance Criteria:**

- Given a Tier 2 movie with audio tracks at stream indices [1, 2], when the user selects the first audio track (position 0), then the audio src is set to `/api/media/stream/{fileId}/audio` without a trackIndex parameter
- Given a Tier 2 movie where audio failed (syncDisabled=true), when the user selects the primary track, then audio playback resumes successfully

## Verification

**Commands:**

- `cd apps/frontend && npx ng test --watch=false --browsers=ChromeHeadless` -- expected: all player tests pass

## Suggested Review Order

- Position-based URL construction replaces broken absolute-index check
  [`player.component.ts:479`](../../apps/frontend/src/app/player/player.component.ts#L479)

- Guard for track-not-found prevents silent fallback to wrong URL
  [`player.component.ts:481`](../../apps/frontend/src/app/player/player.component.ts#L481)

- Test data uses realistic ffprobe indices (1, 2) instead of (0, 1)
  [`player.component.spec.ts:475`](../../apps/frontend/src/app/player/player.component.spec.ts#L475)

- activeAudioIndex assertions updated for new stream indices
  [`player.component.spec.ts:546`](../../apps/frontend/src/app/player/player.component.spec.ts#L546)
