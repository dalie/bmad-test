import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface MovieListItem {
  id: number;
  title: string;
  year: number | null;
  poster_url: string | null;
  runtime: number | null;
  rating: number | null;
  added_at: string;
  transcode_tier: number | null;
  playback_ready: boolean;
}

export interface ShowListItem {
  id: number;           // metadata.tmdb_id — NOT media_files.id
  title: string;
  year: number | null;
  poster_url: string | null;
  rating: number | null;
  season_count: number;
  added_at: string;
}

export interface RecentItem {
  id: number;           // media_files.id for movies, tmdb_id for TV
  title: string;
  year: number | null;
  poster_url: string | null;
  rating: number | null;
  media_type: 'movie' | 'tv';
  added_at: string;
}

@Injectable({ providedIn: 'root' })
export class LibraryService {
  private readonly http = inject(HttpClient);

  getMovies(): Observable<MovieListItem[]> {
    return this.http.get<MovieListItem[]>('/api/library/movies');
  }

  getShows(): Observable<ShowListItem[]> {
    return this.http.get<ShowListItem[]>('/api/library/shows');
  }

  getRecent(limit = 20): Observable<RecentItem[]> {
    return this.http.get<RecentItem[]>('/api/library/recent', { params: { limit } });
  }
}
