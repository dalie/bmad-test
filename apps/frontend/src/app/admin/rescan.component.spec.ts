import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { RescanComponent } from './rescan.component';
import { ScanStatus } from './admin-rescan.service';
import { vi, beforeEach, afterEach, describe, it, expect } from 'vitest';

describe('RescanComponent', () => {
  let component: RescanComponent;
  let fixture: ComponentFixture<RescanComponent>;
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    vi.useFakeTimers();

    await TestBed.configureTestingModule({
      imports: [RescanComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(RescanComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers();
    httpTesting.verify();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have a "Rescan Library" button that triggers service call', () => {
    const btn = fixture.nativeElement.querySelector('.rescan-btn') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(btn.textContent).toContain('Rescan Library');

    btn.click();

    const req = httpTesting.expectOne('/api/admin/rescan');
    expect(req.request.method).toBe('POST');
    req.flush({ scanId: 'test-scan-id' });
  });

  it('should disable button during active scan', () => {
    const btn = fixture.nativeElement.querySelector('.rescan-btn') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);

    btn.click();

    const req = httpTesting.expectOne('/api/admin/rescan');
    req.flush({ scanId: 'test-scan-id' });
    fixture.detectChanges();

    expect(btn.disabled).toBe(true);

    // First poll
    vi.advanceTimersByTime(2000);
    const statusReq = httpTesting.expectOne('/api/admin/rescan/test-scan-id');
    statusReq.flush({
      id: 'test-scan-id',
      status: 'completed',
      startedAt: '2026-05-05T10:00:00.000Z',
      completedAt: '2026-05-05T10:00:05.000Z',
      discovered: 10,
      processed: 10,
      failed: 0,
      errors: [],
    } as ScanStatus);
    fixture.detectChanges();

    expect(btn.disabled).toBe(false);
  });

  it('should display progress with discovered/processed counts', () => {
    const btn = fixture.nativeElement.querySelector('.rescan-btn') as HTMLButtonElement;
    btn.click();

    const req = httpTesting.expectOne('/api/admin/rescan');
    req.flush({ scanId: 'scan-progress' });
    fixture.detectChanges();

    vi.advanceTimersByTime(2000);
    const statusReq = httpTesting.expectOne('/api/admin/rescan/scan-progress');
    statusReq.flush({
      id: 'scan-progress',
      status: 'in_progress',
      startedAt: '2026-05-05T10:00:00.000Z',
      completedAt: null,
      discovered: 25,
      processed: 12,
      failed: 0,
      errors: [],
    } as ScanStatus);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('25');
    expect(compiled.textContent).toContain('12');

    // Complete the scan to stop polling
    vi.advanceTimersByTime(2000);
    const finalReq = httpTesting.expectOne('/api/admin/rescan/scan-progress');
    finalReq.flush({
      id: 'scan-progress',
      status: 'completed',
      startedAt: '2026-05-05T10:00:00.000Z',
      completedAt: '2026-05-05T10:00:10.000Z',
      discovered: 25,
      processed: 25,
      failed: 0,
      errors: [],
    } as ScanStatus);
    fixture.detectChanges();
  });

  it('should stop polling on completion', () => {
    const btn = fixture.nativeElement.querySelector('.rescan-btn') as HTMLButtonElement;
    btn.click();

    const req = httpTesting.expectOne('/api/admin/rescan');
    req.flush({ scanId: 'scan-done' });
    fixture.detectChanges();

    vi.advanceTimersByTime(2000);
    const statusReq = httpTesting.expectOne('/api/admin/rescan/scan-done');
    statusReq.flush({
      id: 'scan-done',
      status: 'completed',
      startedAt: '2026-05-05T10:00:00.000Z',
      completedAt: '2026-05-05T10:00:05.000Z',
      discovered: 10,
      processed: 10,
      failed: 0,
      errors: [],
    } as ScanStatus);
    fixture.detectChanges();

    // After completion, no more polling requests
    vi.advanceTimersByTime(2000);
    httpTesting.expectNone('/api/admin/rescan/scan-done');
  });
});
