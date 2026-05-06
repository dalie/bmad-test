import { Injectable, Logger } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

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
  id: number;
  title: string;
  year: number | null;
  poster_url: string | null;
  rating: number | null;
  season_count: number;
  added_at: string;
}

export interface AudioTrack {
  index: number;
  codec: string;
  channels: number;
  language: string | null;
}

export interface SubtitleTrackInfo {
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
  subtitle_tracks: SubtitleTrackInfo[];
  file_id: number;
  tier: number | null;
  transcode_output_path: string | null;
}

export interface EpisodeItem {
  episode_number: number;
  name: string | null;
  duration: number | null;
  file_id: number;
  tier: number | null;
}

export interface SeasonInfo {
  season_number: number;
  episodes: EpisodeItem[];
}

export interface ShowDetail {
  id: number;
  title: string;
  description: string | null;
  year: number | null;
  poster_url: string | null;
  rating: number | null;
  seasons: SeasonInfo[];
}

export interface RecentItem {
  id: number;
  title: string;
  year: number | null;
  poster_url: string | null;
  rating: number | null;
  media_type: string;
  added_at: string;
  latest_season: number | null;
  latest_episode: number | null;
}

@Injectable()
export class BrowseService {
  private readonly logger = new Logger(BrowseService.name);

  constructor(private readonly database: DatabaseService) {}

  private getImageBaseUrl(): string | null {
    const db = this.database.getDatabase();
    const row = db
      .prepare(
        "SELECT image_base_url FROM tmdb_config ORDER BY last_fetched DESC LIMIT 1",
      )
      .get() as { image_base_url: string } | undefined;
    return row?.image_base_url ?? null;
  }

  private buildPosterUrl(
    imageBaseUrl: string | null,
    posterPath: string | null,
  ): string | null {
    if (!imageBaseUrl || !posterPath) return null;
    return `${imageBaseUrl}w500${posterPath}`;
  }

  private extractYear(dateStr: string | null): number | null {
    if (!dateStr) return null;
    const year = parseInt(dateStr.substring(0, 4), 10);
    return Number.isNaN(year) ? null : year;
  }

  private getDuration(probeDataJson: string | null): number | null {
    if (!probeDataJson) return null;
    try {
      const probe = JSON.parse(probeDataJson) as {
        format?: { duration?: number };
      };
      return probe.format?.duration ?? null;
    } catch {
      return null;
    }
  }

  private getAudioTracks(probeDataJson: string | null): AudioTrack[] {
    if (!probeDataJson) return [];
    try {
      const probe = JSON.parse(probeDataJson) as {
        audioTracks?: Array<{
          index: number;
          codec: string;
          channels: number;
          language?: string;
        }>;
      };
      return (probe.audioTracks ?? []).map((t) => ({
        index: t.index,
        codec: t.codec,
        channels: t.channels,
        language: t.language ?? null,
      }));
    } catch {
      return [];
    }
  }

