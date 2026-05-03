# Story 4.2: Poster Grid Home Page with Three Sections

Status: review

## Story

As a viewer,
I want to see a poster grid with Continue Watching, Recently Added, and A-Z Library sections,
so that I can browse my entire library visually from one page.

## Acceptance Criteria

```gherkin
Given the viewer navigates to the home page
When the page renders
Then three sections appear in fixed order: Continue Watching (conditional), Recently Added, Full Library A-Z
And the "Continue Watching" section only appears if localStorage has watch progress data (UX-DR5)
And the "Recently Added" section shows the newest imports
And the "Library" section shows all titles sorted alphabetically
And each title is displayed as a poster image in a CSS Grid with auto-fill and minmax(180px, 1fr) (UX-DR3)
And all poster slots are pre-sized with 2:3 aspect ratio to prevent layout shift (UX-DR8)
And images use native loading="lazy" for below-the-fold posters (UX-DR8)
And section headers use --font-size-lg, left-aligned (UX-DR3)
And BEM-lite class naming is used (.poster-grid, .poster-grid__item, etc.) (UX-DR9)
And no animations, hover effects, or skeleton screens are used (UX-DR10)
And the page is responsive — poster count adapts naturally via CSS Grid (UX-DR6)
And the page renders within 1 second perceived (NFR4)
```

## Tasks / Subtasks

- [x] 1. Create `apps/frontend/src/app/services/library.service.ts` (AC: all data endpoints)
  - [x] 1.1 Define exported backend response interfaces matching browse.service.ts output exactly (snake_case properties):
    ```typescript
    export interface MovieListItem {
      id: number;
      title: string;
      year: number | null;
      poster_url: string | null;
      runtime: number | null;
      rating: number | null;
      added_at: string;
      transcode_tier: number | null;
      playback_ready: boolean;
    }
    export interface ShowListItem {
      id: number;           // metadata.tmdb_id — NOT media_files.id
      title: string;
      year: number | null;
      poster_url: string | null;
      rating: number | null;
      season_count: number;
      added_at: string;
    }
    export interface RecentItem {
      id: number;           // media_files.id for movies, tmdb_id for TV
      title: string;
      year: number | null;
      poster_url: string | null;
      rating: number | null;
      media_type: string;   // 'movie' | 'tv'
      added_at: string;
    }
    ```
  - [x] 1.2 Define `@Injectable({ providedIn: 'root' })` class `LibraryService` using `inject(HttpClient)`:
    ```typescript
    private readonly http = inject(HttpClient);
    ```
  - [x] 1.3 Implement `getMovies(): Observable<MovieListItem[]>`:
    ```typescript
    return this.http.get<MovieListItem[]>('/api/library/movies');
    ```
  - [x] 1.4 Implement `getShows(): Observable<ShowListItem[]>`:
    ```typescript
    return this.http.get<ShowListItem[]>('/api/library/shows');
    ```
  - [x] 1.5 Implement `getRecent(limit = 20): Observable<RecentItem[]>`:
    ```typescript
    return this.http.get<RecentItem[]>('/api/library/recent', { params: { limit } });
    ```
    Note: params object is fine for numeric values — Angular HttpClient serializes them correctly.
  - [x] 1.6 Add imports: `Injectable`, `inject` from `@angular/core`; `HttpClient` from `@angular/common/http`; `Observable` from `rxjs`

- [x] 2. Update `apps/frontend/src/app/app.config.ts` — add HttpClient and scroll restoration
  - [x] 2.1 Import `provideHttpClient` from `@angular/common/http`
  - [x] 2.2 Import `withInMemoryScrolling` from `@angular/router`
  - [x] 2.3 Add `provideHttpClient()` to providers array
  - [x] 2.4 Update `provideRouter` call to include scroll position restoration:
    ```typescript
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'enabled' }))
    ```
    This satisfies UX-DR12: "Back button returns to grid at same scroll position". Must be set up here, in the first story that introduces real routing — not deferred.

- [x] 3. Update `apps/frontend/src/app/app.routes.ts` — register home route
  - [x] 3.1 Add lazy-loaded home route:
    ```typescript
    import { Routes } from '@angular/router';
    export const routes: Routes = [
      {
        path: '',
        loadComponent: () => import('./home/home.component').then(m => m.HomeComponent),
      },
    ];
    ```
    This fixes the deferred work item "Empty Angular route table" from 1-1 code review.

