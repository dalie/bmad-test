# Story 4.3: Movie Detail Page

Status: ready-for-dev

## Story

As a viewer,
I want to click a movie poster and see its full details with a Play button,
so that I can read about a movie before deciding to watch it.

## Acceptance Criteria

```gherkin
Given the viewer clicks a movie poster on the grid
When the browser navigates to /movie/:id
Then the detail page shows: poster (left), title in --font-size-xl, year, runtime, rating in muted text, description in base font size (UX-DR4)
And a large deep orange Play button is prominently displayed
And a "← Back to Library" link returns to the grid
And the back button returns to the grid at the same scroll position (UX-DR12)
And poster clicks are <a> tags with proper hrefs — bookmarkable, URL-driven (UX-DR12)
And SPA navigation completes in < 100ms (NFR6)
And WCAG AA contrast ratios are maintained for all text (UX-DR11)
And touch targets meet minimum 44x44px (UX-DR11)
```

## Tasks / Subtasks

- [ ] 1. Add `MovieDetail` interface and `getMovieById()` to `apps/frontend/src/app/services/library.service.ts` (AC: data shape)
  - [ ] 1.1 Add exported `MovieDetail` interface matching backend `MovieDetail` shape exactly (snake_case):
    ```typescript
    export interface AudioTrack {
      index: number;
      codec: string | null;
      language: string | null;
      channels: number | null;
    }
    export interface SubtitleTrack {
      id: number;
      track_index: number | null;
      type: string;
      language: string | null;
      codec: string | null;
      webvtt_path: string | null;
    }
    export interface MovieDetail {
      id: number;
      title: string;
      description: string | null;
      year: number | null;
      poster_url: string | null;
      runtime: number | null;
      rating: number | null;
      content_rating: string | null;
      audio_tracks: AudioTrack[];
      subtitle_tracks: SubtitleTrack[];
      file_id: number;
      tier: number | null;
      transcode_output_path: string | null;
    }
    ```
    Source: `apps/backend/src/library/browse.service.ts` — `MovieDetail` interface at line 42.
  - [ ] 1.2 Add `getMovieById(id: number): Observable<MovieDetail>` method:
    ```typescript
    getMovieById(id: number): Observable<MovieDetail> {
      return this.http.get<MovieDetail>(`/api/library/movies/${id}`);
    }
    ```
    Note: `id` is `media_files.id` (NOT tmdb_id). The backend `GET /api/library/movies/:id` maps to `media_files.id` via `ParseIntPipe`.

