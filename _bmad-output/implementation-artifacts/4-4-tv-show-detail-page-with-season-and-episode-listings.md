# Story 4.4: TV Show Detail Page with Season and Episode Listings

Status: review

## Story

As a viewer,
I want to click a TV show poster and browse all episodes grouped by season,
so that I can find and play specific episodes.

## Acceptance Criteria

```gherkin
Given the viewer clicks a TV show poster on the grid
When the browser navigates to /show/:id
Then the detail page shows: show poster, title, year, rating, and description
And all episodes are listed on the page, grouped by season
And seasons are ordered latest first (most recent season at the top)
And each episode displays: episode number, title, and duration
And each episode has a Play link/button
And standard page navigation patterns are used — back button works, URLs are bookmarkable (UX-DR12)
And the page uses semantic HTML and consistent styling with the movie detail page
```

## Tasks / Subtasks

- [x] 1. Add `ShowDetail` interfaces and `getShowById()` to `apps/frontend/src/app/services/library.service.ts` (AC: data shape)
  - [x] 1.1 Add `EpisodeItem` interface after existing `SubtitleTrack` interface:
    ```typescript
    export interface EpisodeItem {
      episode_number: number;
      name: string | null;
      duration: number | null;   // seconds (float) from probe_data.format.duration; may be 0 (sentinel for unknown)
      file_id: number;           // media_files.id — used for Play route
      tier: number | null;
    }
    ```
  - [x] 1.2 Add `SeasonInfo` interface:
    ```typescript
    export interface SeasonInfo {
      season_number: number;
      episodes: EpisodeItem[];
    }
    ```
  - [x] 1.3 Add `ShowDetail` interface:
    ```typescript
    export interface ShowDetail {
      id: number;                // tmdb_id — NOT media_files.id
      title: string;
      description: string | null;
      year: number | null;
      poster_url: string | null;
      rating: number | null;
      seasons: SeasonInfo[];     // ordered latest-first (DESC season_number) by backend SQL
    }
    ```
  - [x] 1.4 Add `getShowById(id: number): Observable<ShowDetail>` method to `LibraryService` class:
    ```typescript
    getShowById(id: number): Observable<ShowDetail> {
      return this.http.get<ShowDetail>(`/api/library/shows/${id}`);
    }
    ```
    Note: `id` here is `tmdb_id`. The backend `GET /api/library/shows/:id` uses `ParseIntPipe` and passes directly to `getShowById(tmdbId)`. Do NOT confuse with `media_files.id`.

- [x] 2. Register `/show/:id` route in `apps/frontend/src/app/app.routes.ts` (AC: bookmarkable URL)
  - [x] 2.1 Add lazy-loaded show-detail route after the existing `movie/:id` route:
    ```typescript
    {
      path: 'show/:id',
      loadComponent: () =>
        import('./show-detail/show-detail.component').then(m => m.ShowDetailComponent),
    },
    ```
    This resolves the deferred-work item "Missing `/show/:id` route handlers" from 4-2 code review.
    Full routes array after update:
    ```typescript
    export const routes: Routes = [
      {
        path: '',
        loadComponent: () => import('./home/home.component').then(m => m.HomeComponent),
      },
      {
        path: 'movie/:id',
        loadComponent: () =>
          import('./movie-detail/movie-detail.component').then(m => m.MovieDetailComponent),
      },
      {
        path: 'show/:id',
        loadComponent: () =>
          import('./show-detail/show-detail.component').then(m => m.ShowDetailComponent),
      },
    ];
    ```