- [x] 4. Update `apps/frontend/src/app/app.html` — remove placeholder, use router-outlet only
  - [x] 4.1 Replace current content with:
    ```html
    <router-outlet />
    ```
    Remove the `<main class="app-container">` wrapper and `<h1>` — the home component owns its full page layout. The `.app-container` centering conflicts with the left-aligned poster grid.
  - [x] 4.2 Clear `apps/frontend/src/app/app.css` to empty (all rules refer to `.app-container` and `.app-title` which are no longer in the template):
    ```css
    /* App shell has no styles — components own their layout */
    ```

- [x] 5. Update `apps/frontend/src/index.html` — fix document title
  - [x] 5.1 Change `<title>Frontend</title>` to `<title>Cineplex Rigaud</title>`
    This fixes the deferred work item "Placeholder uses 'Frontend' as document title" from 1-1 code review.

- [x] 6. Update `apps/frontend/src/app/app.spec.ts` — fix tests after app.html change
  - [x] 6.1 Add `provideRouter([])` to TestBed providers (required for `<router-outlet>` when App imports `RouterOutlet`):
    ```typescript
    import { provideRouter } from '@angular/router';
    // ...
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
    ```
  - [x] 6.2 Remove the `'should render title'` test — `<h1>` has been moved from app.html to HomeComponent. Replace with:
    ```typescript
    it('should have a router outlet', () => {
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('router-outlet')).toBeTruthy();
    });
    ```

- [x] 7. Create `apps/frontend/src/app/home/home.component.ts`
  - [x] 7.1 Define exported `LibraryItem` interface and `WATCH_PROGRESS_KEY` constant:
    ```typescript
    export const WATCH_PROGRESS_KEY = 'cineplex_progress';

    export interface LibraryItem {
      id: number;
      title: string;
      year: number | null;
      posterUrl: string | null;   // camelCase — frontend view model
      mediaType: 'movie' | 'tv'; // camelCase — frontend view model
    }
    ```
    This key and interface are the forward-compatible foundation for stories 4-5 (progress indicators) and 6-1 (progress writes).
  - [x] 7.2 Define `@Component` decorator:
    ```typescript
    @Component({
      selector: 'app-home',
      standalone: true,
      imports: [RouterLink],
      templateUrl: './home.component.html',
      styleUrl: './home.component.css',
      changeDetection: ChangeDetectionStrategy.OnPush,
    })
    ```
  - [x] 7.3 Inject `LibraryService`:
    ```typescript
    private readonly libraryService = inject(LibraryService);
    ```
  - [x] 7.4 Define `recentItems` signal — maps RecentItem[] from API to LibraryItem[]:
    ```typescript
    readonly recentItems = toSignal(
      this.libraryService.getRecent().pipe(
        map(items =>
          items.map(item => ({
            id: item.id,
            title: item.title,
            year: item.year,
            posterUrl: item.poster_url,
            mediaType: item.media_type as 'movie' | 'tv',
          }))
        ),
        catchError(() => of([] as LibraryItem[]))
      ),
      { initialValue: [] as LibraryItem[] }
    );
    ```
  - [x] 7.5 Define `allItems` signal — combines movies + shows, sorted A-Z:
    ```typescript
    readonly allItems = toSignal(
      forkJoin([
        this.libraryService.getMovies().pipe(catchError(() => of([]))),
        this.libraryService.getShows().pipe(catchError(() => of([]))),
      ]).pipe(
        map(([movies, shows]) => {
          const combined: LibraryItem[] = [
            ...movies.map(m => ({
              id: m.id,
              title: m.title,
              year: m.year,
              posterUrl: m.poster_url,
              mediaType: 'movie' as const,
            })),
            ...shows.map(s => ({
              id: s.id,
              title: s.title,
              year: s.year,
              posterUrl: s.poster_url,
              mediaType: 'tv' as const,
            })),
          ];
          return combined.sort((a, b) => a.title.localeCompare(b.title));
        })
      ),
      { initialValue: [] as LibraryItem[] }
    );
    ```
  - [x] 7.6 Define `continueWatchingItems` signal — reads from localStorage (empty until story 4-5):
    ```typescript
    readonly continueWatchingItems = signal<LibraryItem[]>(
      this.readContinueWatchingFromStorage()
    );
    ```
  - [x] 7.7 Define `showContinueWatching` computed signal:
    ```typescript
    readonly showContinueWatching = computed(() => this.continueWatchingItems().length > 0);
    ```
  - [x] 7.8 Implement `private readContinueWatchingFromStorage(): LibraryItem[]`:
    ```typescript
    private readContinueWatchingFromStorage(): LibraryItem[] {
      try {
        const raw = localStorage.getItem(WATCH_PROGRESS_KEY);
        if (!raw) return [];
        // Storage schema populated by stories 4-5 and 6-1.
        // For this story: localStorage key is established, section stays hidden until
        // story 4-5 implements progress-based population.
        return [];
      } catch {
        return [];
      }
    }
    ```
  - [x] 7.9 Add all required imports:
    ```typescript
    import { Component, ChangeDetectionStrategy, computed, signal, inject } from '@angular/core';
    import { RouterLink } from '@angular/router';
    import { toSignal } from '@angular/core/rxjs-interop';
    import { forkJoin, of } from 'rxjs';
    import { map, catchError } from 'rxjs/operators';
    import { LibraryService } from '../services/library.service';
    ```

