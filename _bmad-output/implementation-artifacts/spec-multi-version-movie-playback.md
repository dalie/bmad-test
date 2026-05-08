---
title: 'Multi-Version Movie Playback'
type: 'feature'
created: '2026-05-07'
status: 'done'
baseline_commit: 'a986f03'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** When multiple media files match the same TMDB ID (e.g. 1080p and 4K copies of the same movie), the library grid shows duplicates and the user cannot choose which version to play.

**Approach:** Group matched movies by `tmdb_id` in the list API (show one poster per unique TMDB movie). On the detail page, expose all file versions with descriptive labels so the user can select which to play.

## Boundaries & Constraints

**Always:**
- Unmatched movies (no tmdb_id) continue to display and work exactly as before — no grouping, no versions UI.
- The movie detail page URL remains `/movie/:id` where `:id` is a media_file_id (the "primary" file, i.e. the one linked from the grid).
- Version labels are derived from probe_data (resolution, codec) and file size — no new user-editable metadata.

**Ask First:**
- Changing the movie grid route key from file_id to tmdb_id (currently avoided to preserve URL stability).

**Never:**
- Add a separate "versions" database table — use the existing tmdb_id grouping.
- Break existing playback, watch progress, or transcode flows.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Single file per TMDB ID | 1 file matched to tmdb_id 550 | Detail page shows no version selector, Play button works as today | N/A |
| Two files same TMDB ID | 2 files matched to tmdb_id 550 | Grid shows one entry; detail page lists both versions with labels | N/A |
| One version has no probe_data | File missing probe_data | Label falls back to filename | N/A |
| Unmatched movie | file with status match_failed | No grouping, no versions array, unchanged behavior | N/A |

</frozen-after-approval>

## Code Map

- `apps/backend/src/library/browse.service.ts` -- getMovies() list query and getMovieById() detail query
- `apps/backend/src/library/browse.controller.ts` -- HTTP endpoint for movie detail
- `apps/frontend/src/app/services/library.service.ts` -- MovieDetail interface and API call
- `apps/frontend/src/app/movie-detail/movie-detail.component.ts` -- detail page component
- `apps/frontend/src/app/movie-detail/movie-detail.component.html` -- detail page template
- `apps/frontend/src/app/movie-detail/movie-detail.component.css` -- detail page styles

## Tasks & Acceptance

**Execution:**
- [x] `apps/backend/src/library/browse.service.ts` -- In `getMovies()`, group matched movies by tmdb_id and return only the first (lowest id) per group. Add `GROUP BY m.tmdb_id` with `MIN(mf.id)` as the representative id.
- [x] `apps/backend/src/library/browse.service.ts` -- Add `FileVersion` interface with fields: `file_id`, `label`, `size`, `tier`, `transcode_output_path`. Add a `versions` array to `MovieDetail`. In `getMovieById()`, after fetching the primary row, query for sibling files sharing the same tmdb_id and build the versions array with resolution/codec labels derived from probe_data.
- [x] `apps/frontend/src/app/services/library.service.ts` -- Add `FileVersion` interface and add `versions: FileVersion[]` to `MovieDetail`.
- [x] `apps/frontend/src/app/movie-detail/movie-detail.component.html` -- When `versions.length > 1`, render a version list below the description. Each version is a labeled Play link showing resolution/size info.
- [x] `apps/frontend/src/app/movie-detail/movie-detail.component.css` -- Style the version list (simple vertical stack with clear tap targets).

**Acceptance Criteria:**
- Given two media files matched to the same TMDB ID, when browsing the movie grid, then only one poster appears for that movie.
- Given a movie with multiple versions, when viewing the detail page, then all versions are listed with descriptive labels (resolution, codec, file size).
- Given a movie with multiple versions, when clicking a version's Play link, then playback starts for that specific file.
- Given a movie with only one file, when viewing the detail page, then no version selector is shown — the single Play button displays as before.

## Design Notes

Version label derivation from probe_data (JSON with `videoTracks` array):
```
label = "{width}x{height} {codec}" e.g. "1920x1080 hevc"
fallback (no probe_data) = filename
```

The versions query finds siblings:
```sql
SELECT mf.id, mf.filename, mf.size, mf.tier, mf.probe_data,
       tj.output_path AS transcode_output_path
FROM media_files mf
JOIN metadata m ON m.media_file_id = mf.id
LEFT JOIN transcode_jobs tj ON tj.file_id = mf.id AND tj.status = 'completed'
WHERE m.tmdb_id = ? AND m.media_type = 'movie' AND mf.status IN ('ready', 'completed')
ORDER BY mf.id ASC
```

## Verification

**Commands:**
- `npm run build --workspace=apps/backend` -- expected: compiles without errors
- `npm run build --workspace=apps/frontend` -- expected: compiles without errors

**Manual checks:**
- With 2 files matched to same TMDB ID in the DB, movie grid shows one entry and detail page shows version selector.

## Suggested Review Order

**Deduplication & Grouping**

- Movie list query now groups by tmdb_id, returning lowest file id per movie
  [`browse.service.ts:210`](../../apps/backend/src/library/browse.service.ts#L210)

**Version Resolution**

- FileVersion interface defines the version data shape
  [`browse.service.ts:59`](../../apps/backend/src/library/browse.service.ts#L59)

- Sibling files with same tmdb_id are queried to build the versions array
  [`browse.service.ts:482`](../../apps/backend/src/library/browse.service.ts#L482)

- Label derived from probe_data's `video` object (resolution + codec), filename fallback
  [`browse.service.ts:155`](../../apps/backend/src/library/browse.service.ts#L155)

**Frontend UI**

- Version list rendered when multiple versions exist, single Play button otherwise
  [`movie-detail.component.html:45`](../../apps/frontend/src/app/movie-detail/movie-detail.component.html#L45)

- formatSize helper for human-readable file sizes
  [`movie-detail.component.ts:44`](../../apps/frontend/src/app/movie-detail/movie-detail.component.ts#L44)

- Version list CSS with 44px touch targets
  [`movie-detail.component.css:105`](../../apps/frontend/src/app/movie-detail/movie-detail.component.css#L105)

**Types**

- Frontend FileVersion interface mirrors backend shape
  [`library.service.ts:69`](../../apps/frontend/src/app/services/library.service.ts#L69)

**Tests**

- Controller spec mock updated with versions field
  [`browse.controller.spec.ts:107`](../../apps/backend/src/library/browse.controller.spec.ts#L107)
