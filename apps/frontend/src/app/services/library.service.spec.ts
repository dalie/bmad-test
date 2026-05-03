import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { LibraryService, MovieListItem, ShowListItem, RecentItem } from './library.service';

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

  afterEach(() => {
    httpController.verify();
  });

  describe('getMovies()', () => {
    it('should send GET to /api/library/movies', () => {
      const mockMovies: MovieListItem[] = [
        {
          id: 1,
          title: 'Test Movie',
          year: 2024,
          poster_url: null,
          runtime: 120,
          rating: 7.5,
          added_at: '2024-01-01',
          transcode_tier: 1,
          playback_ready: true,
        },
      ];

      service.getMovies().subscribe(movies => {
        expect(movies).toEqual(mockMovies);
      });

      const req = httpController.expectOne('/api/library/movies');
      expect(req.request.method).toBe('GET');
      req.flush(mockMovies);
    });
  });

  describe('getShows()', () => {
    it('should send GET to /api/library/shows and return ShowListItem[]', () => {
      const mockShows: ShowListItem[] = [
        {
          id: 12345,
          title: 'Test Show',
          year: 2023,
          poster_url: null,
          rating: 8.2,
          season_count: 3,
          added_at: '2024-01-02',
        },
      ];

      service.getShows().subscribe(shows => {
        expect(shows).toEqual(mockShows);
      });

      const req = httpController.expectOne('/api/library/shows');
      expect(req.request.method).toBe('GET');
      req.flush(mockShows);
    });
  });

  describe('getRecent()', () => {
    it('should send GET to /api/library/recent with default limit of 20', () => {
      const mockRecent: RecentItem[] = [
        {
          id: 1,
          title: 'Recent Movie',
          year: 2024,
          poster_url: null,
          rating: 7.0,
          media_type: 'movie',
          added_at: '2024-01-03',
        },
      ];

      service.getRecent().subscribe(items => {
        expect(items).toEqual(mockRecent);
      });

      const req = httpController.expectOne(r => r.url === '/api/library/recent');
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('limit')).toBe('20');
      req.flush(mockRecent);
    });

    it('should send GET to /api/library/recent with custom limit of 5', () => {
      service.getRecent(5).subscribe();

      const req = httpController.expectOne(r => r.url === '/api/library/recent');
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('limit')).toBe('5');
      req.flush([]);
    });
  });
});