- [x] 8. Create `apps/frontend/src/app/home/home.component.html`
  - [x] 8.1 Implement the three-section layout:
    ```html
    <main class="content-container">

      @if (showContinueWatching()) {
        <section class="library-section">
          <h2 class="library-section__header">Continue Watching</h2>
          <div class="poster-grid">
            @for (item of continueWatchingItems(); track (item.mediaType + ':' + item.id)) {
              <a class="poster-grid__item"
                 [routerLink]="item.mediaType === 'movie' ? ['/movie', item.id] : ['/show', item.id]">
                <div class="poster-grid__image-wrap">
                  @if (item.posterUrl) {
                    <img class="poster-grid__image"
                         [src]="item.posterUrl"
                         [alt]="item.title"
                         loading="lazy" />
                  } @else {
                    <div class="poster-grid__image poster-grid__image--fallback"></div>
                  }
                </div>
                <p class="poster-grid__title">{{ item.title }}</p>
              </a>
            }
          </div>
        </section>
      }

      <section class="library-section">
        <h2 class="library-section__header">Recently Added</h2>
        <div class="poster-grid">
          @for (item of recentItems(); track (item.mediaType + ':' + item.id)) {
            <a class="poster-grid__item"
               [routerLink]="item.mediaType === 'movie' ? ['/movie', item.id] : ['/show', item.id]">
              <div class="poster-grid__image-wrap">
                @if (item.posterUrl) {
                  <img class="poster-grid__image"
                       [src]="item.posterUrl"
                       [alt]="item.title"
                       loading="lazy" />
                } @else {
                  <div class="poster-grid__image poster-grid__image--fallback"></div>
                }
              </div>
              <p class="poster-grid__title">{{ item.title }}</p>
            </a>
          }
        </div>
      </section>

      <section class="library-section">
        <h2 class="library-section__header">Library</h2>
        <div class="poster-grid">
          @for (item of allItems(); track (item.mediaType + ':' + item.id)) {
            <a class="poster-grid__item"
               [routerLink]="item.mediaType === 'movie' ? ['/movie', item.id] : ['/show', item.id]">
              <div class="poster-grid__image-wrap">
                @if (item.posterUrl) {
                  <img class="poster-grid__image"
                       [src]="item.posterUrl"
                       [alt]="item.title"
                       loading="lazy" />
                } @else {
                  <div class="poster-grid__image poster-grid__image--fallback"></div>
                }
              </div>
              <p class="poster-grid__title">{{ item.title }}</p>
            </a>
          }
        </div>
      </section>

    </main>
    ```
    Notes:
    - `content-container` class from layout.css gives max-width 1400px + padding
    - `.poster-grid` class from layout.css provides CSS Grid auto-fill
    - `track (item.mediaType + ':' + item.id)` is a string key — necessary because movie IDs (media_files.id) and show IDs (tmdb_id) can collide numerically in the combined allItems list
    - Poster links use `[routerLink]` — Angular generates proper `href` attributes for bookmarkability and right-click → open in new tab (UX-DR12)
    - Routes `/movie/:id` and `/show/:id` are defined here as canonical URLs; route handlers added in stories 4-3 and 4-4
    - `loading="lazy"` is on the `<img>` element, not the `<a>` wrapper (UX-DR8)

