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

export interface AudioTrack {
  index: number;
  codec: string;
  language: string | null;
  channels: number;
}

export interface SubtitleTrack {
  id: number;
  track_index: number | null;
  type: string;
  language: string | null;
  codec: string | null;
  webvtt_path: string | null;
}

export interface MovieDetail {
  id: number;
  title: string;
  description: string | null;
  year: number | null;
  poster_url: string | null;
  runtime: number | null;
  rating: number | null;
  content_rating: string | null;
  audio_tracks: AudioTrack[];
  subtitle_tracks: SubtitleTrack[];
  file_id: number;
  tier: number | null;
  transcode_output_path: string | null;
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

  getMovieById(id: number): Observable<MovieDetail> {
    return this.http.get<MovieDetail>(`/api/library/movies/${id}`);
  }
}
