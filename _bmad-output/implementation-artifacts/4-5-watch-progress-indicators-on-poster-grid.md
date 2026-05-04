# Story 4.5: Watch Progress Indicators on Poster Grid

Status: done

## Story

As a viewer,
I want to see progress bars on partially watched titles and visual distinction on completed titles,
so that I know what I've been watching and what's finished.

## Acceptance Criteria

```gherkin
Given the viewer has watch progress stored in localStorage
When the poster grid renders
Then partially watched titles show a thin deep orange progress bar at the poster bottom edge (UX-DR5)
And completed (watched) titles are visually dimmed
And for TV shows, the Continue Watching entry links to the last episode the viewer watched in the series, even if previous episodes were skipped
And progress data is read from localStorage on page load — no server calls needed
And titles with progress appear in the "Continue Watching" section at the top
```

## Tasks / Subtasks

- [x] 1. Define localStorage schema interfaces in `apps/frontend/src/app/home/home.component.ts`
  - [x] 1.1 Export `WatchProgressEntry` interface — the per-file progress record stored in localStorage:
    ```typescript
    export interface WatchProgressEntry {
      position: number; // current playback position in seconds
      duration: number; // total duration in seconds
      watched: boolean; // true when playback reaches ≥ 90% (set by story 6-3)
      updatedAt: number; // Date.now() timestamp — used to pick the "most recent" episode per show
      // Denormalized display metadata (required for Continue Watching without API calls):
      mediaType: "movie" | "tv";
      id: number; // movies: media_files.id (= MovieListItem.id); TV: tmdb_id (= ShowListItem.id)
      title: string;
      posterUrl: string | null;
      year: number | null;
      fileId: number; // media_files.id — used for ['/play', fileId] routing
    }
    ```
  - [x] 1.2 Export `WatchProgressRecord` type — the top-level JSON stored at `WATCH_PROGRESS_KEY`:
    ```typescript
    // Key format:
    //   Movies:       "movie:{media_files_id}"
    //   TV episodes:  "tv:{tmdb_id}:{file_id}"
    export type WatchProgressRecord = Record<string, WatchProgressEntry>;
    ```
    Critical: The key format `movie:{id}` and `tv:{tmdbId}:{fileId}` is the shared contract
    between story 4-5 (reads) and story 6-1 (writes). Story 6-1 MUST use this exact key format.
  - [x] 1.3 Export `ContinueWatchingItem` interface extending `LibraryItem`:
    ```typescript
    export interface ContinueWatchingItem extends LibraryItem {
      progressPercent: number; // 0–100 derived from position/duration
      watched: boolean; // always false for Continue Watching items (watched items are excluded)
      playFileId: number; // media_files.id for ['/play', playFileId] route
    }
    ```

