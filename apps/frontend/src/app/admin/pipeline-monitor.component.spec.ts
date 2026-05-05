import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PipelineMonitorComponent } from './pipeline-monitor.component';

describe('PipelineMonitorComponent', () => {
  let component: PipelineMonitorComponent;
  let fixture: ComponentFixture<PipelineMonitorComponent>;
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PipelineMonitorComponent],
      providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(PipelineMonitorComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should create', () => {
    // Flush expected requests
    httpTesting.expectOne('/api/admin/pipeline').flush({
      transcode: { queued: 0, processing: 0, completed: 0, failed: 0 },
      scanErrors: 0,
      probeFailures: 0,
      matchFailures: 0,
    });
    httpTesting.expectOne('/api/admin/jobs').flush([]);
    fixture.detectChanges();

    expect(component).toBeTruthy();
  });

  it('should render pipeline status counts', () => {
    httpTesting.expectOne('/api/admin/pipeline').flush({
      transcode: { queued: 3, processing: 1, completed: 10, failed: 2 },
      scanErrors: 4,
      probeFailures: 1,
      matchFailures: 1,
    });
    httpTesting.expectOne('/api/admin/jobs').flush([]);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const values = compiled.querySelectorAll('.stat-value');
    expect(values.length).toBe(4);
    expect(values[0].textContent).toContain('3'); // queued
    expect(values[3].textContent).toContain('2'); // failed
  });

  it('should render failed jobs table', () => {
    httpTesting.expectOne('/api/admin/pipeline').flush({
      transcode: { queued: 0, processing: 0, completed: 0, failed: 1 },
      scanErrors: 0,
      probeFailures: 0,
      matchFailures: 0,
    });
    httpTesting.expectOne('/api/admin/jobs').flush([
      {
        id: '1',
        filename: 'movie.mkv',
        stage: 'transcode',
        errorMessage: 'ffmpeg error',
        timestamp: '2026-05-05T10:00:00',
        retryable: true,
      },
    ]);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const rows = compiled.querySelectorAll('.jobs-table tbody tr');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('movie.mkv');
    expect(rows[0].textContent).toContain('transcode');
  });

  it('should trigger retry on button click', () => {
    httpTesting.expectOne('/api/admin/pipeline').flush({
      transcode: { queued: 0, processing: 0, completed: 0, failed: 1 },
      scanErrors: 0,
      probeFailures: 0,
      matchFailures: 0,
    });
    httpTesting.expectOne('/api/admin/jobs').flush([
      {
        id: '42',
        filename: 'retry.mkv',
        stage: 'transcode',
        errorMessage: 'error',
        timestamp: '2026-05-05T10:00:00',
        retryable: true,
      },
    ]);
    fixture.detectChanges();

    const btn = fixture.nativeElement.querySelector('.btn-retry') as HTMLButtonElement;
    expect(btn).toBeTruthy();

    btn.click();

    const retryReq = httpTesting.expectOne('/api/admin/jobs/42/retry');
    expect(retryReq.request.method).toBe('POST');
  });
});