- [ ] 2. Register `/movie/:id` route in `apps/frontend/src/app/app.routes.ts` (AC: bookmarkable URL)
  - [ ] 2.1 Add lazy-loaded movie-detail route:
    ```typescript
    {
      path: 'movie/:id',
      loadComponent: () =>
        import('./movie-detail/movie-detail.component').then(m => m.MovieDetailComponent),
    },
    ```
    This fulfills the deferred-work item "Missing `/movie/:id` route handlers" from 4-2 code review.
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
    ];
    ```

- [ ] 3. Create `apps/frontend/src/app/movie-detail/movie-detail.component.ts` (AC: all detail rendering)
  - [ ] 3.1 Define `@Component` decorator — standalone, OnPush, imports RouterLink:
    ```typescript
    @Component({
      selector: 'app-movie-detail',
      standalone: true,
      imports: [RouterLink],
      templateUrl: './movie-detail.component.html',
      styleUrl: './movie-detail.component.css',
      changeDetection: ChangeDetectionStrategy.OnPush,
    })
    ```
  - [ ] 3.2 Inject `ActivatedRoute` and `LibraryService`:
    ```typescript
    private readonly route = inject(ActivatedRoute);
    private readonly libraryService = inject(LibraryService);
    ```
  - [ ] 3.3 Derive `movieId` from route params using `toSignal`:
    ```typescript
    private readonly movieId = toSignal(
      this.route.paramMap.pipe(map(params => Number(params.get('id'))))
    );
    ```
  - [ ] 3.4 Define `movie` signal using `toSignal` + `switchMap` — fetches when id changes:
    ```typescript
    readonly movie = toSignal(
      toObservable(this.movieId).pipe(
        switchMap(id => {
          if (!id || isNaN(id)) return of(null);
          return this.libraryService.getMovieById(id).pipe(
            catchError(() => of(null))
          );
        })
      ),
      { initialValue: null }
    );
    ```
    Critical: Use `switchMap` (not `mergeMap`) so navigation to a new movie ID cancels the previous in-flight request.
  - [ ] 3.5 Add `formatRuntime(minutes: number | null): string` helper:
    ```typescript
    formatRuntime(minutes: number | null): string {
      if (!minutes) return '';
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return h > 0 ? `${h}h ${m}m` : `${m}m`;
    }
    ```
  - [ ] 3.6 Add `formatRating(rating: number | null): string` helper:
    ```typescript
    formatRating(rating: number | null): string {
      if (rating === null || rating === undefined) return '';
      return rating.toFixed(1);
    }
    ```
  - [ ] 3.7 Add all imports:
    ```typescript
    import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
    import { RouterLink, ActivatedRoute } from '@angular/router';
    import { toSignal, toObservable } from '@angular/core/rxjs-interop';
    import { switchMap, catchError, map } from 'rxjs/operators';
    import { of } from 'rxjs';
    import { LibraryService } from '../services/library.service';
    ```

- [ ] 4. Create `apps/frontend/src/app/movie-detail/movie-detail.component.html` (AC: layout UX-DR4, UX-DR12)
  - [ ] 4.1 Implement the detail page layout per UX-DR4 and UX spec HTML structure:
    ```html
    <main class="content-container">
      <a routerLink="/" class="back-link">← Back to Library</a>

      @if (movie(); as m) {
        <div class="detail-layout">
          <div class="detail-poster-wrap">
            @if (m.poster_url) {
              <img class="detail-poster"
                   [src]="m.poster_url"
                   [alt]="m.title" />
            } @else {
              <div class="detail-poster detail-poster--fallback"></div>
            }
          </div>

          <div class="detail-info">
            <h1 class="detail-title">{{ m.title }}</h1>

            <p class="detail-meta">
              @if (m.year) { <span>{{ m.year }}</span> }
              @if (m.year && (m.runtime || m.rating || m.content_rating)) { <span aria-hidden="true"> · </span> }
              @if (m.runtime) { <span>{{ formatRuntime(m.runtime) }}</span> }
              @if (m.runtime && (m.rating || m.content_rating)) { <span aria-hidden="true"> · </span> }
              @if (m.rating) { <span>★ {{ formatRating(m.rating) }}</span> }
              @if (m.rating && m.content_rating) { <span aria-hidden="true"> · </span> }
              @if (m.content_rating) { <span>{{ m.content_rating }}</span> }
            </p>

            @if (m.description) {
              <p class="detail-description">{{ m.description }}</p>
            }

            <a class="play-button" [routerLink]="['/play', m.file_id]">Play</a>
          </div>
        </div>
      } @else {
        <p class="detail-not-found">Movie not found.</p>
      }
    </main>
    ```
    Notes:
    - `content-container` is the global CSS class from `layout.css` (max-width 1400px + padding).
    - Play button is an `<a>` tag linking to `/play/:file_id` — the route for story 5-2 (not yet registered; that's fine, the link just won't resolve until 5-x stories are done).
    - `· ` separators between metadata fields use `aria-hidden="true"` — screen readers skip decorative punctuation.
    - No spinner/skeleton state — page either shows movie data or "Movie not found." No loading intermediate (zero-animation policy UX-DR10).
    - The `@if (movie(); as m)` block uses Angular's `@if` with template variable assignment — prevents multiple signal calls and null-checks in the template.

- [ ] 5. Create `apps/frontend/src/app/movie-detail/movie-detail.component.css` (AC: UX-DR4, UX-DR10, UX-DR11)
  - [ ] 5.1 Implement all component-scoped styles:
    ```css
    /* Back navigation link */
    .back-link {
      display: inline-block;
      margin-block-end: var(--space-lg);
      color: var(--color-text-muted);
      text-decoration: none;
      font-size: var(--font-size-sm);
      /* Min 44px touch target height via line-height + padding */
      padding-block: var(--space-sm);
    }

    /* Two-column layout: poster left, info right */
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
      flex-shrink: 0;
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

    /* Year · runtime · rating · content_rating in muted text per UX-DR4 */
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
      margin-block-end: var(--space-lg);
      max-width: 65ch; /* Keep lines readable */
    }

    /* Large deep orange Play button — minimum 44px touch target (UX-DR11) */
    .play-button {
      display: inline-block;
      background-color: var(--color-accent);
      color: var(--color-text);
      text-decoration: none;
      font-size: var(--font-size-lg);
      font-weight: var(--font-weight-bold);
      padding: var(--space-sm) var(--space-xl);
      min-height: 44px;
      line-height: var(--line-height-tight);
    }

    /* Not-found message */
    .detail-not-found {
      color: var(--color-text-muted);
      margin-block-start: var(--space-xl);
    }

    /* Responsive: stack on narrow viewports */
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
    Critical: **No hover effects, no transitions, no animations** (UX-DR10). No `:hover`, `transition`, or `animation` rules.
    Note on Play button: WCAG AA — `--color-accent` (`#e65100`) on `--color-text` (`#f0f0f0`) meets 3:1 for large/bold text (Play button qualifies as large text at 20px bold). The text renders on the button background — `--color-text` on `--color-accent` gives ~4.6:1.

