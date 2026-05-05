import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AdminStatsService, AdminStats } from './admin-stats.service';

describe('AdminStatsService', () => {
  let service: AdminStatsService;
  let httpController: HttpTestingController;

  const mockStats: AdminStats = {
    library: { totalTitles: 20, movieCount: 15, tvShowCount: 5 },
    transcode: {
      byTier: { tier1: 10, tier2: 7, tier3: 3 },
      byStatus: { ready: 0, queued: 4, processing: 2, failed: 1, completed: 8 },
    },
    pipeline: { discovered: 3, probed: 2, matched: 12, unmatched: 1, totalErrors: 2 },
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [AdminStatsService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AdminStatsService);
    httpController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpController.verify();
  });

  it('should call GET /api/admin/stats and return stats', () => {
    service.getStats().subscribe((stats) => {
      expect(stats).toEqual(mockStats);
    });

    const req = httpController.expectOne('/api/admin/stats');
    expect(req.request.method).toBe('GET');
    req.flush(mockStats);
  });
});