- [x] 9. Create `apps/frontend/src/app/home/home.component.css`
  - [x] 9.1 Implement all component-scoped styles:
    ```css
    .library-section {
      margin-block: var(--space-xl);
    }

    .library-section__header {
      /* Override global h2 size (--font-size-xl) with --font-size-lg per UX-DR3 */
      font-size: var(--font-size-lg);
      font-weight: var(--font-weight-bold);
      margin-block-end: var(--space-md);
    }

    /* Poster item link — reset link styles, stack image + title */
    .poster-grid__item {
      display: flex;
      flex-direction: column;
      gap: var(--space-xs);
      text-decoration: none;
      color: inherit;
    }

    /* Pre-sized 2:3 container prevents cumulative layout shift (UX-DR8) */
    .poster-grid__image-wrap {
      aspect-ratio: var(--poster-ratio); /* 2 / 3 */
      background-color: var(--color-surface);
      overflow: hidden;
    }

    .poster-grid__image {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    /* Shown when poster_url is null — solid surface bg */
    .poster-grid__image--fallback {
      width: 100%;
      height: 100%;
      background-color: var(--color-surface-raised);
    }

    /* Title below poster — truncate to one line */
    .poster-grid__title {
      font-size: var(--font-size-sm);
      line-height: var(--line-height-tight);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    ```
    Critical: **No hover effects, no transitions, no animations** (UX-DR10). The zero-animation policy is enforced by omission — do not add `:hover`, `transition`, or `animation` rules to any selector.

- [x] 10. Create `apps/frontend/src/app/services/library.service.spec.ts`
  - [x] 10.1 Set up TestBed with `provideHttpClient()` + `provideHttpClientTesting()`:
    ```typescript
    import { TestBed } from '@angular/core/testing';
    import { provideHttpClient } from '@angular/common/http';
    import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
    import { LibraryService } from './library.service';

    describe('LibraryService', () => {
      let service: LibraryService;
      let httpController: HttpTestingController;

      beforeEach(() => {
        TestBed.configureTestingModule({
          providers: [LibraryService, provideHttpClient(), provideHttpClientTesting()],
        });
        service = TestBed.inject(LibraryService);
        httpController = TestBed.inject(HttpTestingController);
      });

      afterEach(() => { httpController.verify(); });
    });
    ```
  - [x] 10.2 Tests for `getMovies()`:
    - Sends GET to `/api/library/movies`
    - Returns the server response as MovieListItem[]
  - [x] 10.3 Tests for `getShows()`:
    - Sends GET to `/api/library/shows`
    - Returns ShowListItem[]
  - [x] 10.4 Tests for `getRecent()` — default limit:
    - Sends GET to `/api/library/recent` with `params.limit = '20'`
    - Returns RecentItem[]
  - [x] 10.5 Tests for `getRecent(5)` — custom limit:
    - Sends GET to `/api/library/recent` with `params.limit = '5'`