- [x] 3. Create `apps/frontend/src/app/show-detail/show-detail.component.ts` (AC: all rendering logic)
  - [x] 3.1 Define `@Component` decorator — standalone, OnPush, imports RouterLink:
    ```typescript
    @Component({
      selector: 'app-show-detail',
      standalone: true,
      imports: [RouterLink],
      templateUrl: './show-detail.component.html',
      styleUrl: './show-detail.component.css',
      changeDetection: ChangeDetectionStrategy.OnPush,
    })
    ```
  - [x] 3.2 Inject services:
    ```typescript
    private readonly libraryService = inject(LibraryService);
    readonly location = inject(Location);
    ```
  - [x] 3.3 Derive `showId` from route snapshot (same synchronous pattern as movie-detail — avoids the "not found" flash):
    ```typescript
    private readonly showId = Number(inject(ActivatedRoute).snapshot.paramMap.get('id'));
    ```
  - [x] 3.4 Define `show` signal using `toSignal` + fetch-on-init:
    ```typescript
    readonly show = toSignal(
      this.showId && !isNaN(this.showId)
        ? this.libraryService.getShowById(this.showId).pipe(
            catchError(() => of(null))
          )
        : of(null as ShowDetail | null),
      { initialValue: null as ShowDetail | null }
    );
    ```
  - [x] 3.5 Add `formatRating(rating: number | null): string` helper (same as movie-detail):
    ```typescript
    formatRating(rating: number | null): string {
      if (rating === null || rating === undefined) return '';
      return rating.toFixed(1);
    }
    ```
  - [x] 3.6 Add `formatDuration(seconds: number | null): string` helper:
    ```typescript
    formatDuration(seconds: number | null): string {
      if (!seconds || seconds <= 0) return '';
      const totalMinutes = Math.round(seconds / 60);
      const h = Math.floor(totalMinutes / 60);
      const m = totalMinutes % 60;
      return h > 0 ? `${h}h ${m}m` : `${m}m`;
    }
    ```
    Critical: Duration from backend is **seconds** (float from `probe_data.format.duration`), NOT minutes like movie runtime. A 42-minute episode is ~2520 seconds. Backend may return `0` as a sentinel for unknown duration (pre-existing ProbeService behavior) — the `<= 0` guard handles this.
  - [x] 3.7 Full import list:
    ```typescript
    import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
    import { RouterLink, ActivatedRoute } from '@angular/router';
    import { Location } from '@angular/common';
    import { toSignal } from '@angular/core/rxjs-interop';
    import { catchError } from 'rxjs/operators';
    import { of } from 'rxjs';
    import { LibraryService, ShowDetail } from '../services/library.service';
    ```

- [x] 4. Create `apps/frontend/src/app/show-detail/show-detail.component.html` (AC: layout, episodes, UX-DR12)
  - [x] 4.1 Implement the detail page — top section mirrors movie-detail, bottom section lists episodes by season:
    ```html
    <main class="content-container">
      <button type="button" class="back-link" (click)="location.back()">← Back to Library</button>

      @if (show(); as s) {
        <div class="detail-layout">
          <div class="detail-poster-wrap">
            @if (s.poster_url) {
              <img class="detail-poster"
                   [src]="s.poster_url"
                   [alt]="s.title"
                   loading="lazy" />
            } @else {
              <div class="detail-poster detail-poster--fallback"></div>
            }
          </div>

          <div class="detail-info">
            <h1 class="detail-title">{{ s.title }}</h1>

            <p class="detail-meta">
              @if (s.year) { <span>{{ s.year }}</span> }
              @if (s.year && s.rating) { <span aria-hidden="true"> · </span> }
              @if (s.rating) { <span>★ {{ formatRating(s.rating) }}</span> }
            </p>

            @if (s.description) {
              <p class="detail-description">{{ s.description }}</p>
            }
          </div>
        </div>

        <div class="seasons-list">
          @for (season of s.seasons; track season.season_number) {
            <section class="season">
              <h2 class="season__header">Season {{ season.season_number }}</h2>
              <ol class="episode-list">
                @for (ep of season.episodes; track ep.file_id) {
                  <li class="episode">
                    <span class="episode__number">{{ ep.episode_number }}.</span>
                    <span class="episode__title">{{ ep.name ?? 'Episode ' + ep.episode_number }}</span>
                    @if (formatDuration(ep.duration)) {
                      <span class="episode__duration">{{ formatDuration(ep.duration) }}</span>
                    }
                    <a class="episode__play" [routerLink]="['/play', ep.file_id]">Play</a>
                  </li>
                }
              </ol>
            </section>
          }
        </div>
      } @else {
        <p class="detail-not-found">Show not found.</p>
      }
    </main>
    ```
    Notes:
    - `content-container` is the global class from `layout.css` (max-width 1400px + padding) — same as movie-detail and home.
    - Seasons are already ordered latest-first by backend SQL (`ORDER BY te.season_number DESC`) — no client-side re-sort needed.
    - Episodes within a season are ordered by `episode_number ASC` from backend SQL.
    - `ep.name ?? 'Episode ' + ep.episode_number` fallback for episodes with no TMDB episode name.
    - Play link routes to `/play/:file_id` where `file_id` is `media_files.id` for that specific episode file. The `/play` route does not exist yet (Epic 5, story 5-2) — intentional, same as movie Play button.
    - Back button uses `location.back()` (not `routerLink="/"`) to restore scroll position (UX-DR12), same as movie-detail review fix.
    - No separate Play button for the whole show — each episode has its own Play link.
    - `@for ... track ep.file_id` — `file_id` is a stable unique key per episode (media_files.id).
    - No `@if (season.episodes.length > 0)` guard needed — backend never returns seasons with empty episodes arrays (episodes drive season grouping).