- [x] 2. Implement `buildProgressData()` and update `readContinueWatchingFromStorage()` in `home.component.ts`
  - [x] 2.1 Add private `buildProgressData()` method that returns `Map<string, WatchProgressEntry>` keyed by `"${mediaType}:${id}"` (aggregating TV episodes to show-level by picking the most recent `updatedAt`):

    ```typescript
    private buildProgressData(): Map<string, WatchProgressEntry> {
      try {
        const raw = localStorage.getItem(WATCH_PROGRESS_KEY);
        if (!raw) return new Map();
        const record = JSON.parse(raw) as WatchProgressRecord;
        const latest = new Map<string, WatchProgressEntry>();
        for (const entry of Object.values(record)) {
          // Validate entry shape before trusting it
          if (
            typeof entry?.position !== 'number' ||
            typeof entry?.duration !== 'number' ||
            typeof entry?.id !== 'number' ||
            typeof entry?.fileId !== 'number'
          ) continue;
          const mapKey = `${entry.mediaType}:${entry.id}`;
          const existing = latest.get(mapKey);
          if (!existing || entry.updatedAt > existing.updatedAt) {
            latest.set(mapKey, entry);
          }
        }
        return latest;
      } catch {
        return new Map();
      }
    }
    ```

    This map collapses multiple TV episodes down to the single most-recently-updated entry per show.
    The `mapKey` for movies is `"movie:${media_files_id}"` and for TV shows `"tv:${tmdb_id}"`.

  - [x] 2.2 Update `readContinueWatchingFromStorage()` to parse real localStorage data — remove the stub `return []`:

    ```typescript
    private readContinueWatchingFromStorage(): ContinueWatchingItem[] {
      try {
        const raw = localStorage.getItem(WATCH_PROGRESS_KEY);
        if (!raw) return [];
        const record = JSON.parse(raw) as WatchProgressRecord;

        // Group by title-level key (same as buildProgressData), keep only most recent entry per title
        const latestByTitle = new Map<string, WatchProgressEntry>();
        for (const entry of Object.values(record)) {
          if (
            typeof entry?.position !== 'number' ||
            typeof entry?.duration !== 'number' ||
            typeof entry?.id !== 'number' ||
            typeof entry?.fileId !== 'number'
          ) continue;
          const key = `${entry.mediaType}:${entry.id}`;
          const existing = latestByTitle.get(key);
          if (!existing || entry.updatedAt > existing.updatedAt) {
            latestByTitle.set(key, entry);
          }
        }

        return Array.from(latestByTitle.values())
          .filter(e => !e.watched)               // exclude fully-watched titles
          .filter(e => e.duration > 0 && e.position > 0)  // must have real progress
          .sort((a, b) => b.updatedAt - a.updatedAt)       // most recently watched first
          .map(e => ({
            id: e.id,
            title: e.title,
            year: e.year,
            posterUrl: e.posterUrl,
            mediaType: e.mediaType,
            progressPercent: Math.min(100, Math.round((e.position / e.duration) * 100)),
            watched: false,
            playFileId: e.fileId,
          }));
      } catch {
        return [];
      }
    }
    ```

    Notes:
    - `watched: false` is always set here because we filter out `e.watched === true` entries.
    - For TV shows, `e.fileId` is the `media_files.id` of the LAST-WATCHED episode — satisfying the AC
      "for TV shows, the Continue Watching entry links to the last episode the viewer watched in the series".
    - `progressPercent` uses integer rounding (`Math.round`) to avoid fractional pixel width rendering issues.
    - No API calls — all data comes from localStorage (satisfies AC).

  - [x] 2.3 Change `continueWatchingItems` signal type from `signal<LibraryItem[]>` to `signal<ContinueWatchingItem[]>`:

    ```typescript
    readonly continueWatchingItems = signal<ContinueWatchingItem[]>(
      this.readContinueWatchingFromStorage()
    );
    ```

    `ContinueWatchingItem extends LibraryItem`, so the type change is backward-compatible for the template.

  - [x] 2.4 Add `progressData` private signal — the Map used by `getProgressPercent()` and `isWatched()` for Recently Added and Library sections:

    ```typescript
    private readonly progressData = signal<Map<string, WatchProgressEntry>>(
      this.buildProgressData()
    );
    ```

  - [x] 2.5 Add public `getProgressPercent(item: LibraryItem): number` method for template use:

    ```typescript
    getProgressPercent(item: LibraryItem): number {
      const entry = this.progressData().get(`${item.mediaType}:${item.id}`);
      if (!entry || entry.watched || entry.duration <= 0) return 0;
      return Math.min(100, Math.round((entry.position / entry.duration) * 100));
    }
    ```

    Returns 0 when:
    - No entry exists for this item
    - Entry is marked `watched` (dimmed instead — no partial bar shown for completed titles)
    - Duration is 0 (sentinel for unknown duration — same guard pattern as `formatDuration`)

  - [x] 2.6 Add public `isWatched(item: LibraryItem): boolean` method for template use:

    ```typescript
    isWatched(item: LibraryItem): boolean {
      return this.progressData().get(`${item.mediaType}:${item.id}`)?.watched ?? false;
    }
    ```

  - [x] 2.7 Full updated import block (add `signal` if not already there — it already is):
    ```typescript
    import {
      Component,
      ChangeDetectionStrategy,
      computed,
      signal,
      inject,
    } from "@angular/core";
    ```
    No new imports needed — all required imports were already present in 4-2.

