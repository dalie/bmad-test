import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, of } from 'rxjs';

interface UnmatchedFile {
  id: number;
  filename: string;
  path: string;
  source_type: string;
  error_message: string | null;
  created_at: string;
}

interface UnmatchedResponse {
  items: UnmatchedFile[];
  total: number;
  offset: number;
  limit: number;
}

interface TmdbSearchResult {
  id: number;
  title: string;
  release_date: string;
  overview: string;
  poster_path: string | null;
}

@Component({
  selector: 'app-needs-attention',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="attention-section">
      <h2>Needs Attention (Unmatched Files)</h2>
      @if (unmatchedFiles()) {
        @if (unmatchedFiles()!.items.length) {
          <p class="total-count">{{ unmatchedFiles()!.total }} unmatched file(s)</p>
          @for (file of unmatchedFiles()!.items; track file.id) {
            <div class="attention-item">
              <div class="file-info">
                <span class="filename">{{ file.filename }}</span>
                <span class="source-type">{{ file.source_type }}</span>
                @if (file.error_message) {
                  <span class="error-msg">{{ file.error_message }}</span>
                }
              </div>
              <div class="match-controls">
                <div class="search-row">
                  <input
                    class="search-input"
                    [value]="getSearchQuery(file.id)"
                    (input)="updateSearchQuery(file.id, $event)"
                    (keyup.enter)="search(file.id)"
                    placeholder="Search TMDB..."
                  />
                  <button class="btn-search" (click)="search(file.id)">Search</button>
                </div>
                @if (getSearchResults(file.id).length) {
                  <div class="search-results">
                    @for (result of getSearchResults(file.id); track result.id) {
                      <div class="search-result">
                        <div class="result-info">
                          <span class="result-title">{{ result.title }}</span>
                          <span class="result-year">{{ result.release_date }}</span>
                        </div>
                        <button
                          class="btn-match"
                          [disabled]="matchingInFlight()[file.id]"
                          (click)="match(file.id, result.id)"
                        >
                          Match
                        </button>
                      </div>
                    }
                  </div>
                }
                @if (matchSuccess()[file.id]) {
                  <p class="feedback feedback--success">Matched successfully!</p>
                }
                @if (matchError()[file.id]) {
                  <p class="feedback feedback--error">{{ matchError()[file.id] }}</p>
                }
              </div>
            </div>
          }
          @if (unmatchedFiles()!.total > pageSize) {
            <div class="pagination">
              <button class="btn-page" [disabled]="currentOffset() === 0" (click)="prevPage()">
                Previous
              </button>
              <span class="page-info"
                >{{ currentOffset() + 1 }}–{{ currentOffset() + unmatchedFiles()!.items.length }} of
                {{ unmatchedFiles()!.total }}</span
              >
              <button
                class="btn-page"
                [disabled]="currentOffset() + pageSize >= unmatchedFiles()!.total"
                (click)="nextPage()"
              >
                Next
              </button>
            </div>
          }
        } @else {
          <p class="empty-state">No unmatched files</p>
        }
      } @else {
        <p class="loading">Loading unmatched files...</p>
      }
    </section>
  `,
  styles: [
    `
      .attention-section {
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
      .total-count {
        color: var(--color-text-muted);
        font-size: 0.85rem;
        margin-bottom: 1rem;
      }
      .attention-item {
        border-bottom: 1px solid var(--color-bg);
        padding: 1rem 0;
      }
      .attention-item:last-child {
        border-bottom: none;
      }
      .file-info {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 0.5rem;
        flex-wrap: wrap;
      }
      .filename {
        color: var(--color-text);
        font-weight: 500;
      }
      .source-type {
        font-size: 0.75rem;
        padding: 0.1rem 0.4rem;
        background: var(--color-bg);
        border-radius: 3px;
        color: var(--color-text-muted);
        text-transform: uppercase;
      }
      .error-msg {
        font-size: 0.8rem;
        color: var(--color-error);
      }
      .match-controls {
        margin-top: 0.5rem;
      }
      .search-row {
        display: flex;
        gap: 0.5rem;
      }
      .search-input {
        flex: 1;
        padding: 0.4rem 0.6rem;
        border: 1px solid var(--color-bg);
        border-radius: 4px;
        background: var(--color-bg);
        color: var(--color-text);
        font-size: 0.85rem;
      }
      .btn-search {
        padding: 0.4rem 0.75rem;
        border: none;
        border-radius: 4px;
        background: var(--color-accent);
        color: #fff;
        font-size: 0.8rem;
        cursor: pointer;
      }
      .search-results {
        margin-top: 0.5rem;
        border: 1px solid var(--color-bg);
        border-radius: 4px;
        max-height: 200px;
        overflow-y: auto;
      }
      .search-result {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.5rem 0.75rem;
        border-bottom: 1px solid var(--color-bg);
      }
      .search-result:last-child {
        border-bottom: none;
      }
      .result-info {
        display: flex;
        gap: 0.5rem;
        align-items: baseline;
      }
      .result-title {
        color: var(--color-text);
        font-size: 0.85rem;
      }
      .result-year {
        color: var(--color-text-muted);
        font-size: 0.75rem;
      }
      .btn-match {
        padding: 0.2rem 0.5rem;
        border: none;
        border-radius: 3px;
        background: var(--color-success, #4caf50);
        color: #fff;
        font-size: 0.75rem;
        cursor: pointer;
      }
      .btn-match:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      .feedback {
        margin-top: 0.5rem;
        font-size: 0.8rem;
      }
      .feedback--success {
        color: var(--color-success, #4caf50);
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
      .pagination {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 1rem;
        margin-top: 1rem;
        padding-top: 0.75rem;
        border-top: 1px solid var(--color-bg);
      }
      .btn-page {
        padding: 0.3rem 0.75rem;
        border: 1px solid var(--color-accent);
        border-radius: 4px;
        background: transparent;
        color: var(--color-accent);
        font-size: 0.8rem;
        cursor: pointer;
      }
      .btn-page:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .page-info {
        font-size: 0.8rem;
        color: var(--color-text-muted);
      }
    `,
  ],
})
export class NeedsAttentionComponent {
  private readonly http = inject(HttpClient);
  readonly pageSize = 20;

  readonly unmatchedFiles = signal<UnmatchedResponse | undefined>(undefined);
  readonly currentOffset = signal(0);
  readonly searchQueries = signal<Record<number, string>>({});
  readonly searchResultsMap = signal<Record<number, TmdbSearchResult[]>>({});
  readonly matchingInFlight = signal<Record<number, boolean>>({});
  readonly matchSuccess = signal<Record<number, boolean>>({});
  readonly matchError = signal<Record<number, string>>({});

  constructor() {
    this.loadPage(0);
  }

  private loadPage(offset: number): void {
    this.http
      .get<UnmatchedResponse>(`/api/library/unmatched?offset=${offset}&limit=${this.pageSize}`)
      .pipe(catchError(() => of(undefined)))
      .subscribe((resp) => {
        this.unmatchedFiles.set(resp);
        this.currentOffset.set(offset);
      });
  }

  nextPage(): void {
    this.loadPage(this.currentOffset() + this.pageSize);
  }

  prevPage(): void {
    this.loadPage(Math.max(0, this.currentOffset() - this.pageSize));
  }

  getSearchQuery(fileId: number): string {
    return this.searchQueries()[fileId] || '';
  }

  updateSearchQuery(fileId: number, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchQueries.update((q) => ({ ...q, [fileId]: value }));
  }

  getSearchResults(fileId: number): TmdbSearchResult[] {
    return this.searchResultsMap()[fileId] || [];
  }

  search(fileId: number): void {
    const query = this.searchQueries()[fileId];
    if (!query?.trim()) return;

    const file = this.unmatchedFiles()?.items.find((f) => f.id === fileId);
    if (!file) return;
    const type = file.source_type === 'movies' ? 'movie' : 'tv';

    this.http
      .get<TmdbSearchResult[]>(`/api/tmdb/search?query=${encodeURIComponent(query)}&type=${type}`)
      .pipe(catchError(() => of([] as TmdbSearchResult[])))
      .subscribe((results) => {
        this.searchResultsMap.update((m) => ({
          ...m,
          [fileId]: results,
        }));
      });
  }

  match(fileId: number, tmdbId: number): void {
    this.matchingInFlight.update((m) => ({ ...m, [fileId]: true }));
    this.matchSuccess.update((s) => ({ ...s, [fileId]: false }));
    this.matchError.update((e) => ({ ...e, [fileId]: '' }));

    this.http.post(`/api/library/files/${fileId}/match`, { tmdbId }).subscribe({
      next: () => {
        this.matchingInFlight.update((m) => ({ ...m, [fileId]: false }));
        this.matchSuccess.update((s) => ({ ...s, [fileId]: true }));
        this.searchResultsMap.update((m) => ({ ...m, [fileId]: [] }));
      },
      error: (err) => {
        this.matchingInFlight.update((m) => ({ ...m, [fileId]: false }));
        this.matchError.update((e) => ({
          ...e,
          [fileId]: err?.error?.message || 'Match failed',
        }));
      },
    });
  }
}