- [x] 11. Create `apps/frontend/src/app/home/home.component.spec.ts`
  - [x] 11.1 Set up TestBed with mock `LibraryService` and `provideRouter([])`:
    ```typescript
    import { TestBed } from '@angular/core/testing';
    import { provideRouter } from '@angular/router';
    import { of } from 'rxjs';
    import { HomeComponent, WATCH_PROGRESS_KEY } from './home.component';
    import { LibraryService } from '../services/library.service';

    // Minimal factory for LibraryItem test data
    function makeMovieItem(id: number, title: string) {
      return { id, title, year: 2024, poster_url: null, rating: null,
               added_at: '2024-01-01', transcode_tier: 1, playback_ready: true, runtime: null };
    }
    function makeShowItem(id: number, title: string) {
      return { id, title, year: 2024, poster_url: null, rating: null,
               added_at: '2024-01-01', season_count: 1 };
    }
    function makeRecentItem(id: number, title: string, media_type: 'movie' | 'tv') {
      return { id, title, year: 2024, poster_url: null, rating: null,
               added_at: '2024-01-01', media_type };
    }

    describe('HomeComponent', () => {
      let mockLibraryService: Pick<LibraryService, 'getMovies' | 'getShows' | 'getRecent'>;

      beforeEach(async () => {
        mockLibraryService = {
          getMovies: vi.fn().mockReturnValue(of([])),
          getShows: vi.fn().mockReturnValue(of([])),
          getRecent: vi.fn().mockReturnValue(of([])),
        };
        localStorage.clear();

        await TestBed.configureTestingModule({
          imports: [HomeComponent],
          providers: [
            { provide: LibraryService, useValue: mockLibraryService },
            provideRouter([]),
          ],
        }).compileComponents();
      });
    });
    ```
  - [x] 11.2 Test: `'should create the component'` — basic instantiation
  - [x] 11.3 Test: `'should hide Continue Watching section when localStorage has no progress data'`:
    - localStorage.clear() in beforeEach guarantees no data
    - Create component, detectChanges
    - Query for `section.library-section` elements (or text "Continue Watching")
    - Expect no "Continue Watching" section to be present
  - [x] 11.4 Test: `'should show Continue Watching section when localStorage has progress data'`:
    - `localStorage.setItem(WATCH_PROGRESS_KEY, JSON.stringify({ 'movie:1': { position: 100 } }))`
    - But wait — `readContinueWatchingFromStorage()` currently returns `[]` always (stub for story 4-5)
    - So this test verifies the CURRENT behavior: section is hidden even if key exists in localStorage
    - **NOTE**: This test documents the incomplete behavior and will be updated in story 4-5 when real population is implemented
    - Test: section is hidden (continueWatchingItems is always [])
  - [x] 11.5 Test: `'should display recently added items'`:
    - Mock `getRecent` returns `[makeRecentItem(1, 'Movie A', 'movie'), makeRecentItem(2, 'Show B', 'tv')]`
    - detectChanges; query for "Recently Added" section
    - Expect 2 poster items rendered
  - [x] 11.6 Test: `'should display library items sorted alphabetically'`:
    - Mock `getMovies` returns `[makeMovieItem(2, 'Zorro'), makeMovieItem(1, 'Alien')]`
    - Mock `getShows` returns `[makeShowItem(10, 'Breaking Bad')]`
    - detectChanges; query poster titles in Library section
    - Expect order: Alien, Breaking Bad, Zorro
  - [x] 11.7 Test: `'should render poster items as <a> elements with correct routerLink'`:
    - Mock `getRecent` returns `[makeRecentItem(5, 'Test Movie', 'movie')]`
    - detectChanges; find anchor elements in Recently Added section
    - Expect anchor `href` to contain `/movie/5`
  - [x] 11.8 Test: `'should render TV show posters linking to /show/:id'`:
    - Mock `getRecent` returns `[makeRecentItem(99, 'Test Show', 'tv')]`
    - detectChanges; find anchor in Recently Added
    - Expect `href` to contain `/show/99`
  - [x] 11.9 Test: `'poster images should have loading=lazy attribute'`:
    - Mock `getMovies` returns `[{ ...makeMovieItem(1, 'Film'), poster_url: 'https://example.com/poster.jpg' }]`
    - Mock `getShows` returns `[]`
    - detectChanges; find `<img>` in Library section
    - Expect `img.getAttribute('loading')` to equal `'lazy'`
  - [x] 11.10 Test: `'should render fallback div when poster_url is null'`:
    - Movie with `poster_url: null`
    - detectChanges
    - Expect `.poster-grid__image--fallback` div to be present, no `<img>`
  - [x] 11.11 Test: `'should call getMovies, getShows, and getRecent on init'`:
    - Verify mock service methods were called

- [x] 12. Build verification
  - [x] 12.1 Run `npm run test:frontend` — all existing and new tests pass; no vitest failures
  - [x] 12.2 Run `npm run build:frontend` — Angular build succeeds with no TypeScript errors
  - [x] 12.3 Verify no TypeScript strict-mode violations (tsconfig.json has `"strict": true`)

## Dev Notes

### Critical: API URL Convention

**Always use relative URLs** like `/api/library/movies` — NEVER `http://localhost:3000/api/...`.

The Angular app is ALWAYS served by NestJS (either as built assets or via `ng build --watch` + NestJS in dev mode). The `npm run dev` script runs `ng build --watch` + `npm run start:dev` concurrently, so NestJS always serves the compiled frontend at port 3000. No proxy needed. No CORS issues.

