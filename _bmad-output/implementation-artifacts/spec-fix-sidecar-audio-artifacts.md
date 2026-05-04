---
title: "Fix sidecar audio stutter artifacts during playback"
type: "bugfix"
created: "2026-05-04"
status: "done"
baseline_commit: "6012993"
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** When playing a Tier 2 movie (video + AAC sidecar audio), the audio stutters with rapid pause/resume artifacts. The AAC file plays cleanly in VLC, so the issue is the browser sync logic — specifically the `syncLoop()` hard-seeks `audio.currentTime` every frame drift exceeds 50ms, causing the audio element to repeatedly buffer/seek.

**Approach:** Replace aggressive hard-seek correction with a two-tier strategy: use `playbackRate` adjustment for small drift (soft correction), and reserve hard-seek only for large drift (>300ms). This eliminates micro-seek stutter while still maintaining sync.

## Boundaries & Constraints

**Always:** Maintain sync within 150ms during normal playback. Hard-seek remains the fallback for large jumps (user seeking, buffering stalls). Existing seek/play/pause/volume event handlers remain unchanged.

**Ask First:** Changing the drift tolerance thresholds beyond what's specified here.

**Never:** Remove the sync loop entirely. Add third-party sync libraries. Change the dual-element architecture.

## I/O & Edge-Case Matrix

| Scenario        | Input / State                              | Expected Output / Behavior                           | Error Handling |
| --------------- | ------------------------------------------ | ---------------------------------------------------- | -------------- |
| Normal playback | drift < 50ms                               | playbackRate = 1.0 (no correction)                   | N/A            |
| Small drift     | 50ms < drift < 300ms                       | Adjust audio playbackRate (1.02 or 0.98) to converge | N/A            |
| Large drift     | drift > 300ms                              | Hard-seek audio.currentTime = video.currentTime      | N/A            |
| Drift corrected | drift returns < 30ms after rate adjustment | Reset playbackRate to 1.0                            | N/A            |
| Video paused    | video is paused                            | Skip sync corrections entirely                       | N/A            |

</frozen-after-approval>

## Code Map

- `apps/frontend/src/app/player/player.component.ts` -- Contains `syncLoop()` method with the aggressive seek logic causing artifacts

## Tasks & Acceptance

**Execution:**

- [x] `apps/frontend/src/app/player/player.component.ts` -- Replace `syncLoop()` with two-tier drift correction: playbackRate for 50-300ms drift, hard-seek for >300ms, and a deadband reset at <30ms

**Acceptance Criteria:**

- Given a Tier 2 movie is playing, when audio drift is between 50ms and 300ms, then audio playbackRate is adjusted (not hard-seeked) and no audible artifacts occur
- Given a Tier 2 movie is playing, when audio drift exceeds 300ms, then audio is hard-seeked to video.currentTime
- Given drift was being corrected via playbackRate, when drift drops below 30ms, then playbackRate resets to 1.0

## Design Notes

The two-tier approach is standard for web A/V sync:

```typescript
// Pseudocode for new syncLoop body
if (video.paused) return schedule next frame;
const drift = video.currentTime - audio.currentTime; // signed
if (Math.abs(drift) > 0.3) {
  audio.currentTime = video.currentTime;
  audio.playbackRate = 1.0;
} else if (Math.abs(drift) > 0.05) {
  audio.playbackRate = drift > 0 ? 1.02 : 0.98;
} else if (Math.abs(drift) < 0.03) {
  audio.playbackRate = 1.0;
}
```

Key: use signed drift to determine direction of rate adjustment. The 2% rate change is imperceptible to human ears but converges quickly (~2.5s to close 50ms gap).

## Verification

**Commands:**

- `npm run build -w apps/frontend` -- expected: compiles without errors

**Manual checks:**

- Play a Tier 2 movie for 30+ seconds — audio should be smooth with no stutter artifacts
- Seek mid-playback — audio should re-sync within 1-2 seconds without audible glitch

## Suggested Review Order

- Two-tier drift correction replaces aggressive per-frame hard-seek with playbackRate nudge + deadband
  [`player.component.ts:140`](../../apps/frontend/src/app/player/player.component.ts#L140)
