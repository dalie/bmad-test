import { Component, ChangeDetectionStrategy, computed, signal, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { forkJoin, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { LibraryService } from '../services/library.service';

export const WATCH_PROGRESS_KEY = 'cineplex_progress';

export interface LibraryItem {
  id: number;
  title: string;
  year: number | null;
  posterUrl: string | null;   // camelCase — frontend view model
  mediaType: 'movie' | 'tv'; // camelCase — frontend view model
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

  readonly recentItems = toSignal(
    this.libraryService.getRecent().pipe(
      map(items =>
        items.map(item => ({
          id: item.id,
          title: item.title,
          year: item.year,
          posterUrl: item.poster_url,
          mediaType: item.media_type as 'movie' | 'tv',
        }))
      ),
      catchError(() => of([] as LibraryItem[]))
    ),
    { initialValue: [] as LibraryItem[] }
  );

  readonly allItems = toSignal(
    forkJoin([
      this.libraryService.getMovies().pipe(catchError(() => of([]))),
      this.libraryService.getShows().pipe(catchError(() => of([]))),
    ]).pipe(
      map(([movies, shows]) => {
        const combined: LibraryItem[] = [
          ...movies.map(m => ({
            id: m.id,
            title: m.title,
            year: m.year,
            posterUrl: m.poster_url,
            mediaType: 'movie' as const,
          })),
          ...shows.map(s => ({
            id: s.id,
            title: s.title,
            year: s.year,
            posterUrl: s.poster_url,
            mediaType: 'tv' as const,
          })),
        ];
        return combined.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
      })
    ),
    { initialValue: [] as LibraryItem[] }
  );

  readonly continueWatchingItems = signal<LibraryItem[]>(
    this.readContinueWatchingFromStorage()
  );

  readonly showContinueWatching = computed(() => this.continueWatchingItems().length > 0);

  private readContinueWatchingFromStorage(): LibraryItem[] {
    try {
      const raw = localStorage.getItem(WATCH_PROGRESS_KEY);
      if (!raw) return [];
      // Storage schema populated by stories 4-5 and 6-1.
      // For this story: localStorage key is established, section stays hidden until
      // story 4-5 implements progress-based population.
      return [];
    } catch {
      return [];
    }
  }
}