- [x] 5. Create `apps/frontend/src/app/show-detail/show-detail.component.css` (AC: UX-DR10, UX-DR11, consistency with movie-detail)
  - [x] 5.1 Implement component-scoped styles:
    ```css
    /* Back navigation button — matches movie-detail pattern */
    .back-link {
      display: inline-block;
      margin-block-end: var(--space-lg);
      color: var(--color-text-muted);
      text-decoration: none;
      font-size: var(--font-size-sm);
      padding-block: var(--space-sm);
      background: none;
      border: none;
      cursor: pointer;
      padding-inline: 0;
    }

    /* Two-column layout: poster left, info right — matches movie-detail */
    .detail-layout {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: var(--space-xl);
      align-items: start;
    }

    /* Fixed-width poster container with 2:3 aspect ratio */
    .detail-poster-wrap {
      width: 300px;
      aspect-ratio: var(--poster-ratio);
      background-color: var(--color-surface);
    }

    .detail-poster {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .detail-poster--fallback {
      width: 100%;
      height: 100%;
      background-color: var(--color-surface-raised);
    }

    /* Title — --font-size-xl per UX-DR4 */
    .detail-title {
      font-size: var(--font-size-xl);
      font-weight: var(--font-weight-bold);
      line-height: var(--line-height-tight);
      margin-block-end: var(--space-sm);
    }

    /* Year · rating in muted text per UX-DR4 */
    .detail-meta {
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
      margin-block-end: var(--space-md);
    }

    /* Description in base font size per UX-DR4 */
    .detail-description {
      font-size: var(--font-size-base);
      line-height: var(--line-height-base);
      color: var(--color-text);
      max-width: 65ch;
    }

    /* Seasons container — sits below the poster/info two-column layout */
    .seasons-list {
      margin-block-start: var(--space-xl);
    }

    /* Season section */
    .season {
      margin-block-end: var(--space-xl);
    }

    .season__header {
      font-size: var(--font-size-lg);
      font-weight: var(--font-weight-bold);
      margin-block-end: var(--space-md);
      color: var(--color-text);
    }

    /* Episode ordered list — reset default OL styling */
    .episode-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    /* Each episode row */
    .episode {
      display: flex;
      align-items: baseline;
      gap: var(--space-sm);
      padding-block: var(--space-sm);
      border-block-end: 1px solid var(--color-surface-raised);
      min-height: 44px; /* WCAG touch target (UX-DR11) */
    }

    .episode__number {
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
      min-width: 2ch;
      flex-shrink: 0;
    }

    .episode__title {
      flex: 1;
      font-size: var(--font-size-base);
      color: var(--color-text);
    }

    .episode__duration {
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
      flex-shrink: 0;
    }

    /* Episode Play link — accent color, min touch target */
    .episode__play {
      color: var(--color-accent);
      text-decoration: none;
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      padding: var(--space-xs) var(--space-sm);
      min-width: 44px;
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    /* Not-found message */
    .detail-not-found {
      color: var(--color-text-muted);
      margin-block-start: var(--space-xl);
    }

    /* Responsive: stack poster and info on narrow viewports */
    @media (max-width: 600px) {
      .detail-layout {
        grid-template-columns: 1fr;
      }

      .detail-poster-wrap {
        width: 100%;
        max-width: 300px;
      }
    }
    ```
    Critical: **No hover effects, no transitions, no animations** (UX-DR10). No `:hover`, `transition`, or `animation` rules anywhere in this file.

