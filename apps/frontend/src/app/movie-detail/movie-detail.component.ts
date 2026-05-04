import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { Location } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { LibraryService, MovieDetail } from '../services/library.service';

@Component({
  selector: 'app-movie-detail',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './movie-detail.component.html',
  styleUrl: './movie-detail.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MovieDetailComponent {
  private readonly libraryService = inject(LibraryService);
  readonly location = inject(Location);

  private readonly movieId = Number(inject(ActivatedRoute).snapshot.paramMap.get('id'));

  readonly movie = toSignal(
    this.movieId && !isNaN(this.movieId)
      ? this.libraryService.getMovieById(this.movieId).pipe(
          catchError(() => of(null))
        )
      : of(null as MovieDetail | null),
    { initialValue: null as MovieDetail | null }
  );

  formatRuntime(minutes: number | null): string {
    if (!minutes) return '';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  formatRating(rating: number | null): string {
    if (rating === null || rating === undefined) return '';
    return rating.toFixed(1);
  }
}