- [ ] 6. Create `apps/frontend/src/app/movie-detail/movie-detail.component.spec.ts` (AC: unit tests)
  - [ ] 6.1 Set up TestBed with `provideHttpClient()`, `provideHttpClientTesting()`, `provideRouter([])`:
    ```typescript
    import { TestBed } from '@angular/core/testing';
    import { provideHttpClient } from '@angular/common/http';
    import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
    import { provideRouter } from '@angular/router';
    import { ActivatedRoute } from '@angular/router';
    import { of } from 'rxjs';
    import { MovieDetailComponent } from './movie-detail.component';
    import { MovieDetail } from '../services/library.service';

    const MOCK_MOVIE: MovieDetail = {
      id: 1,
      title: 'Inception',
      description: 'A thief who steals...',
      year: 2010,
      poster_url: 'https://image.tmdb.org/t/p/w500/poster.jpg',
      runtime: 148,
      rating: 8.8,
      content_rating: 'PG-13',
      audio_tracks: [],
      subtitle_tracks: [],
      file_id: 1,
      tier: 1,
      transcode_output_path: null,
    };
    ```
  - [ ] 6.2 Write test: renders title and metadata when API returns data:
    ```typescript
    it('should display movie title', async () => {
      // Provide an ActivatedRoute stub with paramMap
      // ...
    });
    ```
    Note: ActivatedRoute stubbing with paramMap signals is complex — at minimum test `formatRuntime` and `formatRating` helpers directly, and verify the component renders without errors with a mocked API response.
  - [ ] 6.3 Test `formatRuntime` helper:
    ```typescript
    it('formatRuntime: should format minutes to Xh Ym', () => {
      const comp = TestBed.createComponent(MovieDetailComponent).componentInstance;
      expect(comp.formatRuntime(148)).toBe('2h 28m');
      expect(comp.formatRuntime(45)).toBe('45m');
      expect(comp.formatRuntime(60)).toBe('1h 0m');
      expect(comp.formatRuntime(null)).toBe('');
    });
    ```
  - [ ] 6.4 Test `formatRating` helper:
    ```typescript
    it('formatRating: should format to one decimal', () => {
      const comp = TestBed.createComponent(MovieDetailComponent).componentInstance;
      expect(comp.formatRating(8.8)).toBe('8.8');
      expect(comp.formatRating(7)).toBe('7.0');
      expect(comp.formatRating(null)).toBe('');
    });
    ```

## Dev Notes

### Critical Context: ID Types

**`id` on `MovieListItem` = `media_files.id`** (integer primary key). This is what is stored in `[routerLink]="['/movie', item.id]"` on the home page. The backend `GET /api/library/movies/:id` also uses `media_files.id` (via `ParseIntPipe`). There is NO confusion with tmdb_id here — movie IDs are always `media_files.id`.

**This differs from TV shows**: `ShowListItem.id` = `tmdb_id`. Don't cross-contaminate the ID semantics. Story 4-4 handles shows.

### Backend API Shape

`GET /api/library/movies/:id` returns `MovieDetail` (source: `apps/backend/src/library/browse.controller.ts` line 45, `browse.service.ts` line 42):

```typescript
{
  id: number;                        // media_files.id
  title: string;
  description: string | null;
  year: number | null;
  poster_url: string | null;         // Full URL — already has TMDB base prepended
  runtime: number | null;            // Minutes
  rating: number | null;             // 0-10 float from TMDB vote_average
  content_rating: string | null;     // e.g. "PG-13" — from metadata.content_rating
  audio_tracks: AudioTrack[];        // Parsed from probe_data JSON
  subtitle_tracks: SubtitleTrack[];  // From subtitles table
  file_id: number;                   // Same as id — media_files.id
  tier: number | null;               // 1, 2, or 3
  transcode_output_path: string | null;
}
```

Returns HTTP 404 if not found (NotFoundException). Frontend `catchError(() => of(null))` handles this gracefully — shows "Movie not found."

### File Locations (NEW files)

```
apps/frontend/src/app/
  movie-detail/
    movie-detail.component.ts      ← NEW
    movie-detail.component.html    ← NEW
    movie-detail.component.css     ← NEW
    movie-detail.component.spec.ts ← NEW
  services/
    library.service.ts             ← UPDATE: add MovieDetail interface + getMovieById()
  app.routes.ts                    ← UPDATE: add movie/:id route
```