- [x] 6. Create `apps/frontend/src/app/show-detail/show-detail.component.spec.ts` (AC: unit tests)
  - [x] 6.1 Set up TestBed with mocked LibraryService and ActivatedRoute stub:
    ```typescript
    import { TestBed } from '@angular/core/testing';
    import { provideHttpClient } from '@angular/common/http';
    import { provideHttpClientTesting } from '@angular/common/http/testing';
    import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
    import { of } from 'rxjs';
    import { vi } from 'vitest';
    import { ShowDetailComponent } from './show-detail.component';
    import { LibraryService, ShowDetail } from '../services/library.service';

    const MOCK_SHOW: ShowDetail = {
      id: 1399,
      title: 'Game of Thrones',
      description: 'Seven noble families fight for control of the mythical land of Westeros.',
      year: 2011,
      poster_url: 'https://image.tmdb.org/t/p/w500/poster.jpg',
      rating: 9.2,
      seasons: [
        {
          season_number: 2,
          episodes: [
            { episode_number: 1, name: 'The North Remembers', duration: 3180, file_id: 20, tier: 1 },
            { episode_number: 2, name: 'The Night Lands', duration: 3120, file_id: 21, tier: 1 },
          ],
        },
        {
          season_number: 1,
          episodes: [
            { episode_number: 1, name: 'Winter Is Coming', duration: 3660, file_id: 10, tier: 1 },
          ],
        },
      ],
    };

    function makeActivatedRouteStub(id: string) {
      const paramMap = convertToParamMap({ id });
      return {
        snapshot: { paramMap },
        paramMap: of(paramMap),
      };
    }
    ```
  - [x] 6.2 Write standard component tests:
    ```typescript
    describe('ShowDetailComponent', () => {
      let mockLibraryService: Pick<LibraryService, 'getShowById'>;

      beforeEach(async () => {
        mockLibraryService = {
          getShowById: vi.fn().mockReturnValue(of(MOCK_SHOW)),
        };

        await TestBed.configureTestingModule({
          imports: [ShowDetailComponent],
          providers: [
            provideHttpClient(),
            provideHttpClientTesting(),
            provideRouter([]),
            { provide: ActivatedRoute, useValue: makeActivatedRouteStub('1399') },
            { provide: LibraryService, useValue: mockLibraryService },
          ],
        }).compileComponents();
      });

      it('should create the component', () => {
        const fixture = TestBed.createComponent(ShowDetailComponent);
        expect(fixture.componentInstance).toBeTruthy();
      });

      it('should call getShowById with the route id', async () => {
        const fixture = TestBed.createComponent(ShowDetailComponent);
        fixture.detectChanges();
        await fixture.whenStable();
        expect(mockLibraryService.getShowById).toHaveBeenCalledWith(1399);
      });

      it('should render show title when API returns data', async () => {
        const fixture = TestBed.createComponent(ShowDetailComponent);
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
        const el = fixture.nativeElement as HTMLElement;
        expect(el.querySelector('.detail-title')?.textContent?.trim()).toBe('Game of Thrones');
      });

      it('should render back link', () => {
        const fixture = TestBed.createComponent(ShowDetailComponent);
        fixture.detectChanges();
        const el = fixture.nativeElement as HTMLElement;
        expect(el.querySelector('.back-link')?.textContent?.trim()).toContain('Back to Library');
      });

      it('should render seasons in order provided (latest-first from backend)', async () => {
        const fixture = TestBed.createComponent(ShowDetailComponent);
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
        const el = fixture.nativeElement as HTMLElement;
        const headers = el.querySelectorAll('.season__header');
        expect(headers.length).toBe(2);
        expect(headers[0].textContent?.trim()).toBe('Season 2');
        expect(headers[1].textContent?.trim()).toBe('Season 1');
      });

      it('should render episodes within a season', async () => {
        const fixture = TestBed.createComponent(ShowDetailComponent);
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
        const el = fixture.nativeElement as HTMLElement;
        const episodes = el.querySelectorAll('.episode');
        expect(episodes.length).toBe(3); // 2 in season 2 + 1 in season 1
      });
    });
    ```
  - [x] 6.3 Test `formatDuration` helper:
    ```typescript
    describe('formatDuration', () => {
      it('should format seconds to Xh Ym for long episodes', () => {
        const comp = TestBed.createComponent(ShowDetailComponent).componentInstance;
        expect(comp.formatDuration(3661)).toBe('1h 1m');
      });

      it('should format seconds to Xm for episodes under an hour', () => {
        const comp = TestBed.createComponent(ShowDetailComponent).componentInstance;
        expect(comp.formatDuration(2520)).toBe('42m');
      });

      it('should return empty string for null duration', () => {
        const comp = TestBed.createComponent(ShowDetailComponent).componentInstance;
        expect(comp.formatDuration(null)).toBe('');
      });

      it('should return empty string for 0 duration (sentinel for unknown)', () => {
        const comp = TestBed.createComponent(ShowDetailComponent).componentInstance;
        expect(comp.formatDuration(0)).toBe('');
      });
    });
    ```
  - [x] 6.4 Test `formatRating` helper:
    ```typescript
    describe('formatRating', () => {
      it('should format to one decimal', () => {
        const comp = TestBed.createComponent(ShowDetailComponent).componentInstance;
        expect(comp.formatRating(9.2)).toBe('9.2');
        expect(comp.formatRating(7)).toBe('7.0');
        expect(comp.formatRating(null)).toBe('');
      });
    });
    ```

