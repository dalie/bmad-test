import { Component, ChangeDetectionStrategy, computed, signal, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { forkJoin, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { LibraryService } from '../services/library.service';
import {
  WatchProgressService,
  WatchProgressEntry,
  WatchProgressRecord,
  WATCH_PROGRESS_KEY,
} from '../services/watch-progress.service';

export type { WatchProgressEntry, WatchProgressRecord } from '../services/watch-progress.service';
export { WATCH_PROGRESS_KEY } from '../services/watch-progress.service';

export interface LibraryItem {
  id: number;
  title: string;
  year: number | null;
  posterUrl: string | null;
  mediaType: 'movie' | 'tv';
}

export interface ContinueWatchingItem extends LibraryItem {
  progressPercent: number;
  watched: boolean;
  playFileId: number;
  tier: number | null;
  seasonNum?: number;
  episodeNum?: number;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  private readonly libraryService = inject(LibraryService);
  private readonly watchProgressService = inject(WatchProgressService);

  readonly searchQuery = signal('');

  private isValidProgressEntry(entry: unknown): entry is WatchProgressEntry {
    const candidate = entry as Partial<WatchProgressEntry> | null;

    return (
      typeof candidate === 'object' &&
      candidate !== null &&
      typeof candidate.position === 'number' &&
      typeof candidate.duration === 'number' &&
      typeof candidate.watched === 'boolean' &&
      typeof candidate.updatedAt === 'number' &&
      Number.isFinite(candidate.updatedAt) &&
      (candidate.mediaType === 'movie' || candidate.mediaType === 'tv') &&
      typeof candidate.id === 'number' &&
      typeof candidate.fileId === 'number'
    );
  }

  readonly recentItems = toSignal(
    this.libraryService.getRecent().pipe(
      map((items) =>
        items.map((item) => ({
          id: item.id,
          title: item.title,
          year: item.year,
          posterUrl: item.poster_url,
          mediaType: item.media_type as 'movie' | 'tv',
        })),
      ),
      catchError(() => of([] as LibraryItem[])),
    ),
    { initialValue: [] as LibraryItem[] },
  );

  readonly allItems = toSignal(
    forkJoin([
      this.libraryService.getMovies().pipe(catchError(() => of([]))),
      this.libraryService.getShows().pipe(catchError(() => of([]))),
    ]).pipe(
      map(([movies, shows]) => {
        const combined: LibraryItem[] = [
          ...movies.map((m) => ({
            id: m.id,
            title: m.title,
            year: m.year,
            posterUrl: m.poster_url,
            mediaType: 'movie' as const,
          })),
          ...shows.map((s) => ({
            id: s.id,
            title: s.title,
            year: s.year,
            posterUrl: s.poster_url,
            mediaType: 'tv' as const,
          })),
        ];
        return combined.sort((a, b) =>
          a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
        );
      }),
    ),
    { initialValue: [] as LibraryItem[] },
  );

  readonly continueWatchingItems = signal<ContinueWatchingItem[]>(
    this.readContinueWatchingFromStorage(),
  );

  readonly showContinueWatching = computed(() => this.continueWatchingItems().length > 0);

  readonly filteredLibraryItems = computed(() => {
    const items = this.allItems();
    const query = this.searchQuery();

    if (query.trim().length === 0) {
      return items;
    }

    const normalizedQuery = query.toLowerCase();
    return items.filter((item) => item.title.toLowerCase().includes(normalizedQuery));
  });

  readonly hasActiveSearch = computed(() => this.searchQuery().trim().length > 0);

  private readonly progressData = signal<Map<string, WatchProgressEntry>>(this.buildProgressData());

  getProgressPercent(item: LibraryItem): number {
    const entry = this.progressData().get(`${item.mediaType}:${item.id}`);
    if (!entry || entry.watched || entry.duration <= 0) return 0;
    return Math.min(100, Math.round((entry.position / entry.duration) * 100));
  }

  isWatched(item: LibraryItem): boolean {
    return this.progressData().get(`${item.mediaType}:${item.id}`)?.watched ?? false;
  }

  updateSearchQuery(value: string): void {
    this.searchQuery.set(value);
  }

  private buildProgressData(): Map<string, WatchProgressEntry> {
    try {
      const record = this.watchProgressService.readAll();
      const latest = new Map<string, WatchProgressEntry>();
      for (const entry of Object.values(record)) {
        if (!this.isValidProgressEntry(entry)) continue;
        const mapKey = `${entry.mediaType}:${entry.id}`;
        const existing = latest.get(mapKey);
        if (!existing || entry.updatedAt > existing.updatedAt) {
          latest.set(mapKey, entry);
        }
      }
      return latest;
    } catch {
      return new Map();
    }
  }

  private readContinueWatchingFromStorage(): ContinueWatchingItem[] {
    try {
      const record = this.watchProgressService.readAll();

      const latestByTitle = new Map<string, WatchProgressEntry>();
      for (const entry of Object.values(record)) {
        if (!this.isValidProgressEntry(entry)) continue;
        const key = `${entry.mediaType}:${entry.id}`;
        const existing = latestByTitle.get(key);
        if (!existing || entry.updatedAt > existing.updatedAt) {
          latestByTitle.set(key, entry);
        }
      }

      return Array.from(latestByTitle.values())
        .filter((e) => !e.watched)
        .filter((e) => e.duration > 0 && e.position > 0)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((e) => ({
          id: e.id,
          title: e.title,
          year: e.year,
          posterUrl: e.posterUrl,
          mediaType: e.mediaType,
          progressPercent: Math.min(100, Math.round((e.position / e.duration) * 100)),
          watched: false,
          playFileId: e.fileId,
          tier: e.tier ?? null,
          seasonNum: e.seasonNum,
          episodeNum: e.episodeNum,
        }));
    } catch {
      return [];
    }
  }
}
