import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import {
  AdminJobsService,
  PipelineMonitorStatus,
  FailedJobSummary,
  JobDetail,
} from './admin-jobs.service';

describe('AdminJobsService', () => {
  let service: AdminJobsService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()],
    });
    service = TestBed.inject(AdminJobsService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should call GET /api/admin/pipeline for getPipelineStatus', () => {
    const mockStatus: PipelineMonitorStatus = {
      transcode: { queued: 2, processing: 1, completed: 5, failed: 1 },
      scanErrors: 3,
      probeFailures: 1,
      matchFailures: 1,
    };

    service.getPipelineStatus().subscribe((result) => {
      expect(result).toEqual(mockStatus);
    });

    const req = httpTesting.expectOne('/api/admin/pipeline');
    expect(req.request.method).toBe('GET');
    req.flush(mockStatus);
  });

  it('should call GET /api/admin/jobs for getFailedJobs', () => {
    const mockJobs: FailedJobSummary[] = [
      {
        id: '1',
        filename: 'test.mkv',
        stage: 'transcode',
        errorMessage: 'error',
        timestamp: '2026-05-05T10:00:00',
        retryable: true,
      },
    ];

    service.getFailedJobs().subscribe((result) => {
      expect(result).toEqual(mockJobs);
    });

    const req = httpTesting.expectOne('/api/admin/jobs');
    expect(req.request.method).toBe('GET');
    req.flush(mockJobs);
  });

  it('should call GET /api/admin/jobs/:id for getJobDetails', () => {
    const mockDetail: JobDetail = {
      id: '1',
      filename: 'test.mkv',
      filePath: '/media/test.mkv',
      stage: 'transcode',
      tier: 3,
      status: 'failed',
      errorMessage: 'error',
      errorDetails: 'stack trace',
      createdAt: '2026-05-05T09:00:00',
      updatedAt: '2026-05-05T10:00:00',
    };

    service.getJobDetails('1').subscribe((result) => {
      expect(result).toEqual(mockDetail);
    });

    const req = httpTesting.expectOne('/api/admin/jobs/1');
    expect(req.request.method).toBe('GET');
    req.flush(mockDetail);
  });

  it('should call POST /api/admin/jobs/:id/retry for retryJob', () => {
    service.retryJob('5').subscribe((result) => {
      expect(result).toEqual({ success: true });
    });

    const req = httpTesting.expectOne('/api/admin/jobs/5/retry');
    expect(req.request.method).toBe('POST');
    req.flush({ success: true });
  });
});