### Angular 21 Patterns Used in This Story

**`inject()` DI pattern** — used at field declaration level (runs during constructor injection context):
```typescript
private readonly libraryService = inject(LibraryService);
```

**`toSignal()` from `@angular/core/rxjs-interop`** — converts Observable to Signal. Called at field declaration level (valid injection context):
```typescript
readonly items = toSignal(this.http.get<T[]>('/api/...'), { initialValue: [] as T[] });
```
`initialValue` specifies the value before the first emission. Must match the type of the observable's emission.

**`@if` / `@for` control flow** — Angular 17+ block syntax. No need to import `NgIf`/`NgFor`:
```html
@if (showSection()) { ... }
@for (item of items(); track item.id) { ... }
```

**`forkJoin` for parallel requests** — emits when ALL inner observables complete (HTTP calls complete on first response). Combine movies + shows in a single render pass. Wrap each with `catchError(() => of([]))` so one API failure doesn't block the other section.

**OnPush change detection** — all signals are automatically tracked by Angular's reactivity system. No manual `markForCheck()` needed.

**`RouterLink`** — imported in `@Component.imports[]`. Generates proper `href` attributes from `[routerLink]` bindings (required for bookmarkability, right-click → open in new tab, back button).

### Backend API Response Shapes (from Story 4-1)

The `LibraryService` interfaces match the backend's `browse.service.ts` output exactly. Key details:
- **Snake_case properties**: `poster_url`, `media_type`, `added_at`, `transcode_tier`, `season_count`
- **Movie ID**: `media_files.id` — each movie file is distinct
- **Show ID**: `metadata.tmdb_id` — groups all episodes of the same show
- **Recent mixed IDs**: `id` is `media_files.id` for movies, `metadata.tmdb_id` for TV shows — use `media_type` to distinguish route
- **Playback filter**: All viewer-facing endpoints only return items with `status IN ('ready', 'completed')` — already filtered server-side

### Combined A-Z List: ID Collision Risk

`allItems` combines `MovieListItem` and `ShowListItem`. A movie with `id=1` and a show with `tmdb_id=1` can coexist. In the template, **always track using the composite key**:
```html
@for (item of allItems(); track (item.mediaType + ':' + item.id))
```
The `LibraryItem.mediaType` + `LibraryItem.id` together are always unique.

### Scroll Position Restoration (UX-DR12)

```typescript
// app.config.ts
provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'enabled' }))
```

This is the Angular mechanism for "back button returns to grid at same scroll position". Must be set up here in story 4-2 because it's the first story with real routes. `withInMemoryScrolling` stores scroll positions keyed by route URL and restores them on backward navigation.

### CSS: Section Headers Override

Global `typography.css` sets `h2 { font-size: var(--font-size-xl) }`. The UX spec requires section headers at `--font-size-lg`. The component's scoped `.library-section__header` rule overrides this:
```css
.library-section__header {
  font-size: var(--font-size-lg); /* Overrides global h2 = --font-size-xl */
}
```
Angular's ViewEncapsulation (Emulated, default) scopes this rule to the component. No `::ng-deep` needed.

### CSS: Pre-sized Poster Container (UX-DR8)

```css
.poster-grid__image-wrap {
  aspect-ratio: var(--poster-ratio); /* CSS var holds "2 / 3" literal */
  background-color: var(--color-surface);
  overflow: hidden;
}
```

CSS custom properties store text literally. `--poster-ratio: 2 / 3` stores the string `"2 / 3"`. When used in `aspect-ratio: var(--poster-ratio)`, this becomes `aspect-ratio: 2 / 3` — valid CSS. Browser support: universal in 2026.

The fallback `background-color: var(--color-surface)` shows as a dark placeholder while the image loads, preventing white flash. This is the only "loading state" needed — no skeleton screens (UX-DR10).

### Continue Watching: Scoping for Future Stories

The `WATCH_PROGRESS_KEY = 'cineplex_progress'` constant and `continueWatchingItems` signal are established in this story as extension points:

| Story | Responsibility |
|-------|---------------|
| **4-2 (this story)** | Define `WATCH_PROGRESS_KEY`, stub `continueWatchingItems = []`, section hidden |
| **4-5** | Implement `readContinueWatchingFromStorage()` to parse real data; add progress bars on posters |
| **6-1** | Write to localStorage using the same `WATCH_PROGRESS_KEY` during playback |

