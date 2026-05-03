import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { HomeComponent, WATCH_PROGRESS_KEY } from './home.component';
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

function makeRecentItem(id: number, title: string, media_type: 'movie' | 'tv', poster_url: string | null = null) {
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
    const continueWatchingHeader = sections.find(h => h.textContent?.includes('Continue Watching'));
    expect(continueWatchingHeader).toBeFalsy();
  });

  it('should show Continue Watching section hidden even when localStorage has progress key', () => {
    // readContinueWatchingFromStorage() currently returns [] always (stub for story 4-5)
    localStorage.setItem(WATCH_PROGRESS_KEY, JSON.stringify({ 'movie:1': { position: 100 } }));
    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const sections = Array.from(compiled.querySelectorAll('h2'));
    const continueWatchingHeader = sections.find(h => h.textContent?.includes('Continue Watching'));
    // Section hidden because continueWatchingItems is always [] in this story
    expect(continueWatchingHeader).toBeFalsy();
  });

  it('should display recently added items', async () => {
    (mockLibraryService.getRecent as ReturnType<typeof vi.fn>).mockReturnValue(
      of([makeRecentItem(1, 'Movie A', 'movie'), makeRecentItem(2, 'Show B', 'tv')])
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
    const compiled = fixture.nativeElement as HTMLElement;

    const sections = compiled.querySelectorAll('section.library-section');
    // Find Recently Added section (first visible section since Continue Watching is hidden)
    let recentSection: Element | null = null;
    sections.forEach(s => {
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
      of([makeMovieItem(2, 'Zorro'), makeMovieItem(1, 'Alien')])
    );
    (mockLibraryService.getShows as ReturnType<typeof vi.fn>).mockReturnValue(
      of([makeShowItem(10, 'Breaking Bad')])
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
    const compiled = fixture.nativeElement as HTMLElement;

    const sections = compiled.querySelectorAll('section.library-section');
    let librarySection: Element | null = null;
    sections.forEach(s => {
      const header = s.querySelector('h2');
      if (header?.textContent?.includes('Library')) {
        librarySection = s;
      }
    });

    expect(librarySection).toBeTruthy();
    const titles = Array.from(librarySection!.querySelectorAll('.poster-grid__title')).map(
      el => el.textContent?.trim()
    );
    expect(titles).toEqual(['Alien', 'Breaking Bad', 'Zorro']);
  });

  it('should render poster items as <a> elements with correct routerLink for movies', async () => {
    (mockLibraryService.getRecent as ReturnType<typeof vi.fn>).mockReturnValue(
      of([makeRecentItem(5, 'Test Movie', 'movie')])
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
    const compiled = fixture.nativeElement as HTMLElement;

    const sections = compiled.querySelectorAll('section.library-section');
    let recentSection: Element | null = null;
    sections.forEach(s => {
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
      of([makeRecentItem(99, 'Test Show', 'tv')])
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
    const compiled = fixture.nativeElement as HTMLElement;

    const sections = compiled.querySelectorAll('section.library-section');
    let recentSection: Element | null = null;
    sections.forEach(s => {
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
      of([makeMovieItem(1, 'Film', 'https://example.com/poster.jpg')])
    );
    (mockLibraryService.getShows as ReturnType<typeof vi.fn>).mockReturnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        { provide: LibraryService, useValue: mockLibraryService },
        provideRouter([]),
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    const sections = compiled.querySelectorAll('section.library-section');
    let librarySection: Element | null = null;
    sections.forEach(s => {
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
      of([makeMovieItem(1, 'No Poster Movie', null)])
    );
    (mockLibraryService.getShows as ReturnType<typeof vi.fn>).mockReturnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        { provide: LibraryService, useValue: mockLibraryService },
        provideRouter([]),
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    const sections = compiled.querySelectorAll('section.library-section');
    let librarySection: Element | null = null;
    sections.forEach(s => {
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
