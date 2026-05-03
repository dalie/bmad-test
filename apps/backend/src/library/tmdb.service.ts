import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DatabaseService } from "../database/database.service";

// --- Interfaces ---

export interface TmdbSearchResult {
  id: number;
  title?: string;
  name?: string;
  overview: string;
  poster_path: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average: number;
  popularity: number;
}

export interface TmdbMovieDetails {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  runtime: number | null;
  release_date: string;
  genres: { id: number; name: string }[];
  production_countries: { iso_3166_1: string; name: string }[];
}

export interface TmdbTvDetails {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  first_air_date: string;
  genres: { id: number; name: string }[];
  number_of_seasons: number;
}

export interface TmdbSeasonDetails {
  season_number: number;
  episodes: {
    episode_number: number;
    name: string;
    overview: string;
    air_date: string | null;
    still_path: string | null;
  }[];
}

// --- Custom Error Classes ---

export class TmdbUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TmdbUnavailableError";
  }
}

export class TmdbClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TmdbClientError";
  }
}

// --- Service ---

const TMDB_BASE = "https://api.themoviedb.org";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

@Injectable()
export class TmdbService {
  private readonly logger = new Logger(TmdbService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly database: DatabaseService,
  ) {}

  async searchMovie(title: string, year?: number): Promise<TmdbSearchResult[]> {
    const params = new URLSearchParams({
      query: title,
      language: "en-US",
      page: "1",
    });
    if (year) params.set("year", String(year));

    const data = await this.fetchWithRetry(
      `${TMDB_BASE}/3/search/movie?${params}`,
    );
    return data.results ?? [];
  }

  async searchTv(title: string, year?: number): Promise<TmdbSearchResult[]> {
    const params = new URLSearchParams({
      query: title,
      language: "en-US",
      page: "1",
    });
    if (year) params.set("first_air_date_year", String(year));

    const data = await this.fetchWithRetry(
      `${TMDB_BASE}/3/search/tv?${params}`,
    );
    return data.results ?? [];
  }

  async getMovieDetails(tmdbId: number): Promise<TmdbMovieDetails> {
    return this.fetchWithRetry(`${TMDB_BASE}/3/movie/${tmdbId}?language=en-US`);
  }

  async getTvDetails(tmdbId: number): Promise<TmdbTvDetails> {
    return this.fetchWithRetry(`${TMDB_BASE}/3/tv/${tmdbId}?language=en-US`);
  }

  async getTvSeasonDetails(
    tmdbId: number,
    seasonNum: number,
  ): Promise<TmdbSeasonDetails> {
    return this.fetchWithRetry(
      `${TMDB_BASE}/3/tv/${tmdbId}/season/${seasonNum}?language=en-US`,
    );
  }

  async getImageBaseUrl(): Promise<string> {
    const db = this.database.getDatabase();
    const row = db
      .prepare(
        "SELECT id, image_base_url, last_fetched FROM tmdb_config LIMIT 1",
      )
      .get() as
      | { id: number; image_base_url: string; last_fetched: string }
      | undefined;

    if (row) {
      const fetchedAt = new Date(row.last_fetched + "Z").getTime();
      if (Date.now() - fetchedAt < CACHE_TTL_MS) {
        return row.image_base_url;
      }
    }

    // Fetch fresh configuration
    const data = await this.fetchWithRetry(`${TMDB_BASE}/3/configuration`);
    const baseUrl = data.images?.secure_base_url;
    if (!baseUrl) {
      throw new TmdbClientError("Unexpected TMDB configuration response");
    }

    if (row) {
      db.prepare(
        "UPDATE tmdb_config SET image_base_url = ?, last_fetched = datetime('now') WHERE id = ?",
      ).run(baseUrl, row.id);
    } else {
      db.prepare("INSERT INTO tmdb_config (image_base_url) VALUES (?)").run(
        baseUrl,
      );
    }

    return baseUrl;
  }

  private async fetchWithRetry(url: string): Promise<any> {
    const apiKey = this.config.get<string>("TMDB_API_KEY");
    if (!apiKey) {
      throw new TmdbClientError("TMDB_API_KEY not configured");
    }

    let lastError: Error | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: "application/json",
          },
        });

        if (response.status === 429) {
          if (attempt === 2) {
            throw new TmdbUnavailableError(
              "TMDB rate limited after 3 attempts",
            );
          }
          const parsed = parseInt(
            response.headers.get("Retry-After") || "1",
            10,
          );
          const retryAfter = Number.isNaN(parsed) ? 1 : parsed;
          const delay = Math.max(
            retryAfter * 1000,
            Math.pow(2, attempt) * 1000,
          );
          this.logger.warn(
            `TMDB rate limited, retrying in ${delay}ms (attempt ${attempt + 1})`,
          );
          await this.delay(delay);
          continue;
        }

        if (response.status >= 500) {
          throw new TmdbUnavailableError(`TMDB returned ${response.status}`);
        }

        if (!response.ok) {
          throw new TmdbClientError(
            `TMDB returned ${response.status}: ${await response.text()}`,
          );
        }

        return await response.json();
      } catch (err) {
        if (
          err instanceof TmdbUnavailableError ||
          err instanceof TmdbClientError
        ) {
          throw err;
        }
        lastError = err as Error;
        if (attempt === 2) {
          throw new TmdbUnavailableError(`Network error: ${lastError.message}`);
        }
        await this.delay(Math.pow(2, attempt) * 1000);
      }
    }
    throw new TmdbUnavailableError(
      lastError?.message || "Max retries exceeded",
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
