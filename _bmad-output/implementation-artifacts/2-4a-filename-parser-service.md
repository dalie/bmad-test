# Story 2.4a: Filename Parser Service

Status: review

## Story

As an admin,
I want the system to parse video filenames and extract title, year, season, and episode information,
so that the matching pipeline can query TMDB with accurate search terms.

## Acceptance Criteria

```gherkin
Given a video file exists in the media_files table with a torrent-style scene release filename
When the filename parser processes the filename
Then the title is extracted by stripping quality tags, codec info, and group names
And dots/underscores are replaced with spaces for a clean title
And the release year is extracted when present (e.g., "2025" from "Dust.Bunny.2025.REPACK.720p")
And for TV files, season and episode numbers are extracted (S01E02, 1x02, Season.1.Episode.02)
And the source type (movies vs tv) is used to guide parsing strategy
And edge cases (no year, multiple years in title, year-like numbers) are handled gracefully
```

## Tasks / Subtasks

- [x] 1. Create `FilenameParserService` in library module (AC: all)
  - [x] 1.1 Define `ParsedFilename` interface: `{ title: string; year?: number; season?: number; episode?: number; }`
  - [x] 1.2 Implement `parseFilename(filename: string, sourceType: 'movies'|'tv'): ParsedFilename`
  - [x] 1.3 Implement TV pattern detection: S##E##, s##e##, #x##, Season.#.Episode.#
  - [x] 1.4 Implement year extraction: regex `[.\s(]?(19|20)\d{2}[.\s)]?` — prefer last occurrence before quality tags
  - [x] 1.5 Implement quality/codec/group stripping: remove everything after year (movies) or episode pattern (TV)
  - [x] 1.6 Implement title cleanup: replace dots/underscores with spaces, trim whitespace, handle parenthesized years
- [x] 2. Register in LibraryModule (AC: all)
  - [x] 2.1 Add `FilenameParserService` to providers in `library.module.ts`
  - [x] 2.2 Export `FilenameParserService` from `LibraryModule` for use by matching service in 2-4c
- [x] 3. Unit tests (AC: all)
  - [x] 3.1 Test movie filenames: `Dust.Bunny.2025.REPACK.720p.WEB.H264-SLOT.mkv` → title "Dust Bunny", year 2025
  - [x] 3.2 Test movie with parenthesized year: `Movie Name (2023).mkv` → title "Movie Name", year 2023
  - [x] 3.3 Test movie with complex codecs: `Movie.Name.2023.2160p.WEB-DL.DDP5.1.H.265-GROUP.mkv` → title "Movie Name", year 2023
  - [x] 3.4 Test TV S##E## pattern: `Show.Name.S03E05.Episode.Title.720p.WEB.H264-GROUP.mkv` → title "Show Name", season 3, episode 5
  - [x] 3.5 Test TV #x## pattern: `Show Name - 1x05 - Episode Title.mkv` → title "Show Name", season 1, episode 5
  - [x] 3.6 Test TV Season.#.Episode.# pattern: `Show.Name.Season.2.Episode.10.mkv` → title "Show Name", season 2, episode 10
  - [x] 3.7 Test edge case: filename with no year → title extracted, year undefined
  - [x] 3.8 Test edge case: year-like number in title (e.g., `2012.2009.720p.mkv`) → title "2012", year 2009

## Dev Notes

### Technical Implementation

**Do NOT use external libraries for filename parsing.** Implement a custom regex-based parser tuned for common torrent naming conventions. The project has no npm dependencies for this and the patterns are well-defined.

Common torrent filename patterns to handle:

```
Movies:
  "Dust.Bunny.2025.REPACK.720p.WEB.H264-SLOT.mkv"
  "The.Movie.Name.2024.1080p.BluRay.x264-GROUP.mkv"
  "Movie Name (2023).mkv"
  "Movie.Name.2023.2160p.WEB-DL.DDP5.1.H.265-GROUP.mkv"

TV Shows:
  "Show.Name.S03E05.Episode.Title.720p.WEB.H264-GROUP.mkv"
  "Show.Name.s01e01.720p.mkv"
  "Show Name - 1x05 - Episode Title.mkv"
  "Show.Name.Season.2.Episode.10.mkv"
```

**Parsing strategy:**

1. Remove file extension
2. Detect TV patterns first (S##E##, #x##, Season.#.Episode.#) — if found, extract season+episode and use text before the pattern as title candidate
3. Extract year using regex `[.\s(]?(19|20)\d{2}[.\s)]?` — prefer the LAST occurrence before quality tags
4. Strip quality tags, codecs, groups, and everything after year/episode pattern
5. Replace dots/underscores with spaces for title, trim

**Quality/codec tags to strip (case-insensitive):**
`720p`, `1080p`, `2160p`, `4K`, `WEB`, `WEB-DL`, `WEBRip`, `BluRay`, `BDRip`, `DVDRip`, `HDTV`, `REPACK`, `PROPER`, `x264`, `x265`, `H264`, `H.264`, `H265`, `H.265`, `HEVC`, `AAC`, `AC3`, `DTS`, `DDP5.1`, `DD5.1`, `FLAC`, `REMUX`

### Architecture Compliance

1. **Pure logic service** — no I/O, no database access, no async operations
2. **NestJS patterns:** `@Injectable()` provider in `LibraryModule`
3. **Testable in isolation** — no mocking required, pure input/output functions

### File Structure

```
apps/backend/src/library/
├── filename-parser.service.ts       # NEW: regex-based torrent filename parser
├── filename-parser.service.spec.ts  # NEW: unit tests
├── library.module.ts                # UPDATE: add to providers/exports
```

### Previous Story Intelligence (Learnings from 2.3)

- Services follow `@Injectable()` pattern, registered in `LibraryModule` providers array
- Export from module to make available to other services within the module (injection still works without export for intra-module use, but export makes intent clear)
- Use the actual filename from the media folder (`Dust.Bunny.2025.REPACK.720p.WEB.H264-SLOT`) as a primary test case

### References

- [Source: _bmad-output/planning-artifacts/epics.md - Story 2.4 AC line 1: "filename is parsed to extract: title, year, season number, and episode number"]
- [Source: _bmad-output/planning-artifacts/prd.md - FR3: "System can parse video filenames to extract title, year, season, and episode information"]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (GitHub Copilot)

### Debug Log References

None — clean implementation, all tests passed on first run.

### Completion Notes List

- Implemented `FilenameParserService` as a pure-logic `@Injectable()` NestJS service with no external dependencies
- Custom regex-based parser handles: torrent-style dot-separated names, parenthesized years, S##E##/s##e##/#x##/Season.#.Episode.# TV patterns
- Parsing strategy: remove extension → detect TV patterns → extract year (last occurrence before quality tags) → strip quality/codec tags → clean title (dots/underscores → spaces)
- Registered and exported from `LibraryModule` for use by future matching orchestration (story 2-4c)
- 9 unit tests covering all specified cases including edge cases (no year, year-like title numbers)
- Full regression suite: 46 tests across 7 suites — all passing, zero regressions

### File List

- apps/backend/src/library/filename-parser.service.ts (NEW)
- apps/backend/src/library/filename-parser.service.spec.ts (NEW)
- apps/backend/src/library/library.module.ts (MODIFIED)

## Change Log

- 2026-05-02: Implemented FilenameParserService — regex-based torrent filename parser with full unit test coverage
