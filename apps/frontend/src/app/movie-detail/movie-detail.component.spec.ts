import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { MovieDetailComponent } from './movie-detail.component';
import { LibraryService, MovieDetail } from '../services/library.service';

const MOCK_MOVIE: MovieDetail = {
  id: 1,
  title: 'Inception',
  description: 'A thief who steals corporate secrets through the use of dream-sharing technology.',
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

function makeActivatedRouteStub(id: string) {
  const paramMap = convertToParamMap({ id });
  return {
    snapshot: { paramMap },
    paramMap: of(paramMap),
  };
}

describe('MovieDetailComponent', () => {
  let mockLibraryService: Pick<LibraryService, 'getMovieById'>;

  beforeEach(async () => {
    mockLibraryService = {
      getMovieById: vi.fn().mockReturnValue(of(MOCK_MOVIE)),
    };

    await TestBed.configureTestingModule({
      imports: [MovieDetailComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: makeActivatedRouteStub('1') },
        { provide: LibraryService, useValue: mockLibraryService },
      ],
    }).compileComponents();
  });

  it('should create the component', () => {
    const fixture = TestBed.createComponent(MovieDetailComponent);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  it('should call getMovieById with the route id', async () => {
    const fixture = TestBed.createComponent(MovieDetailComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(mockLibraryService.getMovieById).toHaveBeenCalledWith(1);
  });

  it('should render movie title when API returns data', async () => {
    const fixture = TestBed.createComponent(MovieDetailComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.detail-title')?.textContent?.trim()).toBe('Inception');
  });

  it('should render back link', () => {
    const fixture = TestBed.createComponent(MovieDetailComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const backLink = compiled.querySelector('.back-link');
    expect(backLink).toBeTruthy();
    expect(backLink?.textContent?.trim()).toContain('Back to Library');
  });

  describe('formatRuntime', () => {
    it('should format minutes to Xh Ym', () => {
      const comp = TestBed.createComponent(MovieDetailComponent).componentInstance;
      expect(comp.formatRuntime(148)).toBe('2h 28m');
    });

    it('should format minutes below one hour', () => {
      const comp = TestBed.createComponent(MovieDetailComponent).componentInstance;
      expect(comp.formatRuntime(45)).toBe('45m');
    });

    it('should format exactly one hour', () => {
      const comp = TestBed.createComponent(MovieDetailComponent).componentInstance;
      expect(comp.formatRuntime(60)).toBe('1h 0m');
    });

    it('should return empty string for null', () => {
      const comp = TestBed.createComponent(MovieDetailComponent).componentInstance;
      expect(comp.formatRuntime(null)).toBe('');
    });
  });

  describe('formatRating', () => {
    it('should format to one decimal', () => {
      const comp = TestBed.createComponent(MovieDetailComponent).componentInstance;
      expect(comp.formatRating(8.8)).toBe('8.8');
    });

    it('should format whole numbers with trailing zero', () => {
      const comp = TestBed.createComponent(MovieDetailComponent).componentInstance;
      expect(comp.formatRating(7)).toBe('7.0');
    });

    it('should return empty string for null', () => {
      const comp = TestBed.createComponent(MovieDetailComponent).componentInstance;
      expect(comp.formatRating(null)).toBe('');
    });
  });
});
