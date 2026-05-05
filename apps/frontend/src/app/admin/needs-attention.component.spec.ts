import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NeedsAttentionComponent } from './needs-attention.component';

describe('NeedsAttentionComponent', () => {
  let component: NeedsAttentionComponent;
  let fixture: ComponentFixture<NeedsAttentionComponent>;
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NeedsAttentionComponent],
      providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(NeedsAttentionComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should create', () => {
    httpTesting.expectOne('/api/library/unmatched').flush({
      items: [],
      total: 0,
      offset: 0,
      limit: 50,
    });
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should render unmatched files list', () => {
    httpTesting.expectOne('/api/library/unmatched').flush({
      items: [
        {
          id: 1,
          filename: 'unknown-movie.mkv',
          path: '/media/movies/unknown-movie.mkv',
          source_type: 'movies',
          error_message: 'No TMDB match found',
          created_at: '2026-05-01T10:00:00',
        },
      ],
      total: 1,
      offset: 0,
      limit: 50,
    });
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('unknown-movie.mkv');
    expect(compiled.textContent).toContain('No TMDB match found');
  });

  it('should trigger TMDB search and display results', () => {
    httpTesting.expectOne('/api/library/unmatched').flush({
      items: [
        {
          id: 5,
          filename: 'mystery.mkv',
          path: '/media/movies/mystery.mkv',
          source_type: 'movies',
          error_message: null,
          created_at: '2026-05-01T10:00:00',
        },
      ],
      total: 1,
      offset: 0,
      limit: 50,
    });
    fixture.detectChanges();

    // Simulate search
    component.searchQueries.update((q) => ({ ...q, [5]: 'Mystery Movie' }));
    component.search(5);

    const searchReq = httpTesting.expectOne('/api/tmdb/search?query=Mystery%20Movie&type=movie');
    expect(searchReq.request.method).toBe('GET');
    searchReq.flush({
      results: [
        { id: 100, title: 'Mystery Movie', release_date: '2025', overview: '', poster_path: null },
      ],
    });

    fixture.detectChanges();
    expect(component.getSearchResults(5).length).toBe(1);
    expect(component.getSearchResults(5)[0].title).toBe('Mystery Movie');
  });

  it('should call match endpoint on match button click', () => {
    httpTesting.expectOne('/api/library/unmatched').flush({
      items: [
        {
          id: 7,
          filename: 'file.mkv',
          path: '/media/movies/file.mkv',
          source_type: 'movies',
          error_message: null,
          created_at: '2026-05-01T10:00:00',
        },
      ],
      total: 1,
      offset: 0,
      limit: 50,
    });
    fixture.detectChanges();

    component.match(7, 200);

    const matchReq = httpTesting.expectOne('/api/library/files/7/match');
    expect(matchReq.request.method).toBe('POST');
    expect(matchReq.request.body).toEqual({ tmdbId: 200 });
    matchReq.flush({
      status: 'matched',
      metadata: { title: 'Test', tmdb_id: 200, poster_path: null },
    });

    expect(component.matchSuccess()[7]).toBe(true);
  });
});
