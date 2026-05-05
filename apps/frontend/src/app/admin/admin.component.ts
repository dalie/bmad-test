import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { AdminStatsService } from './admin-stats.service';
import { PipelineMonitorComponent } from './pipeline-monitor.component';
import { NeedsAttentionComponent } from './needs-attention.component';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [PipelineMonitorComponent, NeedsAttentionComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Admin Panel</h1>
    @if (stats()) {
      <section class="stats-section">
        <h2>Library</h2>
        <div class="stats-grid">
          <div class="stat-card">
            <span class="stat-value">{{ stats()!.library.totalTitles }}</span>
            <span class="stat-label">Total Titles</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{{ stats()!.library.movieCount }}</span>
            <span class="stat-label">Movies</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{{ stats()!.library.tvShowCount }}</span>
            <span class="stat-label">TV Shows</span>
          </div>
        </div>
      </section>

      <section class="stats-section">
        <h2>Transcode Status</h2>
        <div class="stats-grid">
          <div class="stat-card">
            <span class="stat-value">{{ stats()!.transcode.byTier.tier1 }}</span>
            <span class="stat-label">Tier 1 (Direct Play)</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{{ stats()!.transcode.byTier.tier2 }}</span>
            <span class="stat-label">Tier 2 (Audio Only)</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{{ stats()!.transcode.byTier.tier3 }}</span>
            <span class="stat-label">Tier 3 (Full Transcode)</span>
          </div>
        </div>
        <table class="stats-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Count</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Queued</td>
              <td>{{ stats()!.transcode.byStatus.queued }}</td>
            </tr>
            <tr>
              <td>Processing</td>
              <td>{{ stats()!.transcode.byStatus.processing }}</td>
            </tr>
            <tr>
              <td>Completed</td>
              <td>{{ stats()!.transcode.byStatus.completed }}</td>
            </tr>
            <tr>
              <td>Failed</td>
              <td>{{ stats()!.transcode.byStatus.failed }}</td>
            </tr>
            <tr>
              <td>Ready</td>
              <td>{{ stats()!.transcode.byStatus.ready }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="stats-section">
        <h2>Import Pipeline</h2>
        <table class="stats-table">
          <thead>
            <tr>
              <th>Stage</th>
              <th>Count</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Discovered</td>
              <td>{{ stats()!.pipeline.discovered }}</td>
            </tr>
            <tr>
              <td>Probed</td>
              <td>{{ stats()!.pipeline.probed }}</td>
            </tr>
            <tr>
              <td>Matched</td>
              <td>{{ stats()!.pipeline.matched }}</td>
            </tr>
            <tr>
              <td>Unmatched</td>
              <td>{{ stats()!.pipeline.unmatched }}</td>
            </tr>
            <tr>
              <td>Total Errors</td>
              <td>{{ stats()!.pipeline.totalErrors }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    } @else {
      <p>Loading statistics...</p>
    }
    <app-pipeline-monitor />
    <app-needs-attention />
  `,
  styles: [
    `
      :host {
        display: block;
        padding: 1.5rem;
        max-width: 900px;
        margin: 0 auto;
      }
      h1 {
        color: var(--color-text);
        margin-bottom: 1.5rem;
      }
      .stats-section {
        background: var(--color-surface);
        border-radius: 8px;
        padding: 1.25rem;
        margin-bottom: 1.25rem;
      }
      .stats-section h2 {
        color: var(--color-text);
        margin: 0 0 1rem;
        font-size: 1.1rem;
      }
      .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 1rem;
        margin-bottom: 1rem;
      }
      .stat-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 0.75rem;
        background: var(--color-bg);
        border-radius: 6px;
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
      .stats-table {
        width: 100%;
        border-collapse: collapse;
      }
      .stats-table th,
      .stats-table td {
        padding: 0.5rem 0.75rem;
        text-align: left;
        border-bottom: 1px solid var(--color-bg);
      }
      .stats-table th {
        color: var(--color-text-muted);
        font-size: 0.8rem;
        text-transform: uppercase;
      }
      .stats-table td {
        color: var(--color-text);
      }
    `,
  ],
})
export class AdminComponent {
  private readonly adminStatsService = inject(AdminStatsService);
  readonly stats = toSignal(
    this.adminStatsService.getStats().pipe(catchError(() => of(undefined))),
  );
}
