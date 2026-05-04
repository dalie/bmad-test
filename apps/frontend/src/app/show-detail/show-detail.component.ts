import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { Location } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { LibraryService, ShowDetail } from '../services/library.service';

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
  readonly location = inject(Location);

  private readonly showId = Number(inject(ActivatedRoute).snapshot.paramMap.get('id'));

  readonly show = toSignal(
    this.showId && !isNaN(this.showId)
      ? this.libraryService.getShowById(this.showId).pipe(
          catchError(() => of(null))
        )
      : of(null as ShowDetail | null),
    { initialValue: null as ShowDetail | null }
  );

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
