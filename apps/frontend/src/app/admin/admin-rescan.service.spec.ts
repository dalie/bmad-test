import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AdminRescanService, ScanStatus } from './admin-rescan.service';

describe('AdminRescanService', () => {
  let service: AdminRescanService;
  let httpController: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [AdminRescanService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AdminRescanService);
    httpController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpController.verify();
  });

  it('should call POST /api/admin/rescan and return scanId', () => {
    service.triggerRescan().subscribe((result) => {
      expect(result).toEqual({ scanId: 'abc-123' });
    });

    const req = httpController.expectOne('/api/admin/rescan');
    expect(req.request.method).toBe('POST');
    req.flush({ scanId: 'abc-123' });
  });

  it('should call GET /api/admin/rescan/:scanId and return status', () => {
    const mockStatus: ScanStatus = {
      id: 'abc-123',
      status: 'in_progress',
      startedAt: '2026-05-05T10:00:00.000Z',
      completedAt: null,
      discovered: 10,
      processed: 5,
      failed: 0,
      errors: [],
    };

    service.getScanStatus('abc-123').subscribe((status) => {
      expect(status).toEqual(mockStatus);
    });

    const req = httpController.expectOne('/api/admin/rescan/abc-123');
    expect(req.request.method).toBe('GET');
    req.flush(mockStatus);
  });
});
