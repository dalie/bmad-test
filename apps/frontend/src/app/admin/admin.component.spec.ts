import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { AdminComponent } from './admin.component';
import { AdminStatsService, AdminStats } from './admin-stats.service';

const mockStats: AdminStats = {
  library: { totalTitles: 20, movieCount: 15, tvShowCount: 5 },
  transcode: {
    byTier: { tier1: 10, tier2: 7, tier3: 3 },
    byStatus: { ready: 0, queued: 4, processing: 2, failed: 1, completed: 8 },
  },
  pipeline: { discovered: 3, probed: 2, matched: 12, unmatched: 1, totalErrors: 2 },
};

describe('AdminComponent', () => {
  let mockAdminStatsService: { getStats: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockAdminStatsService = {
      getStats: vi.fn().mockReturnValue(of(mockStats)),
    };

    await TestBed.configureTestingModule({
      imports: [AdminComponent],
      providers: [{ provide: AdminStatsService, useValue: mockAdminStatsService }],
    }).compileComponents();
  });

  it('should create the component', () => {
    const fixture = TestBed.createComponent(AdminComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render library statistics when data loads', () => {
    const fixture = TestBed.createComponent(AdminComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain('20');
    expect(compiled.textContent).toContain('15');
    expect(compiled.textContent).toContain('5');
    expect(compiled.textContent).toContain('Total Titles');
    expect(compiled.textContent).toContain('Movies');
    expect(compiled.textContent).toContain('TV Shows');
  });

  it('should show transcode breakdown', () => {
    const fixture = TestBed.createComponent(AdminComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain('Transcode Status');
    expect(compiled.textContent).toContain('10');
    expect(compiled.textContent).toContain('7');
    expect(compiled.textContent).toContain('3');
    expect(compiled.textContent).toContain('Queued');
    expect(compiled.textContent).toContain('Processing');
    expect(compiled.textContent).toContain('Completed');
    expect(compiled.textContent).toContain('Failed');
  });

  it('should show import pipeline summary', () => {
    const fixture = TestBed.createComponent(AdminComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain('Import Pipeline');
    expect(compiled.textContent).toContain('Discovered');
    expect(compiled.textContent).toContain('Probed');
    expect(compiled.textContent).toContain('Matched');
    expect(compiled.textContent).toContain('Unmatched');
    expect(compiled.textContent).toContain('Total Errors');
  });

  it('should show loading state when stats are not yet available', async () => {
    mockAdminStatsService.getStats.mockReturnValue(of(undefined));

    await TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [AdminComponent],
      providers: [{ provide: AdminStatsService, useValue: mockAdminStatsService }],
    }).compileComponents();

    const fixture = TestBed.createComponent(AdminComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain('Loading statistics...');
  });
});
