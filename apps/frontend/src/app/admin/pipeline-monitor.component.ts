import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of, Subject, switchMap, startWith } from 'rxjs';
import {
  AdminJobsService,
  FailedJobSummary,
  JobDetail,
  PipelineMonitorStatus,
} from './admin-jobs.service';

@Component({
  selector: 'app-pipeline-monitor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="monitor-section">
      <h2>Pipeline Status</h2>
      @if (pipelineStatus()) {
        <div class="status-grid">
          <div class="stat-card">
            <span class="stat-value">{{ pipelineStatus()!.transcode.queued }}</span>
            <span class="stat-label">Queued</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{{ pipelineStatus()!.transcode.processing }}</span>
            <span class="stat-label">Processing</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{{ pipelineStatus()!.transcode.completed }}</span>
            <span class="stat-label">Completed</span>
          </div>
          <div class="stat-card stat-card--error">
            <span class="stat-value">{{ pipelineStatus()!.transcode.failed }}</span>
            <span class="stat-label">Failed</span>
          </div>
        </div>
        <div class="error-summary">
          <span>Scan Errors: {{ pipelineStatus()!.scanErrors }}</span>
          <span>Probe Failures: {{ pipelineStatus()!.probeFailures }}</span>
          <span>Match Failures: {{ pipelineStatus()!.matchFailures }}</span>
        </div>
      } @else {
        <p class="loading">Loading pipeline status...</p>
      }

      <h3>Failed Jobs</h3>
      @if (failedJobs()?.length) {
        <table class="jobs-table">
          <thead>
            <tr>
              <th>File</th>
              <th>Stage</th>
              <th>Error</th>
              <th>Time</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (job of failedJobs(); track job.id) {
              <tr>
                <td class="cell-filename">{{ job.filename }}</td>
                <td>
                  <span class="badge badge--{{ job.stage }}">{{ job.stage }}</span>
                </td>
                <td class="cell-error">{{ job.errorMessage }}</td>
                <td class="cell-time">{{ job.timestamp }}</td>
                <td class="cell-actions">
                  <button class="btn-details" (click)="toggleDetails(job.id)">
                    {{ expandedId() === job.id ? 'Hide' : 'Details' }}
                  </button>
                  @if (job.retryable) {
                    <button
                      class="btn-retry"
                      [disabled]="retryingId() === job.id"
                      (click)="retry(job.id)"
                    >
                      {{ retryingId() === job.id ? 'Retrying...' : 'Retry' }}
                    </button>
                  }
                </td>
              </tr>
              @if (expandedId() === job.id) {
                <tr class="detail-row">
                  <td colspan="5">
                    @if (jobDetail()) {
                      <div class="detail-content">
                        <p><strong>File Path:</strong> {{ jobDetail()!.filePath }}</p>
                        @if (jobDetail()!.tier) {
                          <p><strong>Tier:</strong> {{ jobDetail()!.tier }}</p>
                        }
                        <p><strong>Status:</strong> {{ jobDetail()!.status }}</p>
                        @if (jobDetail()!.errorDetails) {
                          <pre class="error-details">{{ jobDetail()!.errorDetails }}</pre>
                        }
                        <p class="detail-timestamps">
                          Created: {{ jobDetail()!.createdAt }} | Updated:
                          {{ jobDetail()!.updatedAt }}
                        </p>
                      </div>
                    } @else {
                      <p class="loading">Loading details...</p>
                    }
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
        @if (retryError()) {
          <p class="feedback feedback--error">{{ retryError() }}</p>
        }
      } @else {
        <p class="empty-state">No failed jobs</p>
      }
    </section>
  `,
  styles: [
    `
      .monitor-section {
        background: var(--color-surface);
        border-radius: 8px;
        padding: 1.25rem;
        margin-bottom: 1.25rem;
      }
      h2 {
        color: var(--color-text);
        margin: 0 0 1rem;
        font-size: 1.1rem;
      }
      h3 {
        color: var(--color-text);
        margin: 1.25rem 0 0.75rem;
        font-size: 1rem;
      }
      .status-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: 0.75rem;
        margin-bottom: 0.75rem;
      }
      .stat-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 0.75rem;
        background: var(--color-bg);
        border-radius: 6px;
      }
      .stat-card--error .stat-value {
        color: var(--color-error);
      }
      .stat-value {
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--color-accent);
      }
      .stat-label {
        font-size: 0.8rem;
        color: var(--color-text-muted);
        margin-top: 0.25rem;
      }
      .error-summary {
        display: flex;
        gap: 1.25rem;
        font-size: 0.85rem;
        color: var(--color-text-muted);
        margin-bottom: 0.5rem;
      }
      .jobs-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.85rem;
      }
      .jobs-table th,
      .jobs-table td {
        padding: 0.5rem 0.75rem;
        text-align: left;
        border-bottom: 1px solid var(--color-bg);
      }
      .jobs-table th {
        color: var(--color-text-muted);
        font-size: 0.75rem;
        text-transform: uppercase;
      }
      .jobs-table td {
        color: var(--color-text);
      }
      .cell-filename {
        max-width: 200px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .cell-error {
        max-width: 250px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .cell-time {
        white-space: nowrap;
        font-size: 0.8rem;
        color: var(--color-text-muted);
      }
      .badge {
        display: inline-block;
        padding: 0.15rem 0.5rem;
        border-radius: 3px;
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
      }
      .badge--transcode {
        background: #5c2d2d;
        color: #ff8a8a;
      }
      .badge--probe {
        background: #2d3c5c;
        color: #8ab4ff;
      }
      .badge--match {
        background: #5c4d2d;
        color: #ffd98a;
      }
      .badge--scan {
        background: #3c2d5c;
        color: #c98aff;
      }
      .badge--subtitle {
        background: #2d5c4d;
        color: #8affd9;
      }
      .btn-retry {
        padding: 0.25rem 0.6rem;
        border: none;
        border-radius: 4px;
        background: var(--color-accent);
        color: #fff;
        font-size: 0.75rem;
        cursor: pointer;
      }
      .btn-retry:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      .btn-details {
        padding: 0.25rem 0.6rem;
        border: 1px solid var(--color-accent);
        border-radius: 4px;
        background: transparent;
        color: var(--color-accent);
        font-size: 0.75rem;
        cursor: pointer;
        margin-right: 0.4rem;
      }
      .cell-actions {
        white-space: nowrap;
      }
      .detail-row td {
        background: var(--color-bg);
        padding: 0.75rem 1rem;
      }
      .detail-content p {
        margin: 0.25rem 0;
        font-size: 0.85rem;
        color: var(--color-text);
      }
      .error-details {
        margin: 0.5rem 0;
        padding: 0.5rem;
        background: var(--color-surface);
        border-radius: 4px;
        font-size: 0.8rem;
        color: var(--color-error);
        white-space: pre-wrap;
        word-break: break-all;
        max-height: 200px;
        overflow-y: auto;
      }
      .detail-timestamps {
        font-size: 0.75rem;
        color: var(--color-text-muted);
      }
      .feedback {
        margin-top: 0.5rem;
        font-size: 0.8rem;
      }
      .feedback--error {
        color: var(--color-error);
      }
      .empty-state {
        color: var(--color-text-muted);
        font-style: italic;
        padding: 1rem 0;
      }
      .loading {
        color: var(--color-text-muted);
      }
    `,
  ],
})
export class PipelineMonitorComponent {
  private readonly adminJobsService = inject(AdminJobsService);
  private readonly refresh$ = new Subject<void>();

  readonly pipelineStatus = toSignal(
    this.refresh$.pipe(
      startWith(undefined),
      switchMap(() =>
        this.adminJobsService.getPipelineStatus().pipe(catchError(() => of(undefined))),
      ),
    ),
  );

  readonly failedJobs = toSignal(
    this.refresh$.pipe(
      startWith(undefined),
      switchMap(() =>
        this.adminJobsService.getFailedJobs().pipe(catchError(() => of([] as FailedJobSummary[]))),
      ),
    ),
  );

  readonly retryingId = signal<string | null>(null);
  readonly retryError = signal<string | null>(null);
  readonly expandedId = signal<string | null>(null);
  readonly jobDetail = signal<JobDetail | null>(null);

  toggleDetails(jobId: string): void {
    if (this.expandedId() === jobId) {
      this.expandedId.set(null);
      this.jobDetail.set(null);
      return;
    }
    this.expandedId.set(jobId);
    this.jobDetail.set(null);
    this.adminJobsService
      .getJobDetails(jobId)
      .pipe(catchError(() => of(null)))
      .subscribe((detail) => {
        this.jobDetail.set(detail);
      });
  }

  retry(jobId: string): void {
    this.retryingId.set(jobId);
    this.retryError.set(null);
    this.adminJobsService.retryJob(jobId).subscribe({
      next: () => {
        this.retryingId.set(null);
        this.expandedId.set(null);
        this.jobDetail.set(null);
        this.refresh$.next();
      },
      error: (err) => {
        this.retryingId.set(null);
        this.retryError.set(err?.error?.message || 'Retry failed');
      },
    });
  }
}
