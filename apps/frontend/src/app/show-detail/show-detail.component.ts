import { Component, ChangeDetectionStrategy, inject, signal, effect } from '@angular/core';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { Location } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { LibraryService, ShowDetail } from '../services/library.service';
import { WatchProgressService, WatchProgressRecord } from '../services/watch-progress.service';

@Component({
  selector: 'app-show-detail',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './show-detail.component.html',
  styleUrl: './show-detail.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShowDetailComponent {
  private readonly libraryService = inject(LibraryService);
  private readonly watchProgressService = inject(WatchProgressService);
  readonly location = inject(Location);

  private readonly showId = Number(inject(ActivatedRoute).snapshot.paramMap.get('id'));

  readonly show = toSignal(
    this.showId && !isNaN(this.showId)
      ? this.libraryService.getShowById(this.showId).pipe(catchError(() => of(null)))
      : of(null as ShowDetail | null),
    { initialValue: null as ShowDetail | null },
  );

  readonly progressData = signal<WatchProgressRecord>({});

  constructor() {
    effect(() => {
      const s = this.show();
      if (s) {
        this.progressData.set(this.watchProgressService.readAll());
      }
    });
  }

  getEpisodeProgress(seasonNum: number, episodeNum: number): number {
    const s = this.show();
    if (!s) return 0;
    const entry = this.progressData()[`tv:${s.id}:s${seasonNum}:e${episodeNum}`];
    if (!entry || entry.watched || entry.duration <= 0) return 0;
    return Math.min(100, Math.round((entry.position / entry.duration) * 100));
  }

  isEpisodeWatched(seasonNum: number, episodeNum: number): boolean {
    const s = this.show();
    if (!s) return false;
    return this.progressData()[`tv:${s.id}:s${seasonNum}:e${episodeNum}`]?.watched ?? false;
  }

  getEpisodeLabel(seasonNum: number, episodeNum: number): string {
    const s = this.show();
    if (!s) return 'Play';
    const entry = this.progressData()[`tv:${s.id}:s${seasonNum}:e${episodeNum}`];
    if (!entry) return 'Play';
    if (entry.watched) return 'Play';
    if (entry.duration > 0 && entry.position / entry.duration >= 0.95)
      return 'Start from beginning';
    if (entry.position > 0) return 'Resume';
    return 'Play';
  }

  formatRating(rating: number | null): string {
    if (rating === null || rating === undefined) return '';
    return rating.toFixed(1);
  }

  formatDuration(seconds: number | null): string {
    if (!seconds || seconds <= 0) return '';
    const totalMinutes = Math.round(seconds / 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }
}
