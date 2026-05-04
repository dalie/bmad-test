import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';
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

  it('should show "Show not found." when API returns an error', async () => {
    mockLibraryService.getShowById = vi.fn().mockReturnValue(throwError(() => new Error('404')));
    const fixture = TestBed.createComponent(ShowDetailComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.detail-not-found')?.textContent?.trim()).toBe('Show not found.');
  });

  describe('with non-numeric route id', () => {
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
          { provide: ActivatedRoute, useValue: makeActivatedRouteStub('abc') },
          { provide: LibraryService, useValue: mockLibraryService },
        ],
      }).compileComponents();
    });

    it('should not call getShowById when route id is non-numeric', async () => {
      const fixture = TestBed.createComponent(ShowDetailComponent);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(mockLibraryService.getShowById).not.toHaveBeenCalled();
    });
  });

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

  describe('formatRating', () => {
    it('should format to one decimal', () => {
      const comp = TestBed.createComponent(ShowDetailComponent).componentInstance;
      expect(comp.formatRating(9.2)).toBe('9.2');
      expect(comp.formatRating(7)).toBe('7.0');
      expect(comp.formatRating(null)).toBe('');
    });
  });
});