## Dev Notes

### CRITICAL: ID Semantics — Shows vs Movies

**`ShowListItem.id` = `tmdb_id`** (set by `m.tmdb_id AS id` in the `getShows()` query).
**`MovieListItem.id` = `media_files.id`**.

The home page routes: `[routerLink]="item.mediaType === 'tv' ? ['/show', item.id] : ['/movie', item.id]"`. When `mediaType === 'tv'`, the `id` passed in the URL is `tmdb_id`. The backend `getShowById(tmdbId)` uses this value directly in its SQL WHERE clause. The Angular `ParseIntPipe` on `@Param('id')` validates it's an integer.

**`EpisodeItem.file_id` = `media_files.id`** — used for the Play route `/play/:file_id`. This IS a `media_files.id`, not a `tmdb_id`. The value comes from `mf.id AS file_id` in the `getShowById()` episode query.

Do not conflate these three different ID types.

### Backend API Shape

`GET /api/library/shows/:id` (where `:id` is `tmdb_id`):
- Controller: `apps/backend/src/library/browse.controller.ts` — `BrowseController.getShow()`
- Service: `apps/backend/src/library/browse.service.ts` — `BrowseService.getShowById(tmdbId: number)`
- Returns HTTP 404 with `NotFoundException` if show not found (frontend `catchError(() => of(null))` handles this)

Returns `ShowDetail`:
```typescript
{
  id: number;                // tmdb_id
  title: string;
  description: string | null;
  year: number | null;
  poster_url: string | null; // Full URL — already has TMDB base prepended
  rating: number | null;     // 0-10 float from TMDB vote_average
  seasons: {
    season_number: number;   // Ordered DESC (latest first) from SQL ORDER BY
    episodes: {
      episode_number: number;
      name: string | null;   // From tv_episodes.name — may be null
      duration: number | null; // SECONDS (float) from probe_data.format.duration; 0 = unknown sentinel
      file_id: number;       // media_files.id for this specific episode file
      tier: number | null;
    }[];                     // Episodes ordered ASC by episode_number
  }[];
}
```

