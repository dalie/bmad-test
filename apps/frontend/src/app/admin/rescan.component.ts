import { Component, ChangeDetectionStrategy, inject, signal, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval, switchMap, takeWhile, tap, catchError, of, Subscription } from 'rxjs';
import { AdminRescanService, ScanStatus } from './admin-rescan.service';

@Component({
  selector: 'app-rescan',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rescan-container">
      <div class="rescan-header">
        <h3>Library Rescan</h3>
        <button class="rescan-btn" [disabled]="scanning()" (click)="triggerRescan()">
          Rescan Library
        </button>
      </div>

      @if (scanStatus()) {
        <div class="scan-progress">
          <div class="scan-status-row">
            <span class="scan-label">Status:</span>
            <span
              class="scan-value"
              [class.status-active]="scanStatus()!.status === 'in_progress'"
              [class.status-done]="scanStatus()!.status === 'completed'"
              [class.status-error]="scanStatus()!.status === 'failed'"
            >
              {{ scanStatus()!.status === 'in_progress' ? 'Scanning...' : scanStatus()!.status }}
            </span>
          </div>
          <div class="scan-status-row">
            <span class="scan-label">Files Discovered:</span>
            <span class="scan-value">{{ scanStatus()!.discovered }}</span>
          </div>
          <div class="scan-status-row">
            <span class="scan-label">Files Processed:</span>
            <span class="scan-value">{{ scanStatus()!.processed }}</span>
          </div>
          @if (scanStatus()!.failed > 0) {
            <div class="scan-status-row">
              <span class="scan-label">Failed:</span>
              <span class="scan-value status-error">{{ scanStatus()!.failed }}</span>
            </div>
          }
          @if (scanStatus()!.status === 'failed' && scanStatus()!.errors.length > 0) {
            <div class="scan-errors">
              <span class="scan-label">Errors:</span>
              <ul>
                @for (error of scanStatus()!.errors; track error) {
                  <li>{{ error }}</li>
                }
              </ul>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      .rescan-container {
        background: var(--color-surface);
        border-radius: 8px;
        padding: 1.25rem;
        margin-bottom: 1.25rem;
      }
      .rescan-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 1rem;
      }
      .rescan-header h3 {
        color: var(--color-text);
        margin: 0;
        font-size: 1.1rem;
      }
      .rescan-btn {
        padding: 0.5rem 1rem;
        background: var(--color-accent);
        color: var(--color-bg);
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-weight: 600;
      }
      .rescan-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .scan-progress {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .scan-status-row {
        display: flex;
        justify-content: space-between;
        padding: 0.25rem 0;
      }
      .scan-label {
        color: var(--color-text-muted);
        font-size: 0.9rem;
      }
      .scan-value {
        color: var(--color-text);
        font-weight: 600;
      }
      .status-active {
        color: var(--color-accent);
      }
      .status-done {
        color: var(--color-success);
      }
      .status-error {
        color: var(--color-error);
      }
      .scan-errors ul {
        margin: 0.25rem 0 0;
        padding-left: 1.25rem;
        color: var(--color-error);
        font-size: 0.85rem;
      }
    `,
  ],
})
export class RescanComponent {
  private readonly rescanService = inject(AdminRescanService);
  private readonly destroyRef = inject(DestroyRef);

  readonly scanning = signal(false);
  readonly scanStatus = signal<ScanStatus | null>(null);

  private pollSub: Subscription | null = null;

  triggerRescan(): void {
    this.scanning.set(true);
    this.scanStatus.set(null);

    this.rescanService
      .triggerRescan()
      .pipe(
        catchError(() => {
          this.scanning.set(false);
          return of(null);
        }),
      )
      .subscribe((result) => {
        if (!result) return;
        this.startPolling(result.scanId);
      });
  }

  private startPolling(scanId: string): void {
    this.pollSub?.unsubscribe();
    this.pollSub = interval(2000)
      .pipe(
        switchMap(() => this.rescanService.getScanStatus(scanId).pipe(catchError(() => of(null)))),
        tap((status) => {
          if (status) {
            this.scanStatus.set(status);
          }
        }),
        takeWhile((status) => status?.status === 'in_progress', true),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        complete: () => {
          this.scanning.set(false);
        },
      });
  }
}