The `readContinueWatchingFromStorage()` method currently returns `[]` (empty stub). Story 4-5 will flesh it out. The `localStorage.getItem(WATCH_PROGRESS_KEY)` try/catch guard handles SSR or environments where localStorage is unavailable.

### Route URLs Established (Not Yet Handled)

Story 4-2 establishes these canonical URL patterns via `[routerLink]`:
- `/movie/:id` — movie detail page (handled in story 4-3)
- `/show/:id` — TV show detail page (handled in story 4-4)

Until stories 4-3/4-4 add the route handlers, clicking posters navigates to an unmatched route (router-outlet renders nothing). This is acceptable during development.

### File Locations

```
apps/frontend/src/
├── index.html                         ← UPDATE: title "Frontend" → "Cineplex Rigaud"
├── app/
│   ├── app.config.ts                  ← UPDATE: add provideHttpClient(), withInMemoryScrolling
│   ├── app.routes.ts                  ← UPDATE: add home route (lazy loaded)
│   ├── app.html                       ← UPDATE: remove h1/main, just <router-outlet />
│   ├── app.css                        ← UPDATE: clear all rules (no longer used)
│   ├── app.spec.ts                    ← UPDATE: remove h1 test, add router-outlet test
│   ├── home/
│   │   ├── home.component.ts          ← NEW
│   │   ├── home.component.html        ← NEW
│   │   ├── home.component.css         ← NEW
│   │   └── home.component.spec.ts     ← NEW
│   └── services/
│       ├── library.service.ts         ← NEW
│       └── library.service.spec.ts    ← NEW
```

### Pre-existing CSS Already in Place (Do Not Recreate)

`apps/frontend/src/styles/layout.css` already defines:
```css
.content-container {
  max-width: var(--content-max-width);
  margin-inline: auto;
  padding: var(--content-padding);
}
.poster-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--poster-width), 1fr));
  gap: var(--grid-gap);
}
```
Use `.content-container` on the `<main>` element and `.poster-grid` on the grid `<div>`. Component CSS only adds rules not already in global styles.

### Zero-Animation Policy (UX-DR10)

