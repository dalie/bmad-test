---
title: "Fix Tier 2 transcode to generate sidecars for all audio tracks"
type: "bugfix"
created: "2026-05-05"
status: "done"
baseline_commit: "4935984"
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** On Tier 2 movies with multiple audio tracks, `processAudioSidecar` only generates a sidecar for the primary track (`-map 0:a:0`). The serving layer already resolves per-track paths (`{fileId}_track_N.m4a`) and the frontend already constructs per-track URLs, but the files don't exist — so switching to any non-primary track returns a 404.

**Approach:** After generating the primary sidecar, iterate the remaining audio tracks from `probe_data.audioTracks` and generate additional sidecars using the established naming convention (`{fileId}_track_{N}.m4a` for audio-relative position N >= 1). Reuse the same FFmpeg extraction logic with the appropriate `-map 0:a:{N}` stream selector.

## Boundaries & Constraints

**Always:** Keep the primary sidecar path unchanged (`{fileId}.m4a`). Preserve existing mutex guard, crash recovery, error isolation, and job lifecycle. The job still marks `completed` only when ALL tracks succeed.

**Ask First:** Changing bitrate/channel settings per track (e.g. preserving surround for 5.1 tracks). Skipping re-encode for tracks already in AAC.

**Never:** Change the DB schema or add per-track rows to `transcode_jobs`. Change the sidecar naming convention used by `media.service.ts`. Modify Tier 1/3 logic.

## I/O & Edge-Case Matrix

| Scenario                       | Input / State                                 | Expected Output / Behavior                                                          | Error Handling                                            |
| ------------------------------ | --------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Single audio track (Tier 2)    | probe_data.audioTracks has 1 entry            | Only primary sidecar generated (`{fileId}.m4a`) — identical to current behavior     | N/A                                                       |
| Multiple audio tracks          | audioTracks has 3 entries                     | Primary: `{fileId}.m4a`, additional: `{fileId}_track_1.m4a`, `{fileId}_track_2.m4a` | N/A                                                       |
| One track fails mid-generation | FFmpeg errors on track 2 of 3                 | Job marked `failed`, error details stored, partial files left on disk               | Existing error path — job fails, media stays `classified` |
| Re-run after failure           | Job reset to `queued`, some track files exist | FFmpeg `-y` overwrites existing files, all tracks regenerated                       | N/A                                                       |

</frozen-after-approval>

## Code Map

- `apps/backend/src/library/transcode.service.ts` -- `processAudioSidecar()` generates only one sidecar; `runFfmpegAudioExtract()` hardcodes `-map 0:a:0`
- `apps/backend/src/library/transcode.service.spec.ts` -- unit tests for transcode service

## Tasks & Acceptance

**Execution:**

- [x] `apps/backend/src/library/transcode.service.ts` -- Modify `processAudioSidecar`: fetch `probe_data` from `media_files` (add to the existing query or run a second query), parse `audioTracks` array, and after generating the primary sidecar, loop through tracks at position 1+ generating `{fileId}_track_{N}.m4a` via the same FFmpeg extraction -- enables per-track sidecar playback
- [x] `apps/backend/src/library/transcode.service.ts` -- Refactor `runFfmpegAudioExtract` to accept an `audioStreamIndex` parameter (defaulting to 0) and use it in `-map 0:a:{audioStreamIndex}` instead of hardcoded `0:a:0` -- supports extracting any audio stream by position
- [x] `apps/backend/src/library/transcode.service.spec.ts` -- Add test: multi-track file generates sidecars for all audio tracks with correct filenames; add test: single-track file produces only the primary sidecar (regression) -- validates the fix and prevents regression

**Acceptance Criteria:**

- Given a Tier 2 file with 3 audio tracks, when the transcode job completes, then 3 sidecar files exist: `{fileId}.m4a`, `{fileId}_track_1.m4a`, `{fileId}_track_2.m4a`
- Given a Tier 2 file with 1 audio track, when the transcode job completes, then only `{fileId}.m4a` exists (no `_track_` files)
- Given a multi-track transcode where FFmpeg fails on track 2, when the error occurs, then the job is marked `failed` with error details and `media_files.status` stays `classified`

## Spec Change Log

## Verification

## Suggested Review Order

- Multi-track loop: reads probe_data, generates primary then iterates additional tracks
  [`transcode.service.ts:82`](../../apps/backend/src/library/transcode.service.ts#L82)

- Parameterized FFmpeg extraction: `-map 0:a:{N}` instead of hardcoded `0:a:0`
  [`transcode.service.ts:138`](../../apps/backend/src/library/transcode.service.ts#L138)

- Tests: multi-track generation, single-track regression, failure mid-track
  [`transcode.service.spec.ts:262`](../../apps/backend/src/library/transcode.service.spec.ts#L262)