  getMovies(): MovieListItem[] {
    const db = this.database.getDatabase();
    const imageBaseUrl = this.getImageBaseUrl();

    const rows = db
      .prepare(
        `SELECT mf.id, m.title, m.release_date, m.poster_path, m.runtime,
                m.vote_average AS rating, mf.created_at AS added_at, mf.tier
         FROM media_files mf
         JOIN metadata m ON m.media_file_id = mf.id
         WHERE m.media_type = 'movie' AND mf.status IN ('ready', 'completed')
         ORDER BY m.title ASC`,
      )
      .all() as {
      id: number;
      title: string;
      release_date: string | null;
      poster_path: string | null;
      runtime: number | null;
      rating: number | null;
      added_at: string;
      tier: number | null;
    }[];

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      year: this.extractYear(row.release_date),
      poster_url: this.buildPosterUrl(imageBaseUrl, row.poster_path),
      runtime: row.runtime,
      rating: row.rating,
      added_at: row.added_at,
      transcode_tier: row.tier,
      playback_ready: true,
    }));
  }

  getShows(): ShowListItem[] {
    const db = this.database.getDatabase();
    const imageBaseUrl = this.getImageBaseUrl();

    const rows = db
      .prepare(
        `SELECT m.tmdb_id AS id, MIN(m.title) AS title,
                MIN(m.release_date) AS release_date,
                MIN(m.poster_path) AS poster_path,
                MIN(m.vote_average) AS rating,
                MIN(mf.created_at) AS added_at,
                COUNT(DISTINCT te.season_number) AS season_count
         FROM metadata m
         JOIN media_files mf ON mf.id = m.media_file_id
         LEFT JOIN tv_episodes te ON te.metadata_id = m.id
         WHERE m.media_type = 'tv' AND mf.status IN ('ready', 'completed')
           AND m.tmdb_id IS NOT NULL
         GROUP BY m.tmdb_id
         ORDER BY MIN(m.title) ASC`,
      )
      .all() as {
      id: number;
      title: string;
      release_date: string | null;
      poster_path: string | null;
      rating: number | null;
      added_at: string;
      season_count: number;
    }[];

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      year: this.extractYear(row.release_date),
      poster_url: this.buildPosterUrl(imageBaseUrl, row.poster_path),
      rating: row.rating,
      season_count: row.season_count,
      added_at: row.added_at,
    }));
  }

  getMovieById(id: number): MovieDetail | null {
    const db = this.database.getDatabase();
    const imageBaseUrl = this.getImageBaseUrl();

    const row = db
      .prepare(
        `SELECT mf.id, mf.path AS file_path, mf.tier, mf.probe_data,
                m.title, m.overview, m.release_date, m.poster_path,
                m.runtime, m.vote_average AS rating, m.content_rating,
                tj.output_path AS transcode_output_path
         FROM media_files mf
         JOIN metadata m ON m.media_file_id = mf.id
         LEFT JOIN transcode_jobs tj ON tj.file_id = mf.id AND tj.status = 'completed'
         WHERE mf.id = ? AND m.media_type = 'movie' AND mf.status IN ('ready', 'completed')`,
      )
      .get(id) as
      | {
          id: number;
          file_path: string;
          tier: number | null;
          probe_data: string | null;
          title: string;
          overview: string | null;
          release_date: string | null;
          poster_path: string | null;
          runtime: number | null;
          rating: number | null;
          content_rating: string | null;
          transcode_output_path: string | null;
        }
      | undefined;

    if (!row) return null;

    const subtitleRows = db
      .prepare(
        `SELECT id, track_index, type, language, codec, webvtt_path
         FROM subtitles
         WHERE media_file_id = ?
         ORDER BY id ASC`,
      )
      .all(id) as {
      id: number;
      track_index: number | null;
      type: string;
      language: string | null;
      codec: string | null;
      webvtt_path: string | null;
    }[];

    return {
      id: row.id,
      title: row.title,
      description: row.overview,
      year: this.extractYear(row.release_date),
      poster_url: this.buildPosterUrl(imageBaseUrl, row.poster_path),
      runtime: row.runtime,
      rating: row.rating,
      content_rating: row.content_rating,
      audio_tracks: this.getAudioTracks(row.probe_data),
      subtitle_tracks: subtitleRows.map((s) => ({
        id: s.id,
        track_index: s.track_index,
        type: s.type,
        language: s.language,
        codec: s.codec,
        webvtt_path: s.webvtt_path,
      })),
      file_id: row.id,
      tier: row.tier,
      transcode_output_path: row.transcode_output_path,
    };
  }

  getShowById(tmdbId: number): ShowDetail | null {
    const db = this.database.getDatabase();
    const imageBaseUrl = this.getImageBaseUrl();

    const header = db
      .prepare(
        `SELECT m.title, m.overview, m.release_date, m.poster_path, m.vote_average AS rating
         FROM metadata m
         JOIN media_files mf ON mf.id = m.media_file_id
         WHERE m.tmdb_id = ? AND m.media_type = 'tv' AND mf.status IN ('ready', 'completed')
         LIMIT 1`,
      )
      .get(tmdbId) as
      | {
          title: string;
          overview: string | null;
          release_date: string | null;
          poster_path: string | null;
          rating: number | null;
        }
      | undefined;

    if (!header) return null;

    const episodeRows = db
      .prepare(
        `SELECT mf.id AS file_id, mf.tier, mf.probe_data,
                te.season_number, te.episode_number, te.name AS episode_name
         FROM metadata m
         JOIN media_files mf ON mf.id = m.media_file_id
         JOIN tv_episodes te ON te.metadata_id = m.id
         WHERE m.tmdb_id = ? AND m.media_type = 'tv' AND mf.status IN ('ready', 'completed')
         ORDER BY te.season_number DESC, te.episode_number ASC`,
      )
      .all(tmdbId) as {
      file_id: number;
      tier: number | null;
      probe_data: string | null;
      season_number: number | null;
      episode_number: number | null;
      episode_name: string | null;
    }[];

    // Group episodes by season using a Map (preserves insertion order = DESC season_number)
    const seasonMap = new Map<number, EpisodeItem[]>();
    for (const ep of episodeRows) {
      const seasonNum = ep.season_number ?? 0;
      if (!seasonMap.has(seasonNum)) {
        seasonMap.set(seasonNum, []);
      }
      seasonMap.get(seasonNum)!.push({
        episode_number: ep.episode_number ?? 0,
        name: ep.episode_name,
        duration: this.getDuration(ep.probe_data),
        file_id: ep.file_id,
        tier: ep.tier,
      });
    }

    const seasons: SeasonInfo[] = Array.from(seasonMap.entries()).map(
      ([season_number, episodes]) => ({ season_number, episodes }),
    );

    return {
      id: tmdbId,
      title: header.title,
      description: header.overview,
      year: this.extractYear(header.release_date),
      poster_url: this.buildPosterUrl(imageBaseUrl, header.poster_path),
      rating: header.rating,
      seasons,
    };
  }

  getRecent(limit: number): RecentItem[] {
    const db = this.database.getDatabase();
    const imageBaseUrl = this.getImageBaseUrl();
    const safeLim = Math.min(Math.max(limit, 1), 200);

    const rows = db
      .prepare(
        `SELECT
          CASE WHEN m.media_type = 'movie' THEN mf.id ELSE m.tmdb_id END AS id,
          m.title, m.release_date, m.poster_path, m.vote_average AS rating,
          m.media_type, MAX(mf.created_at) AS added_at,
          CASE WHEN m.media_type = 'tv' THEN (
            SELECT te.season_number FROM tv_episodes te
            JOIN metadata m2 ON m2.id = te.metadata_id
            JOIN media_files mf2 ON mf2.id = m2.media_file_id
            WHERE m2.tmdb_id = m.tmdb_id AND mf2.status IN ('ready', 'completed')
            ORDER BY mf2.created_at DESC LIMIT 1
          ) END AS latest_season,
          CASE WHEN m.media_type = 'tv' THEN (
            SELECT te.episode_number FROM tv_episodes te
            JOIN metadata m2 ON m2.id = te.metadata_id
            JOIN media_files mf2 ON mf2.id = m2.media_file_id
            WHERE m2.tmdb_id = m.tmdb_id AND mf2.status IN ('ready', 'completed')
            ORDER BY mf2.created_at DESC LIMIT 1
          ) END AS latest_episode
         FROM media_files mf
         JOIN metadata m ON m.media_file_id = mf.id
         WHERE mf.status IN ('ready', 'completed')
         GROUP BY
           CASE WHEN m.media_type = 'movie' THEN mf.id ELSE m.tmdb_id END,
           m.title, m.release_date, m.poster_path, m.vote_average, m.media_type
         ORDER BY MAX(mf.created_at) DESC
         LIMIT ?`,
      )
      .all(safeLim) as {
      id: number;
      title: string;
      release_date: string | null;
      poster_path: string | null;
      rating: number | null;
      media_type: string;
      added_at: string;
      latest_season: number | null;
      latest_episode: number | null;
    }[];

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      year: this.extractYear(row.release_date),
      poster_url: this.buildPosterUrl(imageBaseUrl, row.poster_path),
      rating: row.rating,
      media_type: row.media_type,
      added_at: row.added_at,
      latest_season: row.latest_season,
      latest_episode: row.latest_episode,
    }));
  }

  search(q: string): RecentItem[] {
    const db = this.database.getDatabase();
    const imageBaseUrl = this.getImageBaseUrl();
    const pattern = "%" + q + "%";

    const rows = db
      .prepare(
        `SELECT
          CASE WHEN m.media_type = 'movie' THEN mf.id ELSE m.tmdb_id END AS id,
          m.title, m.release_date, m.poster_path, m.vote_average AS rating,
          m.media_type, MAX(mf.created_at) AS added_at
         FROM media_files mf
         JOIN metadata m ON m.media_file_id = mf.id
         WHERE mf.status IN ('ready', 'completed') AND m.title LIKE ? COLLATE NOCASE
         GROUP BY
           CASE WHEN m.media_type = 'movie' THEN mf.id ELSE m.tmdb_id END,
           m.title, m.release_date, m.poster_path, m.vote_average, m.media_type
         ORDER BY m.title ASC
         LIMIT 100`,
      )
      .all(pattern) as {
      id: number;
      title: string;
      release_date: string | null;
      poster_path: string | null;
      rating: number | null;
      media_type: string;
      added_at: string;
    }[];

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      year: this.extractYear(row.release_date),
      poster_url: this.buildPosterUrl(imageBaseUrl, row.poster_path),
      rating: row.rating,
      media_type: row.media_type,
      added_at: row.added_at,
      latest_season: null,
      latest_episode: null,
    }));
  }
}