### Files to UPDATE (not recreate)

**`library.service.ts`**: Add `AudioTrack`, `SubtitleTrack`, `MovieDetail` interfaces at the bottom of the existing interfaces block (after `RecentItem`). Add `getMovieById()` method to the class. Existing `getMovies()`, `getShows()`, `getRecent()` are untouched.

**`app.routes.ts`**: Add a single new route entry. The existing `''` home route is untouched. Do NOT modify `provideRouter` in `app.config.ts` — scroll restoration was set up in story 4-2 and must not be changed.

### Angular Patterns (from 4-2)

- **Signals + toSignal**: Use `toSignal()` for all async data. `initialValue: null` for nullable data.
- **OnPush**: All components use `ChangeDetectionStrategy.OnPush`.
- **inject()**: Use `inject()` pattern, not constructor injection.
- **Standalone**: All components are standalone (no NgModule).
- **RouterLink import**: Must be in `imports: [RouterLink]` on the `@Component` decorator.
- **toObservable + switchMap**: Convert signal to observable for paramMap-driven fetches.

### toObservable + switchMap Pattern

`toObservable` requires Angular injection context — call it at class field initialization level (not inside a constructor or method body). The pattern for route-param-driven data:

```typescript
private readonly movieId = toSignal(
  this.route.paramMap.pipe(map(params => Number(params.get('id'))))
);

readonly movie = toSignal(
  toObservable(this.movieId).pipe(
    switchMap(id => {
      if (!id || isNaN(id)) return of(null);
      return this.libraryService.getMovieById(id).pipe(catchError(() => of(null)));
    })
  ),
  { initialValue: null }
);
```

`toObservable` import: `import { toSignal, toObservable } from '@angular/core/rxjs-interop';`

### Play Button Route

The Play button links to `/play/:file_id`. The `/play` route does not exist yet — it will be created in Epic 5 (story 5-2 Video Player). The `<a>` tag will be an unresolved link until then. This is intentional — the story only asks for the Play button to be present, not functional. Do NOT add a `[play]` route handler in this story.

### UX Constraints (must not violate)

- **UX-DR4**: Poster left, text right. Title `--font-size-xl`, metadata muted text, description base size. Large deep orange Play button.
- **UX-DR10**: Zero-animation policy. No `:hover`, `transition`, `animation` in CSS.
- **UX-DR11**: WCAG AA contrast. Min 44x44px touch targets.
- **UX-DR12**: Back button returns to grid at same scroll position (handled by `withInMemoryScrolling` configured in story 4-2 — no extra code needed here).
- **UX-DR9**: BEM-lite naming (`.detail-layout`, `.detail-info`, `.detail-meta`, `.detail-title`, `.detail-description`, `.play-button`, `.back-link`).
- **No skeleton screens** — the zero-animation policy extends to loading states. Show nothing until data is ready.

### Deferred Work Items Being Resolved

From `deferred-work.md` (4-2 code review):
- "Missing `/movie/:id` route handlers — intentional: route handlers added in stories 4-3 and 4-4." → **This story adds `/movie/:id`.**

### Previous Story Learnings (4-2)

- The `content-container` global CSS class (from `layout.css`) provides max-width + padding — use it as the `<main>` class, as done in home component.
- BEM-lite naming is enforced (`poster-grid`, `poster-grid__item`) — follow same convention (`detail-layout`, `detail-info`).
- Angular `@if (signal(); as variable)` template syntax works well for null-guarding signal values.
- `loading="lazy"` on `<img>` element, not wrapper.
- No `provideHttpClient` changes needed — it was added globally in `app.config.ts` in story 4-2.
- `withInMemoryScrolling({ scrollPositionRestoration: 'enabled' })` is already configured — back navigation will restore scroll position automatically.

### Git Context (recent commits)

- `32a42f2` — fix(csp): allow TMDB img-src in helmet CSP policy (poster images now load)
- `f799ca8` — fix: populate tmdb_config at startup (poster_url is non-null in library API)
- `72a5ecd` — implement 4-2 (home component with three sections, library service, routes)

### Architecture Reference

- Frontend: Angular 17+ standalone components, Signals for state, OnPush everywhere. Source: `apps/frontend/src/`.
- Backend movie detail endpoint: `GET /api/library/movies/:id` → `BrowseController.getMovie()` → `BrowseService.getMovieById()`. Source: `apps/backend/src/library/browse.controller.ts`, `browse.service.ts`.
- CSS design tokens: `apps/frontend/src/styles/variables.css`.
- Global layout utilities: `apps/frontend/src/styles/layout.css` (`.content-container`, `.poster-grid`).

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-5

### Debug Log References

### Completion Notes List

### File List