Key SQL: `ORDER BY te.season_number DESC, te.episode_number ASC` — seasons newest-first, episodes within each season oldest-first.

### Duration Units — Critical

The movie-detail component has `formatRuntime(minutes)` because the movie `runtime` field is in **minutes** (from TMDB's `runtime` column).

This component needs `formatDuration(seconds)` because `EpisodeItem.duration` comes from `getDuration()` which reads `probe_data.format.duration` — FFprobe reports duration in **seconds** (float). A 42-minute episode = ~2520 seconds.

The pre-existing `getDuration()` deferred bug: ProbeService stores `0` instead of `null` for unknown-duration files. Guard: `if (!seconds || seconds <= 0) return ''`.

### Pattern: snapshot.paramMap (Not toObservable+switchMap)

Story 4-3 review found that using `toSignal(toObservable(id).pipe(switchMap(...)))` caused a brief "Movie not found." flash on every valid navigation because the signal starts `null` before the first fetch completes.

**Fix established in 4-3 implementation**: Use `route.snapshot.paramMap.get('id')` synchronously to read the ID at construction time, then issue a single `toSignal(http.get(...))` observable. No flash because data is fetched immediately on component init.

```typescript
private readonly showId = Number(inject(ActivatedRoute).snapshot.paramMap.get('id'));

readonly show = toSignal(
  this.showId && !isNaN(this.showId)
    ? this.libraryService.getShowById(this.showId).pipe(catchError(() => of(null)))
    : of(null as ShowDetail | null),
  { initialValue: null as ShowDetail | null }
);
```

### Pattern: location.back() for Back Button

Story 4-3 review finding: `routerLink="/"` does NOT restore scroll position — it navigates fresh to `/`. Angular's `withInMemoryScrolling` only restores scroll for forward/back navigation events, not programmatic navigation.

Fix from 4-3: Use `location.back()` (`inject(Location)`) to trigger true browser history back — this lets Angular's scroll restoration kick in.

```typescript
readonly location = inject(Location);
// Template: <button type="button" class="back-link" (click)="location.back()">← Back to Library</button>
```

### Review Findings

- [x] [Review][Patch] Rating falsy check suppresses `rating === 0` — change `@if (s.rating)` to `@if (s.rating !== null)` [show-detail.component.html:23]
- [x] [Review][Patch] Episode name `??` doesn't coalesce empty string `""` — change `ep.name ?? 'Episode ' + ep.episode_number` to `ep.name || 'Episode ' + ep.episode_number` [show-detail.component.html:40]
- [x] [Review][Patch] Empty `seasons` array renders silently — add `@empty { <p class="detail-not-found">No seasons available.</p> }` inside the `@for (season of s.seasons …)` block [show-detail.component.html:33]
- [x] [Review][Patch] Play links all have identical accessible text "Play" — add `aria-label="Play {{ ep.name || 'Episode ' + ep.episode_number }}"` to each `.episode__play` anchor [show-detail.component.html:46]
- [x] [Review][Patch] `formatDuration()` called twice per episode — use `@let dur = formatDuration(ep.duration);` and reference `dur` in both `@if` and binding [show-detail.component.html:43-45]
- [x] [Review][Patch] `formatDuration`/`formatRating` unit tests spin up full TestBed + repeated copy-paste provider setup — refactor to share a single `beforeEach` with TestBed config; pure-function calls need only `TestBed.createComponent` [show-detail.component.spec.ts]
- [x] [Review][Patch] No test for `catchError` error path — add a spec where `getShowById` returns `throwError(...)` and assert "Show not found." renders [show-detail.component.spec.ts]
- [x] [Review][Patch] No test for invalid/NaN route id — add a spec with `makeActivatedRouteStub('abc')` and assert show stays null without calling the API [show-detail.component.spec.ts]
- [x] [Review][Defer] Route param snapshot stale on same-route navigation — spec explicitly mandated `snapshot.paramMap` to prevent "not found" flash (per Dev Notes: 4-3 fix); no in-app show→show navigation in current UI [show-detail.component.ts:21] — deferred, pre-existing
- [x] [Review][Defer] Loading state flash — `initialValue: null` renders "Show not found." during in-flight fetch — spec-accepted trade-off; no loading indicator required [show-detail.component.html:51] — deferred, pre-existing
- [x] [Review][Defer] Responsive breakpoint `600px` is a magic number — all other dimensions use `var(--*)` tokens; design-system gap [show-detail.component.css:143] — deferred, pre-existing
- [x] [Review][Defer] `getDuration()` returns `0` as sentinel for unknown duration — pre-existing ProbeService behavior; fix belongs in ProbeService [library.service.ts EpisodeItem] — deferred, pre-existing
- [x] [Review][Defer] `ShowDetail.id` = `tmdb_id` naming — pre-existing API contract; documented in Dev Notes [library.service.ts:ShowDetail] — deferred, pre-existing

### File Locations

```
apps/frontend/src/app/
  show-detail/
    show-detail.component.ts       ← NEW
    show-detail.component.html     ← NEW
    show-detail.component.css      ← NEW
    show-detail.component.spec.ts  ← NEW
  services/
    library.service.ts             ← UPDATE: add EpisodeItem, SeasonInfo, ShowDetail interfaces + getShowById()
  app.routes.ts                    ← UPDATE: add show/:id lazy route
```

### Files to UPDATE (not recreate)

**`library.service.ts`**: Add `EpisodeItem`, `SeasonInfo`, `ShowDetail` interfaces at the end of the existing interfaces block (after `MovieDetail`). Add `getShowById()` to the class. Existing methods (`getMovies`, `getShows`, `getRecent`, `getMovieById`) are untouched.

**`app.routes.ts`**: Add a single new route entry after `movie/:id`. The existing `''` and `movie/:id` routes are untouched. Do NOT modify `provideRouter` in `app.config.ts` — scroll restoration was set up in story 4-2 and must not be changed.

### Angular Patterns (established 4-2/4-3)

- **Signals + toSignal**: `toSignal()` for all async data. `initialValue: null` for nullable data.
- **OnPush**: All components use `ChangeDetectionStrategy.OnPush`.
- **inject()**: Use `inject()` pattern, not constructor injection.
- **Standalone**: All components are standalone (no NgModule).
- **RouterLink import**: Must be in `imports: [RouterLink]` on `@Component` decorator.
- **Angular version**: 21.x (`@angular/core: ^21.2.0`). `@if`, `@for`, `@else` control flow syntax is the current pattern (not `*ngIf`, `*ngFor`).
- **`@for` track**: Track by a stable unique key per item — `track ep.file_id` for episodes, `track season.season_number` for seasons.

### CSS Design Tokens

All from `apps/frontend/src/styles/variables.css`:
- `--color-accent: #e65100` (deep orange — Play links)
- `--color-text: #f0f0f0`
- `--color-text-muted: #aaa`
- `--color-surface: #2a2a2a`
- `--color-surface-raised: #333`
- `--font-size-xl: 1.75rem` — title (UX-DR4)
- `--font-size-lg: 1.25rem` — season headers
- `--font-size-base: 1rem` — description, episode titles
- `--font-size-sm: 0.875rem` — metadata, episode numbers, durations
- `--poster-ratio: 2 / 3`
- `--space-sm: 0.5rem`, `--space-md: 1rem`, `--space-lg: 1.5rem`, `--space-xl: 2.5rem`
- `--line-height-tight: 1.25`, `--line-height-base: 1.6`
- `--font-weight-medium: 500`, `--font-weight-bold: 700`

### UX Constraints (must not violate)

- **UX-DR4**: Poster left, text right. Title `--font-size-xl`, metadata muted text, description base size.
- **UX-DR10**: Zero-animation policy. **No `:hover`, `transition`, or `animation` CSS rules anywhere in this file.**
- **UX-DR11**: WCAG AA contrast. Min 44×44px touch targets for all interactive elements (Play links, Back button).
- **UX-DR12**: Back button returns to grid at same scroll position — achieved via `location.back()`.
- **UX-DR9**: BEM-lite naming (`.seasons-list`, `.season`, `.season__header`, `.episode-list`, `.episode`, `.episode__number`, `.episode__title`, `.episode__duration`, `.episode__play`).
- **No skeleton screens** — zero-animation policy extends to loading states. Show nothing until data arrives, then render the full page.

### No Show-Level Play Button

Unlike movies, there is no single "Play" button for the whole show at the top. Each episode has its own Play link (`.episode__play`). This follows the AC: "each episode has a Play link/button." Do NOT add a show-level Play button.

### Deferred Work Item Resolved

`deferred-work.md` entry: "Missing `/movie/:id` and `/show/:id` route handlers — intentional: route handlers added in stories 4-3 and 4-4."
Story 4-3 added `/movie/:id`. This story adds `/show/:id`. No update to `deferred-work.md` needed — the story completion resolves this naturally.

### Testing Framework

Frontend uses **vitest** (`vitest: ^4.0.8`) with Angular testing utilities. Import `vi` from `'vitest'` (not Jest). Test structure matches `movie-detail.component.spec.ts` exactly — use that file as the reference implementation.

### Previous Story Learnings (4-3)

- `flex-shrink: 0` on poster wrap is dead CSS in a grid context — do NOT add it.
- `AudioTrack.codec: string` (not `string | null`) and `channels: number` (not `number | null`) — backend always provides these; the 4-3 review patch corrected this. The `EpisodeItem` interfaces should similarly use non-nullable types where the backend always populates them.
- The `content-container` class in `layout.css` gives `max-width: 1400px + padding` — use it as the `<main>` class on every page component.
- `loading="lazy"` goes on the `<img>` element, not on a wrapper div.

### Git Context (recent commits)

- `4b8900a` — implement 4-3 (movie-detail component, show/:id route deferred to 4-4)
- `5b15372` — create story 4-3
- `32a42f2` — fix(csp): allow TMDB img-src in helmet CSP policy
- `b255b75` — fix: populate tmdb_config at startup so poster_url is non-null in library API

### Architecture Reference

- Frontend: Angular 21 standalone components, Signals, OnPush everywhere. Source: `apps/frontend/src/`
- Backend show detail endpoint: `GET /api/library/shows/:id` → `BrowseController.getShow()` → `BrowseService.getShowById()`. Source: `apps/backend/src/library/browse.controller.ts`, `browse.service.ts`
- CSS design tokens: `apps/frontend/src/styles/variables.css`
- Global layout utilities: `apps/frontend/src/styles/layout.css` (`.content-container`)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.6 (GitHub Copilot)

### Debug Log References

### Completion Notes List

- Added `EpisodeItem`, `SeasonInfo`, `ShowDetail` interfaces to `library.service.ts` after the existing `MovieDetail` interface.
- Added `getShowById(id: number): Observable<ShowDetail>` method to `LibraryService`.
- Registered lazy `show/:id` route in `app.routes.ts` — resolves deferred work item from 4-2 review.
- Created `ShowDetailComponent` (standalone, OnPush) using `snapshot.paramMap` synchronous pattern from 4-3 to avoid "not found" flash.
- `formatDuration(seconds)` handles seconds-based duration (FFprobe), including `0` sentinel guard.
- Seasons rendered in backend order (latest-first via SQL `ORDER BY season_number DESC`); no client re-sort needed.
- Back button uses `location.back()` for scroll-position restoration (UX-DR12), matching 4-3 pattern.
- No hover/transition/animation CSS (UX-DR10).
- 11 new tests; all 38 tests pass (0 regressions).

### File List

- `apps/frontend/src/app/services/library.service.ts` (modified)
- `apps/frontend/src/app/app.routes.ts` (modified)
- `apps/frontend/src/app/show-detail/show-detail.component.ts` (created)
- `apps/frontend/src/app/show-detail/show-detail.component.html` (created)
- `apps/frontend/src/app/show-detail/show-detail.component.css` (created)
- `apps/frontend/src/app/show-detail/show-detail.component.spec.ts` (created)

## Change Log

| Date | Change |
|------|--------|
| 2026-05-03 | Implemented story 4-4: TV show detail page with season/episode listings, route registration, interfaces, and tests |
