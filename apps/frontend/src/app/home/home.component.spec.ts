import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { HomeComponent, WATCH_PROGRESS_KEY, WatchProgressEntry } from './home.component';
import { LibraryService } from '../services/library.service';

function makeMovieItem(id: number, title: string, poster_url: string | null = null) {
  return {
    id,
    title,
    year: 2024,
    poster_url,
    rating: null,
    added_at: '2024-01-01',
    transcode_tier: 1,
    playback_ready: true,
    runtime: null,
  };
}

function makeShowItem(id: number, title: string) {
  return {
    id,
    title,
    year: 2024,
    poster_url: null,
    rating: null,
    added_at: '2024-01-01',
    season_count: 1,
  };
}

function makeRecentItem(
  id: number,
  title: string,
  media_type: 'movie' | 'tv',
  poster_url: string | null = null,
) {
  return {
    id,
    title,
    year: 2024,
    poster_url,
    rating: null,
    added_at: '2024-01-01',
    media_type,
  };
}

function getSectionByHeading(root: HTMLElement, heading: string): HTMLElement | null {
  return Array.from(root.querySelectorAll('section.library-section')).find((section) =>
    section.querySelector('h2')?.textContent?.includes(heading),
  ) as HTMLElement | null;
}

function getSectionTitles(section: Element): string[] {
  return Array.from(section.querySelectorAll('.poster-grid__title')).map(
    (title) => title.textContent?.trim() ?? '',
  );
}

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
      mediaType: 'movie',
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
      mediaType: 'tv',
      id: tmdbId,
      title,
      posterUrl: null,
      year: 2024,
      fileId,
    },
  };
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
      providers: [{ provide: LibraryService, useValue: mockLibraryService }, provideRouter([])],
    }).compileComponents();
  });

  it('should create the component', () => {
    const fixture = TestBed.createComponent(HomeComponent);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  it('should hide Continue Watching section when localStorage has no progress data', () => {
    // localStorage.clear() in beforeEach guarantees no data
    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const sections = Array.from(compiled.querySelectorAll('h2'));
    const continueWatchingHeader = sections.find((h) =>
      h.textContent?.includes('Continue Watching'),
    );
    expect(continueWatchingHeader).toBeFalsy();
  });

  it('should show Continue Watching section hidden even when localStorage has incomplete progress entry', () => {
    // Entry missing required fields (duration, id, fileId) → validation rejects it
    localStorage.setItem(WATCH_PROGRESS_KEY, JSON.stringify({ 'movie:1': { position: 100 } }));
    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const sections = Array.from(compiled.querySelectorAll('h2'));
    const continueWatchingHeader = sections.find((h) =>
      h.textContent?.includes('Continue Watching'),
    );
    expect(continueWatchingHeader).toBeFalsy();
  });

  it('should show Continue Watching section when localStorage has valid in-progress entry', async () => {
    localStorage.setItem(
      WATCH_PROGRESS_KEY,
      JSON.stringify(makeMovieProgress(1, 'Test Movie', 600, 3600, false)),
    );

    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [{ provide: LibraryService, useValue: mockLibraryService }, provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const sections = Array.from(el.querySelectorAll('h2'));
    const header = sections.find((h) => h.textContent?.includes('Continue Watching'));
    expect(header).toBeTruthy();
  });

  it('should hide Continue Watching section when all localStorage entries are watched', async () => {
    localStorage.setItem(
      WATCH_PROGRESS_KEY,
      JSON.stringify(makeMovieProgress(1, 'Test Movie', 3400, 3600, true)),
    );

    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [{ provide: LibraryService, useValue: mockLibraryService }, provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const sections = Array.from(el.querySelectorAll('h2'));
    const header = sections.find((h) => h.textContent?.includes('Continue Watching'));
    expect(header).toBeFalsy();
  });

  it('should link Continue Watching movie items to /play/:fileId', async () => {
    localStorage.setItem(
      WATCH_PROGRESS_KEY,
      JSON.stringify(makeMovieProgress(42, 'The Matrix', 1200, 8400, false)),
    );

    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [{ provide: LibraryService, useValue: mockLibraryService }, provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const sections = el.querySelectorAll('section.library-section');
    let cwSection: Element | null = null;
    sections.forEach((s) => {
      if (s.querySelector('h2')?.textContent?.includes('Continue Watching')) cwSection = s;
    });
    const anchor = cwSection!.querySelector('a.poster-grid__item') as HTMLAnchorElement;
    expect(anchor.getAttribute('href')).toContain('/play/42');
  });

  it('should link Continue Watching TV show items to /play/:lastEpisodeFileId', async () => {
    localStorage.setItem(
      WATCH_PROGRESS_KEY,
      JSON.stringify(makeTvProgress(1399, 77, 'Game of Thrones', 1200, 3600, false)),
    );

    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [{ provide: LibraryService, useValue: mockLibraryService }, provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const sections = el.querySelectorAll('section.library-section');
    let cwSection: Element | null = null;
    sections.forEach((s) => {
      if (s.querySelector('h2')?.textContent?.includes('Continue Watching')) cwSection = s;
    });
    const anchor = cwSection!.querySelector('a.poster-grid__item') as HTMLAnchorElement;
    expect(anchor.getAttribute('href')).toContain('/play/77');
  });

  it('should render progress bar on partially watched movie in Library section', async () => {
    localStorage.setItem(
      WATCH_PROGRESS_KEY,
      JSON.stringify(makeMovieProgress(1, 'Alien', 1800, 7200, false)),
    );
    (mockLibraryService.getMovies as ReturnType<typeof vi.fn>).mockReturnValue(
      of([makeMovieItem(1, 'Alien', null)]),
    );
    (mockLibraryService.getShows as ReturnType<typeof vi.fn>).mockReturnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [{ provide: LibraryService, useValue: mockLibraryService }, provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const sections = el.querySelectorAll('section.library-section');
    let librarySection: Element | null = null;
    sections.forEach((s) => {
      if (s.querySelector('h2')?.textContent?.includes('Library')) librarySection = s;
    });
    const progressBar = librarySection!.querySelector('.poster-grid__progress') as HTMLElement;
    expect(progressBar).toBeTruthy();
    expect(progressBar.style.width).toBe('25%');
  });

  it('should not render progress bar for watched movie in Library section and apply dimmed class', async () => {
    localStorage.setItem(
      WATCH_PROGRESS_KEY,
      JSON.stringify(makeMovieProgress(1, 'Alien', 7100, 7200, true)),
    );
    (mockLibraryService.getMovies as ReturnType<typeof vi.fn>).mockReturnValue(
      of([makeMovieItem(1, 'Alien', null)]),
    );
    (mockLibraryService.getShows as ReturnType<typeof vi.fn>).mockReturnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [{ provide: LibraryService, useValue: mockLibraryService }, provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const sections = el.querySelectorAll('section.library-section');
    let librarySection: Element | null = null;
    sections.forEach((s) => {
      if (s.querySelector('h2')?.textContent?.includes('Library')) librarySection = s;
    });
    expect(librarySection!.querySelector('.poster-grid__progress')).toBeFalsy();
    expect(librarySection!.querySelector('.poster-grid__image-wrap--watched')).toBeTruthy();
  });

  it('should not apply dimmed class to item with no localStorage entry', async () => {
    localStorage.clear();
    (mockLibraryService.getMovies as ReturnType<typeof vi.fn>).mockReturnValue(
      of([makeMovieItem(1, 'Alien', null)]),
    );
    (mockLibraryService.getShows as ReturnType<typeof vi.fn>).mockReturnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [{ provide: LibraryService, useValue: mockLibraryService }, provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const sections = el.querySelectorAll('section.library-section');
    let librarySection: Element | null = null;
    sections.forEach((s) => {
      if (s.querySelector('h2')?.textContent?.includes('Library')) librarySection = s;
    });
    expect(librarySection!.querySelector('.poster-grid__image-wrap--watched')).toBeFalsy();
    expect(librarySection!.querySelector('.poster-grid__progress')).toBeFalsy();
  });

  it('should use most recent episode for TV show Continue Watching entry', async () => {
    const now = Date.now();
    const record: Record<string, WatchProgressEntry> = {
      'tv:1399:10': {
        position: 3600,
        duration: 3600,
        watched: true,
        updatedAt: now - 10000,
        mediaType: 'tv',
        id: 1399,
        title: 'Game of Thrones',
        posterUrl: null,
        year: 2011,
        fileId: 10,
      },
      'tv:1399:20': {
        position: 600,
        duration: 3600,
        watched: false,
        updatedAt: now,
        mediaType: 'tv',
        id: 1399,
        title: 'Game of Thrones',
        posterUrl: null,
        year: 2011,
        fileId: 20,
      },
    };
    localStorage.setItem(WATCH_PROGRESS_KEY, JSON.stringify(record));

    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [{ provide: LibraryService, useValue: mockLibraryService }, provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    const sections = Array.from(el.querySelectorAll('h2'));
    const header = sections.find((h) => h.textContent?.includes('Continue Watching'));
    expect(header).toBeTruthy();

    const cwSection = Array.from(el.querySelectorAll('section.library-section')).find((s) =>
      s.querySelector('h2')?.textContent?.includes('Continue Watching'),
    );
    const anchor = cwSection!.querySelector('a.poster-grid__item') as HTMLAnchorElement;
    expect(anchor.getAttribute('href')).toContain('/play/20');
  });

  it('should ignore malformed localStorage entries and not throw', async () => {
    localStorage.setItem(WATCH_PROGRESS_KEY, '{ invalid json }');

    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [{ provide: LibraryService, useValue: mockLibraryService }, provideRouter([])],
    }).compileComponents();

    expect(() => TestBed.createComponent(HomeComponent)).not.toThrow();
  });

  it('should ignore entries missing watched, updatedAt, or mediaType fields', () => {
    localStorage.setItem(
      WATCH_PROGRESS_KEY,
      JSON.stringify({
        'movie:1': {
          position: 100,
          duration: 200,
          id: 1,
          fileId: 1,
        },
      }),
    );

    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const sections = Array.from(compiled.querySelectorAll('h2'));
    const continueWatchingHeader = sections.find((h) =>
      h.textContent?.includes('Continue Watching'),
    );
    expect(continueWatchingHeader).toBeFalsy();
  });

  it('should display recently added items', async () => {
    (mockLibraryService.getRecent as ReturnType<typeof vi.fn>).mockReturnValue(
      of([makeRecentItem(1, 'Movie A', 'movie'), makeRecentItem(2, 'Show B', 'tv')]),
    );

    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [{ provide: LibraryService, useValue: mockLibraryService }, provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    const sections = compiled.querySelectorAll('section.library-section');
    // Find Recently Added section (first visible section since Continue Watching is hidden)
    let recentSection: Element | null = null;
    sections.forEach((s) => {
      const header = s.querySelector('h2');
      if (header?.textContent?.includes('Recently Added')) {
        recentSection = s;
      }
    });

    expect(recentSection).toBeTruthy();
    const items = recentSection!.querySelectorAll('.poster-grid__item');
    expect(items.length).toBe(2);
  });

  it('should display library items sorted alphabetically', async () => {
    (mockLibraryService.getMovies as ReturnType<typeof vi.fn>).mockReturnValue(
      of([makeMovieItem(2, 'Zorro'), makeMovieItem(1, 'Alien')]),
    );
    (mockLibraryService.getShows as ReturnType<typeof vi.fn>).mockReturnValue(
      of([makeShowItem(10, 'Breaking Bad')]),
    );

    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [{ provide: LibraryService, useValue: mockLibraryService }, provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    const sections = compiled.querySelectorAll('section.library-section');
    let librarySection: Element | null = null;
    sections.forEach((s) => {
      const header = s.querySelector('h2');
      if (header?.textContent?.includes('Library')) {
        librarySection = s;
      }
    });

    expect(librarySection).toBeTruthy();
    const titles = Array.from(librarySection!.querySelectorAll('.poster-grid__title')).map((el) =>
      el.textContent?.trim(),
    );
    expect(titles).toEqual(['Alien', 'Breaking Bad', 'Zorro']);
  });

  it('should render a labeled search input for the Library section', async () => {
    (mockLibraryService.getMovies as ReturnType<typeof vi.fn>).mockReturnValue(
      of([makeMovieItem(1, 'Alien')]),
    );
    (mockLibraryService.getShows as ReturnType<typeof vi.fn>).mockReturnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [{ provide: LibraryService, useValue: mockLibraryService }, provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    const label = compiled.querySelector('label[for="library-search"]');
    const input = compiled.querySelector('#library-search') as HTMLInputElement | null;

    expect(label?.textContent?.trim()).toBe('Search library');
    expect(input).toBeTruthy();
    expect(input?.type).toBe('search');
  });

  it('should filter only Library section items using case-insensitive partial matching', async () => {
    (mockLibraryService.getMovies as ReturnType<typeof vi.fn>).mockReturnValue(
      of([makeMovieItem(1, 'Alien'), makeMovieItem(2, 'Arrival')]),
    );
    (mockLibraryService.getShows as ReturnType<typeof vi.fn>).mockReturnValue(
      of([makeShowItem(10, 'The Bear')]),
    );

    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [{ provide: LibraryService, useValue: mockLibraryService }, provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const input = compiled.querySelector('#library-search') as HTMLInputElement;

    input.value = 'ALI';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const librarySection = getSectionByHeading(compiled, 'Library');
    expect(getSectionTitles(librarySection!)).toEqual(['Alien']);
  });

  it('should restore the full Library grid when the search query is cleared', async () => {
    (mockLibraryService.getMovies as ReturnType<typeof vi.fn>).mockReturnValue(
      of([makeMovieItem(1, 'Alien'), makeMovieItem(2, 'Arrival')]),
    );
    (mockLibraryService.getShows as ReturnType<typeof vi.fn>).mockReturnValue(
      of([makeShowItem(10, 'The Bear')]),
    );

    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [{ provide: LibraryService, useValue: mockLibraryService }, provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const input = compiled.querySelector('#library-search') as HTMLInputElement;

    input.value = 'arr';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    input.value = '';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const librarySection = getSectionByHeading(compiled, 'Library');
    expect(getSectionTitles(librarySection!)).toEqual(['Alien', 'Arrival', 'The Bear']);
  });

  it('should keep Continue Watching and Recently Added visible while Library is filtered', async () => {
    localStorage.setItem(
      WATCH_PROGRESS_KEY,
      JSON.stringify(makeMovieProgress(1, 'Alien', 1800, 7200, false)),
    );
    (mockLibraryService.getMovies as ReturnType<typeof vi.fn>).mockReturnValue(
      of([makeMovieItem(1, 'Alien'), makeMovieItem(2, 'Arrival')]),
    );
    (mockLibraryService.getShows as ReturnType<typeof vi.fn>).mockReturnValue(
      of([makeShowItem(10, 'The Bear')]),
    );
    (mockLibraryService.getRecent as ReturnType<typeof vi.fn>).mockReturnValue(
      of([makeRecentItem(3, 'Recent Movie', 'movie')]),
    );

    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [{ provide: LibraryService, useValue: mockLibraryService }, provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const input = compiled.querySelector('#library-search') as HTMLInputElement;

    input.value = 'bear';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(getSectionByHeading(compiled, 'Continue Watching')).toBeTruthy();
    expect(getSectionTitles(getSectionByHeading(compiled, 'Recently Added')!)).toEqual([
      'Recent Movie',
    ]);
    expect(getSectionTitles(getSectionByHeading(compiled, 'Library')!)).toEqual(['The Bear']);
  });

  it('should show an empty state when an active search has no Library matches', async () => {
    (mockLibraryService.getMovies as ReturnType<typeof vi.fn>).mockReturnValue(
      of([makeMovieItem(1, 'Alien')]),
    );
    (mockLibraryService.getShows as ReturnType<typeof vi.fn>).mockReturnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [{ provide: LibraryService, useValue: mockLibraryService }, provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const input = compiled.querySelector('#library-search') as HTMLInputElement;

    input.value = 'matrix';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const librarySection = getSectionByHeading(compiled, 'Library');
    expect(librarySection?.textContent).toContain('No titles match your search.');
    expect(getSectionTitles(librarySection!)).toEqual([]);
  });

  it('should search TV items by show title only', async () => {
    (mockLibraryService.getMovies as ReturnType<typeof vi.fn>).mockReturnValue(of([]));
    (mockLibraryService.getShows as ReturnType<typeof vi.fn>).mockReturnValue(
      of([makeShowItem(10, 'The Last of Us')]),
    );

    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [{ provide: LibraryService, useValue: mockLibraryService }, provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const input = compiled.querySelector('#library-search') as HTMLInputElement;

    input.value = 'episode';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(getSectionTitles(getSectionByHeading(compiled, 'Library')!)).toEqual([]);

    input.value = 'last';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(getSectionTitles(getSectionByHeading(compiled, 'Library')!)).toEqual(['The Last of Us']);
  });

  it('should render poster items as <a> elements with correct routerLink for movies', async () => {
    (mockLibraryService.getRecent as ReturnType<typeof vi.fn>).mockReturnValue(
      of([makeRecentItem(5, 'Test Movie', 'movie')]),
    );

    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [{ provide: LibraryService, useValue: mockLibraryService }, provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    const sections = compiled.querySelectorAll('section.library-section');
    let recentSection: Element | null = null;
    sections.forEach((s) => {
      if (s.querySelector('h2')?.textContent?.includes('Recently Added')) {
        recentSection = s;
      }
    });

    const anchor = recentSection!.querySelector('a.poster-grid__item') as HTMLAnchorElement;
    expect(anchor).toBeTruthy();
    expect(anchor.getAttribute('href')).toContain('/movie/5');
  });

  it('should render TV show posters linking to /show/:id', async () => {
    (mockLibraryService.getRecent as ReturnType<typeof vi.fn>).mockReturnValue(
      of([makeRecentItem(99, 'Test Show', 'tv')]),
    );

    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [{ provide: LibraryService, useValue: mockLibraryService }, provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    const sections = compiled.querySelectorAll('section.library-section');
    let recentSection: Element | null = null;
    sections.forEach((s) => {
      if (s.querySelector('h2')?.textContent?.includes('Recently Added')) {
        recentSection = s;
      }
    });

    const anchor = recentSection!.querySelector('a.poster-grid__item') as HTMLAnchorElement;
    expect(anchor).toBeTruthy();
    expect(anchor.getAttribute('href')).toContain('/show/99');
  });

  it('should render images with loading=lazy attribute', async () => {
    (mockLibraryService.getMovies as ReturnType<typeof vi.fn>).mockReturnValue(
      of([makeMovieItem(1, 'Film', 'https://example.com/poster.jpg')]),
    );
    (mockLibraryService.getShows as ReturnType<typeof vi.fn>).mockReturnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [{ provide: LibraryService, useValue: mockLibraryService }, provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    const sections = compiled.querySelectorAll('section.library-section');
    let librarySection: Element | null = null;
    sections.forEach((s) => {
      if (s.querySelector('h2')?.textContent?.includes('Library')) {
        librarySection = s;
      }
    });

    const img = librarySection!.querySelector('img') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.getAttribute('loading')).toBe('lazy');
  });

  it('should render fallback div when poster_url is null', async () => {
    (mockLibraryService.getMovies as ReturnType<typeof vi.fn>).mockReturnValue(
      of([makeMovieItem(1, 'No Poster Movie', null)]),
    );
    (mockLibraryService.getShows as ReturnType<typeof vi.fn>).mockReturnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [{ provide: LibraryService, useValue: mockLibraryService }, provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    const sections = compiled.querySelectorAll('section.library-section');
    let librarySection: Element | null = null;
    sections.forEach((s) => {
      if (s.querySelector('h2')?.textContent?.includes('Library')) {
        librarySection = s;
      }
    });

    expect(librarySection!.querySelector('.poster-grid__image--fallback')).toBeTruthy();
    expect(librarySection!.querySelector('img')).toBeFalsy();
  });

  it('should call getMovies, getShows, and getRecent on init', () => {
    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    expect(mockLibraryService.getMovies).toHaveBeenCalled();
    expect(mockLibraryService.getShows).toHaveBeenCalled();
    expect(mockLibraryService.getRecent).toHaveBeenCalled();
  });
});