The home page CSS must have **zero** occurrences of:
- `transition:` — no hover fades, no color transitions
- `animation:` — no loading spinners, no shimmer
- `:hover { ... }` — no visual hover effects (cursor change is fine, but don't change colors/scale)
- `transform:` in any interactive context

The design principle is "nothing moves unless you click it." The poster grid has instant, static rendering. Speed is real, not simulated.

### Error Handling in Signals

Both `recentItems` and `allItems` use `.pipe(catchError(() => of([])))`. This prevents a failed API call from putting the signal into an error state that would crash the component. On API failure:
- Recently Added and Library sections render as empty grids
- No error UI is shown to viewers (UX principle: errors are admin problems, not viewer problems)
- The sections simply render no posters

### Testing with Vitest + Angular TestBed

The frontend uses **Vitest** as the test runner (configured via `@angular/build:unit-test` in angular.json). Standard Angular `TestBed` APIs work as-is. Use `vi.fn()` (not `jasmine.createSpy()`) for mock functions:
```typescript
import { vi } from 'vitest';

const mockService = {
  getMovies: vi.fn().mockReturnValue(of([])),
  getShows: vi.fn().mockReturnValue(of([])),
  getRecent: vi.fn().mockReturnValue(of([])),
};
```
Call `vi.clearAllMocks()` or `localStorage.clear()` in `beforeEach` to prevent test pollution.

### NFR4: < 1s Perceived Render

This is achieved by the architecture, not code:
1. API calls are made immediately on component creation (`toSignal` subscribes on instantiation)
2. The HTML renders the empty grid structure immediately (no loading state UI)
3. When API responds (< 200ms per NFR5), signals update and Angular re-renders
4. Posters appear as soon as API responds — no artificial delay
5. No skeleton screens, no loading indicators (UX-DR10)
6. The `content-container` layout renders instantly with correct dimensions

### Accessibility Requirements (UX-DR11)

- Poster links are `<a>` elements — keyboard navigable, screen-reader friendly
- `[alt]="item.title"` on all poster `<img>` elements — alt text describes content
- Never add `outline: none` — browser-default focus styles are preserved
- Section `<h2>` heading hierarchy is correct (main page content)
- Touch targets: the full poster area is the tap target (well over 44×44px at 180px min width)

## Dev Agent Record

### Agent Model Used
Claude Sonnet 4.6

### Completion Notes List
- Implemented `LibraryService` with `getMovies()`, `getShows()`, `getRecent()` using `inject(HttpClient)` and relative API URLs
- Updated `app.config.ts`: added `provideHttpClient()` and `withInMemoryScrolling({ scrollPositionRestoration: 'enabled' })`
- Updated `app.routes.ts`: added lazy-loaded home route pointing to `HomeComponent`
- Updated `app.html`: replaced `<main>/<h1>` wrapper with bare `<router-outlet />`
- Cleared `app.css`: removed `.app-container`/`.app-title` rules no longer needed
- Updated `index.html`: changed title from "Frontend" to "Cineplex Rigaud"
- Updated `app.spec.ts`: replaced `'should render title'` with `'should have a router outlet'` test; added `provideRouter([])`
- Created `HomeComponent` with `toSignal`-based `recentItems`, `allItems` (A-Z sorted), and `continueWatchingItems` (stub for story 4-5)
- `showContinueWatching` computed signal hides Continue Watching section until story 4-5 populates the data
- `WATCH_PROGRESS_KEY = 'cineplex_progress'` constant established for future stories 4-5 and 6-1
- Three-section template uses Angular `@if`/`@for` control flow, BEM-lite classes, `loading="lazy"` on all `<img>` elements
- Component CSS has zero hover effects, transitions, or animations per UX-DR10
- All 16 tests pass (3 test files); Angular production build succeeds with no TypeScript errors

### File List
- apps/frontend/src/app/services/library.service.ts (NEW)
- apps/frontend/src/app/services/library.service.spec.ts (NEW)
- apps/frontend/src/app/home/home.component.ts (NEW)
- apps/frontend/src/app/home/home.component.html (NEW)
- apps/frontend/src/app/home/home.component.css (NEW)
- apps/frontend/src/app/home/home.component.spec.ts (NEW)
- apps/frontend/src/app/app.config.ts (MODIFIED)
- apps/frontend/src/app/app.routes.ts (MODIFIED)
- apps/frontend/src/app/app.html (MODIFIED)
- apps/frontend/src/app/app.css (MODIFIED)
- apps/frontend/src/app/app.spec.ts (MODIFIED)
- apps/frontend/src/index.html (MODIFIED)

### Change Log
- 2026-05-03: Implemented story 4-2 — Poster Grid Home Page with Three Sections. Created LibraryService and HomeComponent. Updated app shell (routing, HttpClient, scroll restoration, title). All 16 tests pass, build clean.

### Review Findings

- [x] [Review][Patch] `RecentItem.media_type` typed as `string` instead of `'movie' | 'tv'` literal union [apps/frontend/src/app/services/library.service.ts]
- [x] [Review][Patch] `localeCompare()` called without locale/sensitivity options — sort order varies by environment [apps/frontend/src/app/home/home.component.ts]
- [x] [Review][Patch] Fallback `<div>` incorrectly carries `.poster-grid__image` class — `object-fit: cover` is a no-op on a non-replaced element [apps/frontend/src/app/home/home.component.html]
- [x] [Review][Patch] Section headers missing `text-align: left` — AC UX-DR3 requires left-aligned headers [apps/frontend/src/app/home/home.component.css]
- [x] [Review][Defer] Missing `/movie/:id` and `/show/:id` route handlers — deferred, pre-existing [apps/frontend/src/app/app.routes.ts] — deferred, intentional: handlers added in stories 4-3 and 4-4
- [x] [Review][Defer] No wildcard/404 fallback route — deferred, pre-existing [apps/frontend/src/app/app.routes.ts] — deferred, pre-existing gap
- [x] [Review][Defer] `continueWatchingItems` signal not reactive to future `localStorage` writes — deferred, pre-existing [apps/frontend/src/app/home/home.component.ts] — deferred, intentional stub; story 4-5 owns this
- [x] [Review][Defer] Poster card template triplicated verbatim across three sections — deferred, pre-existing [apps/frontend/src/app/home/home.component.html] — deferred, DRY refactor; extract to PosterCardComponent in a future story