- [x] 3. Update `apps/frontend/src/app/home/home.component.html`
  - [x] 3.1 Update the Continue Watching section poster cards:
    - Change `[routerLink]` from `item.mediaType === 'movie' ? ['/movie', item.id] : ['/show', item.id]` to `['/play', item.playFileId]`
    - Add `position: relative` class context via `[class.poster-grid__image-wrap--has-progress]="true"` — actually just add the progress bar unconditionally (it's always > 0 in Continue Watching)
    - Add watched class and progress bar inside `.poster-grid__image-wrap`
      Full updated Continue Watching `@for` block:

    ```html
    @for (item of continueWatchingItems(); track (item.mediaType + ':' +
    item.id)) {
    <a class="poster-grid__item" [routerLink]="['/play', item.playFileId]">
      <div class="poster-grid__image-wrap">
        @if (item.posterUrl) {
        <img
          class="poster-grid__image"
          [src]="item.posterUrl"
          [alt]="item.title"
          loading="lazy"
        />
        } @else {
        <div class="poster-grid__image--fallback"></div>
        }
        <div
          class="poster-grid__progress"
          [style.width.%]="item.progressPercent"
        ></div>
      </div>
      <p class="poster-grid__title">{{ item.title }}</p>
    </a>
    }
    ```

    Note: No `@if` guard on progress bar in Continue Watching — all items here have `progressPercent > 0` by construction. Always render the bar.

  - [x] 3.2 Update the Recently Added section poster cards:
    - Add `[class.poster-grid__image-wrap--watched]="isWatched(item)"` to `.poster-grid__image-wrap`
    - Add conditional progress bar using `@let`:

    ```html
    @for (item of recentItems(); track (item.mediaType + ':' + item.id)) {
    <a
      class="poster-grid__item"
      [routerLink]="item.mediaType === 'movie' ? ['/movie', item.id] : ['/show', item.id]"
    >
      <div
        class="poster-grid__image-wrap"
        [class.poster-grid__image-wrap--watched]="isWatched(item)"
      >
        @if (item.posterUrl) {
        <img
          class="poster-grid__image"
          [src]="item.posterUrl"
          [alt]="item.title"
          loading="lazy"
        />
        } @else {
        <div class="poster-grid__image--fallback"></div>
        } @let progress = getProgressPercent(item); @if (progress > 0) {
        <div class="poster-grid__progress" [style.width.%]="progress"></div>
        }
      </div>
      <p class="poster-grid__title">{{ item.title }}</p>
    </a>
    }
    ```

  - [x] 3.3 Update the Library (A-Z) section poster cards — same pattern as Recently Added:
    ```html
    @for (item of allItems(); track (item.mediaType + ':' + item.id)) {
    <a
      class="poster-grid__item"
      [routerLink]="item.mediaType === 'movie' ? ['/movie', item.id] : ['/show', item.id]"
    >
      <div
        class="poster-grid__image-wrap"
        [class.poster-grid__image-wrap--watched]="isWatched(item)"
      >
        @if (item.posterUrl) {
        <img
          class="poster-grid__image"
          [src]="item.posterUrl"
          [alt]="item.title"
          loading="lazy"
        />
        } @else {
        <div class="poster-grid__image--fallback"></div>
        } @let progress = getProgressPercent(item); @if (progress > 0) {
        <div class="poster-grid__progress" [style.width.%]="progress"></div>
        }
      </div>
      <p class="poster-grid__title">{{ item.title }}</p>
    </a>
    }
    ```

- [x] 4. Update `apps/frontend/src/app/home/home.component.css`
  - [x] 4.1 Add `position: relative` to `.poster-grid__image-wrap` (required for absolute-positioned progress bar):

    ```css
    .poster-grid__image-wrap {
      aspect-ratio: var(--poster-ratio); /* 2 / 3 */
      background-color: var(--color-surface);
      overflow: hidden;
      position: relative; /* ← NEW: enables absolute positioning of progress bar */
    }
    ```

    Note: `position: relative` is added to the component-scoped `.poster-grid__image-wrap` rule,
    not to the global `layout.css`. Angular's view encapsulation means this only applies within
    `HomeComponent`. The progress bar is home-page-only feature.

  - [x] 4.2 Add `.poster-grid__progress` styles for the thin deep orange progress bar at poster bottom edge:

    ```css
    /* Thin deep orange progress bar at poster bottom edge — UX-DR5 */
    .poster-grid__progress {
      position: absolute;
      bottom: 0;
      left: 0;
      height: 3px;
      background-color: var(
        --color-progress
      ); /* --color-progress = var(--color-accent) = #e65100 */
      /* width is set inline via [style.width.%]="progressPercent" */
    }
    ```

    UX constraints:
    - 3px height — "thin" per UX-DR5
    - Bottom edge of the poster image — NOT an overlay on the image content
    - `--color-progress` token resolves to `var(--color-accent)` = `#e65100` (deep orange)
    - No border-radius, no box-shadow, no transition (UX-DR10 zero-animation)

  - [x] 4.3 Add `.poster-grid__image-wrap--watched` dimming styles for completed titles:
    ```css
    /* Watched (completed) titles are visually dimmed — UX-DR5 */
    .poster-grid__image-wrap--watched .poster-grid__image,
    .poster-grid__image-wrap--watched .poster-grid__image--fallback {
      opacity: 0.4;
    }
    ```
    Notes:
    - `opacity: 0.4` — visually distinct but poster is still recognizable
    - Applied to `.poster-grid__image` (img) AND `.poster-grid__image--fallback` (div) — handles both cases
    - The title text below the poster (`.poster-grid__title`) is intentionally NOT dimmed — keeps the title readable
    - No CSS transition on opacity change (UX-DR10)

- [x] 5. Update `apps/frontend/src/app/home/home.component.spec.ts`
  - [x] 5.1 Update imports to include new exported interfaces:
    ```typescript
    import {
      HomeComponent,
      WATCH_PROGRESS_KEY,
      WatchProgressEntry,
      ContinueWatchingItem,
    } from "./home.component";
    ```
  - [x] 5.2 Add helper to build a WatchProgressRecord for test data:

    ```typescript
    function makeMovieProgress(
      mediaFilesId: number,
      title: string,
      position: number,
      duration: number,
      watched = false,
      posterUrl: string | null = null,
    ): Record<string, WatchProgressEntry> {
      return {
        [`movie:${mediaFilesId}`]: {
          position,
          duration,
          watched,
          updatedAt: Date.now(),
          mediaType: "movie",
          id: mediaFilesId,
          title,
          posterUrl,
          year: 2024,
          fileId: mediaFilesId,
        },
      };
    }

    function makeTvProgress(
      tmdbId: number,
      fileId: number,
      title: string,
      position: number,
      duration: number,
      watched = false,
    ): Record<string, WatchProgressEntry> {
      return {
        [`tv:${tmdbId}:${fileId}`]: {
          position,
          duration,
          watched,
          updatedAt: Date.now(),
          mediaType: "tv",
          id: tmdbId,
          title,
          posterUrl: null,
          year: 2024,
          fileId,
        },
      };
    }
    ```

  - [x] 5.3 The existing test `'should show Continue Watching section hidden even when localStorage has progress key'`
        stores `{ 'movie:1': { position: 100 } }` which is an INCOMPLETE entry (missing `duration`, `id`, `fileId`).
        The new validation guard in `readContinueWatchingFromStorage()` will reject this entry, so the section stays
        hidden — the test **continues to pass** without modification. No change needed to that test.
        ADD two new tests that verify the REAL 4-5 behavior:

    ```typescript
    it("should show Continue Watching section when localStorage has valid in-progress entry", async () => {
      localStorage.setItem(
        WATCH_PROGRESS_KEY,
        JSON.stringify(makeMovieProgress(1, "Test Movie", 600, 3600, false)),
      );

      await TestBed.configureTestingModule({
        imports: [HomeComponent],
        providers: [
          { provide: LibraryService, useValue: mockLibraryService },
          provideRouter([]),
        ],
      }).compileComponents();

      const fixture = TestBed.createComponent(HomeComponent);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      const sections = Array.from(el.querySelectorAll("h2"));
      const header = sections.find((h) =>
        h.textContent?.includes("Continue Watching"),
      );
      expect(header).toBeTruthy();
    });

    it("should hide Continue Watching section when all localStorage entries are watched", async () => {
      localStorage.setItem(
        WATCH_PROGRESS_KEY,
        JSON.stringify(makeMovieProgress(1, "Test Movie", 3400, 3600, true)), // watched: true
      );

      await TestBed.configureTestingModule({
        imports: [HomeComponent],
        providers: [
          { provide: LibraryService, useValue: mockLibraryService },
          provideRouter([]),
        ],
      }).compileComponents();

      const fixture = TestBed.createComponent(HomeComponent);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      const sections = Array.from(el.querySelectorAll("h2"));
      const header = sections.find((h) =>
        h.textContent?.includes("Continue Watching"),
      );
      expect(header).toBeFalsy();
    });
    ```

  - [x] 5.4 Test: Continue Watching items link to `/play/:fileId` (not `/movie/:id` or `/show/:id`):

    ```typescript
    it("should link Continue Watching movie items to /play/:fileId", async () => {
      localStorage.setItem(
        WATCH_PROGRESS_KEY,
        JSON.stringify(makeMovieProgress(42, "The Matrix", 1200, 8400, false)),
      );

      await TestBed.configureTestingModule({
        imports: [HomeComponent],
        providers: [
          { provide: LibraryService, useValue: mockLibraryService },
          provideRouter([]),
        ],
      }).compileComponents();

      const fixture = TestBed.createComponent(HomeComponent);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      const sections = el.querySelectorAll("section.library-section");
      let cwSection: Element | null = null;
      sections.forEach((s) => {
        if (s.querySelector("h2")?.textContent?.includes("Continue Watching"))
          cwSection = s;
      });
      const anchor = cwSection!.querySelector(
        "a.poster-grid__item",
      ) as HTMLAnchorElement;
      expect(anchor.getAttribute("href")).toContain("/play/42");
    });

    it("should link Continue Watching TV show items to /play/:lastEpisodeFileId", async () => {
      localStorage.setItem(
        WATCH_PROGRESS_KEY,
        JSON.stringify(
          makeTvProgress(1399, 77, "Game of Thrones", 1200, 3600, false),
        ),
      );

      await TestBed.configureTestingModule({
        imports: [HomeComponent],
        providers: [
          { provide: LibraryService, useValue: mockLibraryService },
          provideRouter([]),
        ],
      }).compileComponents();

      const fixture = TestBed.createComponent(HomeComponent);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      const sections = el.querySelectorAll("section.library-section");
      let cwSection: Element | null = null;
      sections.forEach((s) => {
        if (s.querySelector("h2")?.textContent?.includes("Continue Watching"))
          cwSection = s;
      });
      const anchor = cwSection!.querySelector(
        "a.poster-grid__item",
      ) as HTMLAnchorElement;
      // fileId in the TV entry is 77
      expect(anchor.getAttribute("href")).toContain("/play/77");
    });
    ```

  - [x] 5.5 Test: progress bar renders in Library section for partially watched movie:

    ```typescript
    it("should render progress bar on partially watched movie in Library section", async () => {
      localStorage.setItem(
        WATCH_PROGRESS_KEY,
        JSON.stringify(makeMovieProgress(1, "Alien", 1800, 7200, false)), // 25% progress
      );
      (
        mockLibraryService.getMovies as ReturnType<typeof vi.fn>
      ).mockReturnValue(of([makeMovieItem(1, "Alien", null)]));
      (mockLibraryService.getShows as ReturnType<typeof vi.fn>).mockReturnValue(
        of([]),
      );

      await TestBed.configureTestingModule({
        imports: [HomeComponent],
        providers: [
          { provide: LibraryService, useValue: mockLibraryService },
          provideRouter([]),
        ],
      }).compileComponents();

      const fixture = TestBed.createComponent(HomeComponent);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      const sections = el.querySelectorAll("section.library-section");
      let librarySection: Element | null = null;
      sections.forEach((s) => {
        if (s.querySelector("h2")?.textContent?.includes("Library"))
          librarySection = s;
      });
      const progressBar = librarySection!.querySelector(
        ".poster-grid__progress",
      ) as HTMLElement;
      expect(progressBar).toBeTruthy();
      expect(progressBar.style.width).toBe("25%");
    });
    ```

  - [x] 5.6 Test: no progress bar for fully watched (watched=true) movie in Library:

    ```typescript
    it("should not render progress bar for watched movie in Library section", async () => {
      localStorage.setItem(
        WATCH_PROGRESS_KEY,
        JSON.stringify(makeMovieProgress(1, "Alien", 7100, 7200, true)), // watched: true
      );
      (
        mockLibraryService.getMovies as ReturnType<typeof vi.fn>
      ).mockReturnValue(of([makeMovieItem(1, "Alien", null)]));
      (mockLibraryService.getShows as ReturnType<typeof vi.fn>).mockReturnValue(
        of([]),
      );

      await TestBed.configureTestingModule({
        imports: [HomeComponent],
        providers: [
          { provide: LibraryService, useValue: mockLibraryService },
          provideRouter([]),
        ],
      }).compileComponents();

      const fixture = TestBed.createComponent(HomeComponent);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      const sections = el.querySelectorAll("section.library-section");
      let librarySection: Element | null = null;
      sections.forEach((s) => {
        if (s.querySelector("h2")?.textContent?.includes("Library"))
          librarySection = s;
      });
      // No progress bar for watched titles
      expect(
        librarySection!.querySelector(".poster-grid__progress"),
      ).toBeFalsy();
      // But dimmed class IS applied
      expect(
        librarySection!.querySelector(".poster-grid__image-wrap--watched"),
      ).toBeTruthy();
    });
    ```

  - [x] 5.7 Test: watched movie gets dimmed class in Library:
        Already covered by 5.6 above — the `expect(...--watched)` assertion proves dimming.

  - [x] 5.8 Test: no dimmed class for non-watched movie:

    ```typescript
    it("should not apply dimmed class to item with no localStorage entry", async () => {
      localStorage.clear(); // no progress at all
      (
        mockLibraryService.getMovies as ReturnType<typeof vi.fn>
      ).mockReturnValue(of([makeMovieItem(1, "Alien", null)]));
      (mockLibraryService.getShows as ReturnType<typeof vi.fn>).mockReturnValue(
        of([]),
      );

      await TestBed.configureTestingModule({
        imports: [HomeComponent],
        providers: [
          { provide: LibraryService, useValue: mockLibraryService },
          provideRouter([]),
        ],
      }).compileComponents();

      const fixture = TestBed.createComponent(HomeComponent);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      const sections = el.querySelectorAll("section.library-section");
      let librarySection: Element | null = null;
      sections.forEach((s) => {
        if (s.querySelector("h2")?.textContent?.includes("Library"))
          librarySection = s;
      });
      expect(
        librarySection!.querySelector(".poster-grid__image-wrap--watched"),
      ).toBeFalsy();
      expect(
        librarySection!.querySelector(".poster-grid__progress"),
      ).toBeFalsy();
    });
    ```

  - [x] 5.9 Test: most recent TV episode entry determines the show's Continue Watching slot:

    ```typescript
    it("should use most recent episode for TV show Continue Watching entry", async () => {
      const now = Date.now();
      const record: Record<string, WatchProgressEntry> = {
        // Older episode (ep 1) — less recent
        "tv:1399:10": {
          position: 3600,
          duration: 3600,
          watched: true,
          updatedAt: now - 10000,
          mediaType: "tv",
          id: 1399,
          title: "Game of Thrones",
          posterUrl: null,
          year: 2011,
          fileId: 10,
        },
        // Newer episode (ep 2) — partially watched
        "tv:1399:20": {
          position: 600,
          duration: 3600,
          watched: false,
          updatedAt: now,
          mediaType: "tv",
          id: 1399,
          title: "Game of Thrones",
          posterUrl: null,
          year: 2011,
          fileId: 20,
        },
      };
      localStorage.setItem(WATCH_PROGRESS_KEY, JSON.stringify(record));

      await TestBed.configureTestingModule({
        imports: [HomeComponent],
        providers: [
          { provide: LibraryService, useValue: mockLibraryService },
          provideRouter([]),
        ],
      }).compileComponents();

      const fixture = TestBed.createComponent(HomeComponent);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;

      // Continue Watching should show (most recent entry is not watched)
      const sections = Array.from(el.querySelectorAll("h2"));
      const header = sections.find((h) =>
        h.textContent?.includes("Continue Watching"),
      );
      expect(header).toBeTruthy();

      // Link should go to /play/20 (fileId of most recent episode)
      const cwSection = Array.from(
        el.querySelectorAll("section.library-section"),
      ).find((s) =>
        s.querySelector("h2")?.textContent?.includes("Continue Watching"),
      );
      const anchor = cwSection!.querySelector(
        "a.poster-grid__item",
      ) as HTMLAnchorElement;
      expect(anchor.getAttribute("href")).toContain("/play/20");
    });
    ```

  - [x] 5.10 Test: invalid/malformed localStorage entries are ignored without throwing:

    ```typescript
    it("should ignore malformed localStorage entries and not throw", () => {
      localStorage.setItem(WATCH_PROGRESS_KEY, "{ invalid json }");
      expect(() => TestBed.createComponent(HomeComponent)).not.toThrow();
    });

    it("should ignore entries missing required fields", () => {
      localStorage.setItem(
        WATCH_PROGRESS_KEY,
        JSON.stringify({ "movie:1": { position: 100 } }), // missing duration, id, fileId
      );
      const fixture = TestBed.createComponent(HomeComponent);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      const sections = Array.from(el.querySelectorAll("h2"));
      const header = sections.find((h) =>
        h.textContent?.includes("Continue Watching"),
      );
      expect(header).toBeFalsy(); // invalid entries → nothing shown
    });
    ```

### Review Findings

- [x] [Review][Patch] Reject malformed progress entries that omit `updatedAt`, `watched`, or `mediaType` before grouping and sorting [apps/frontend/src/app/home/home.component.ts:121]
- [x] [Review][Defer] Playback route is still undefined for new Continue Watching links [apps/frontend/src/app/app.routes.ts:1] — deferred, pre-existing

## Dev Notes

### localStorage Schema — The Forward Contract with Story 6-1

This story defines the read schema. Story 6-1 MUST write in this exact format:

```
Key:   "movie:{media_files_id}"     → WatchProgressEntry (mediaType: 'movie', id = media_files_id, fileId = media_files_id)
Key:   "tv:{tmdb_id}:{file_id}"     → WatchProgressEntry (mediaType: 'tv', id = tmdb_id, fileId = episode file_id)
```

The `id` field in the entry is used for **display matching** — finding the right grid item by `LibraryItem.id`. This means:

- Movies: `entry.id` = `MovieListItem.id` = `media_files.id` (from `mf.id AS id` in backend `getMovies()` SQL)
- TV shows: `entry.id` = `ShowListItem.id` = `tmdb_id` (from `m.tmdb_id AS id` in backend `getShows()` SQL)

The `fileId` field is used for **routing** — the `/play/:fileId` link. Always = `media_files.id` regardless of media type.

### ID Semantics — Three Different ID Types (inherited from 4-4)

| Field                       | Type              | Value                                                  |
| --------------------------- | ----------------- | ------------------------------------------------------ |
| `MovieListItem.id`          | `media_files.id`  | Movie entry in DB; used for `/movie/:id` route         |
| `ShowListItem.id`           | `tmdb_id`         | TMDB show identifier; used for `/show/:id` route       |
| `EpisodeItem.file_id`       | `media_files.id`  | Specific episode file; used for `/play/:file_id` route |
| `WatchProgressEntry.id`     | same as list item | Points to the matching LibraryItem in the grid         |
| `WatchProgressEntry.fileId` | `media_files.id`  | Always a media_files.id; used for play route           |

Do NOT conflate these. The distinction is critical for correct progress bar matching and routing.

### Continue Watching — Routing Behavior Change

The Continue Watching section routing **changes** from story 4-2:

- **4-2 (stub)**: `[routerLink]="item.mediaType === 'movie' ? ['/movie', item.id] : ['/show', item.id]"`
- **4-5 (this story)**: `[routerLink]="['/play', item.playFileId]"` for ALL Continue Watching items

This is a deliberate UX decision: clicking Continue Watching should resume playback directly, not go to a detail page. The `/play` route does not exist yet (Epic 5, story 5-2) — this is intentional, same pattern as episode Play links in show-detail (which already route to `/play/:file_id` even though it's not yet implemented).

### Progress Bar CSS Implementation

The progress bar is absolutely positioned inside `.poster-grid__image-wrap`. The wrapper already has `overflow: hidden` (preventing any overflow) and is getting `position: relative` added in this story. The width is set inline via `[style.width.%]="progressPercent"`.

**Why not a CSS-custom-property approach?** Angular's inline style binding (`[style.width.%]`) is the standard pattern for dynamic widths. No `<style>` tag injection needed.

**The `--color-progress` token** resolves to `var(--color-accent)` = `#e65100` — defined in `variables.css`. Already correct for "deep orange" per UX-DR5.

### Angular @let Template Block

`@let progress = getProgressPercent(item);` is Angular 17+ template let syntax. It's used in show-detail (established in 4-4 review fix) and is the correct way to avoid calling the same method twice in a template block. Available in Angular 21.x. Import nothing extra — it's core template syntax.

### OnPush Change Detection — Why `signal()` Works

`buildProgressData()` and `readContinueWatchingFromStorage()` run synchronously at component construction. They read localStorage once and return results. The `signal()` wrapping provides:

- Access via `this.progressData()` in template methods (triggers OnPush re-evaluation when signal changes)
- Type safety

Since localStorage is not reactive (no event listener), the signals are initialized once and never updated during the component's lifecycle. This is the spec-correct behavior: "progress data is read from localStorage **on page load**."

### Method Calls in OnPush Templates

`getProgressPercent(item)` and `isWatched(item)` are called in the template. With `ChangeDetectionStrategy.OnPush`, these are only re-evaluated when Angular triggers change detection (input changes, signal updates, events). Since `progressData` is a signal read inside these methods, Angular automatically tracks the dependency. This is correct and performant.

### UX Constraints — Zero-Animation Policy (UX-DR10)

**No `:hover`, `transition`, or `animation` CSS rules in `home.component.css`.** This includes:

- No opacity transition on `.poster-grid__image-wrap--watched`
- No width transition on `.poster-grid__progress`
- No hover brightening on poster images

The progress bar appears immediately, the dimming is static. UX-DR10 is absolute.

### Deferred Work Item Resolution

From `deferred-work.md` (4-2 code review):

- "`continueWatchingItems` signal not reactive to future localStorage writes — intentional stub; story 4-5 implements this." → **RESOLVED in this story**.

### Files to UPDATE (not recreate)

- **`home.component.ts`**: Add interfaces, update `readContinueWatchingFromStorage()`, add `buildProgressData()`, add `getProgressPercent()`, add `isWatched()`, change `continueWatchingItems` type. Do NOT modify `recentItems`, `allItems`, `showContinueWatching`.
- **`home.component.html`**: Update all three `@for` blocks inside `<div class="poster-grid">`. Do NOT modify section structure, headers, or anything outside the `@for` blocks.
- **`home.component.css`**: Add `position: relative` to `.poster-grid__image-wrap`, add two new rule sets. Do NOT modify existing rules.
- **`home.component.spec.ts`**: Replace one existing test (the stub test), add new tests. Do NOT modify other existing tests — they must continue to pass.

### Test Count Expectation

Existing tests: 9 (from story 4-2 implementation). After this story: the stub test `'should show Continue Watching section hidden even when localStorage has progress key'` is REPLACED by two new tests (hidden when watched, shown when in-progress). Add ~8 new tests. Total after: ~17 tests.

### Previous Story Learnings (from 4-3 and 4-4)

- **`@let` in templates** — Use `@let dur = formatFoo(x);` to avoid calling the same template method twice. Applied here: `@let progress = getProgressPercent(item);`
- **`location.back()` for back button** — Not relevant for this story (no new navigation buttons added).
- **snapshot.paramMap pattern** — Not relevant for this story (no route params).
- **OnPush + signals** — All component state uses signals. Template methods that read signals (`this.progressData()`) are tracked automatically by Angular's signal dependency system.
- **Standalone + inject()** — Continue using `inject()` pattern; no constructor injection.
- **Testing with vitest** — Use `vi.fn()`, NOT `jest.fn()`. Import `vi` from `'vitest'`. Use `provideRouter([])` in all test modules.
- **`localStorage.clear()` in `beforeEach`** — Already present in the spec file; ensure new tests also start clean (they use `localStorage.setItem` per-test, which is fine since `beforeEach` calls `localStorage.clear()`).

### CSS Design Tokens Used

From `apps/frontend/src/styles/variables.css`:

- `--color-progress: var(--color-accent)` → resolves to `#e65100` (deep orange) — progress bar color
- `--poster-ratio: 2 / 3` — unchanged, already on `.poster-grid__image-wrap`
- `--color-surface: #2a2a2a` — unchanged, background of image-wrap

### File Structure — Only home/ Files Change

```
apps/frontend/src/app/
  home/
    home.component.ts       ← UPDATE: add interfaces, update localStorage logic, add helpers
    home.component.html     ← UPDATE: add progress bars and dimming to all three @for blocks
    home.component.css      ← UPDATE: add position:relative, progress bar CSS, watched dimming CSS
    home.component.spec.ts  ← UPDATE: replace stub test, add 8+ new tests
```

No other files change. No route changes. No `library.service.ts` changes. No backend changes.

### Testing Framework

Frontend uses **vitest** (`vitest: ^4.0.8`) with Angular testing utilities. Import `vi` from `'vitest'` (not Jest). Test file structure follows `home.component.spec.ts` exactly — maintain the shared `beforeEach` with `localStorage.clear()`.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

None

### Completion Notes List

- Exported `WatchProgressEntry`, `WatchProgressRecord`, and `ContinueWatchingItem` interfaces from `home.component.ts`
- Implemented `buildProgressData()` — reads localStorage, validates entries, aggregates TV episodes to show-level by most-recent `updatedAt`
- Updated `readContinueWatchingFromStorage()` — filters out watched/zero-progress entries, sorts by recency, maps to `ContinueWatchingItem`
- Added `getProgressPercent()` and `isWatched()` public methods for template binding
- Changed `continueWatchingItems` signal type to `ContinueWatchingItem[]`
- Updated template: Continue Watching links to `/play/:playFileId`, progress bars on all sections, dimmed class on watched items
- Added CSS: `position: relative` on image-wrap, `.poster-grid__progress` (3px deep orange bar), `.poster-grid__image-wrap--watched` (opacity 0.4 dimming)
- 10 new tests added (19 total home component tests), all 49 frontend tests pass

### File List

- apps/frontend/src/app/home/home.component.ts (MODIFIED)
- apps/frontend/src/app/home/home.component.html (MODIFIED)
- apps/frontend/src/app/home/home.component.css (MODIFIED)
- apps/frontend/src/app/home/home.component.spec.ts (MODIFIED)

## Change Log

| Date       | Change                                                                                                                                                                           |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-03 | Story created — ready-for-dev                                                                                                                                                    |
| 2026-05-04 | Implemented watch progress indicators: localStorage interfaces, progress data methods, template progress bars and dimming, CSS styles, 10 new tests. All 49 frontend tests pass. |
