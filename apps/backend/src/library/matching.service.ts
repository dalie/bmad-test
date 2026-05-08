import { Injectable, Logger } from "@nestjs/common";
import Database from "better-sqlite3";
import { DatabaseService } from "../database/database.service";
import { FilenameParserService } from "./filename-parser.service";
import {
  TmdbService,
  TmdbSearchResult,
  TmdbUnavailableError,
  TmdbClientError,
} from "./tmdb.service";

export type MatchResult = "matched" | "match_failed" | "retry";

@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly filenameParser: FilenameParserService,
    private readonly tmdb: TmdbService,
  ) {}

  async matchFile(file: {
    id: number;
    filename: string;
    source_id: number;
    path: string;
  }): Promise<MatchResult> {
    const db = this.database.getDatabase();

    try {
      const source = db
        .prepare("SELECT type FROM media_sources WHERE id = ?")
        .get(file.source_id) as { type: "movies" | "tv" | "other" } | undefined;

      if (!source) {
        this.logger.error(`Source not found for file ${file.filename}`);
        this.setMatchFailed(db, file);
        return "match_failed";
      }

      // 'other' sources skip TMDB matching entirely
      if (source.type === "other") {
        db.prepare(
          "UPDATE media_files SET status = 'matched', updated_at = datetime('now') WHERE id = ?",
        ).run(file.id);
        this.logger.log(
          `Skipped TMDB matching for other source: ${file.filename}`,
        );
        return "matched";
      }

      const mediaType = source.type === "movies" ? "movie" : "tv";
      const parsed = this.filenameParser.parseFilename(
        file.filename,
        source.type,
      );

      if (!parsed.title) {
        this.logger.warn(
          `Could not parse title from filename: ${file.filename}`,
        );
        this.setMatchFailed(db, file);
        return "match_failed";
      }

      if (mediaType === "movie") {
        return await this.matchMovie(db, file, parsed.title, parsed.year);
      } else {
        return await this.matchTv(
          db,
          file,
          parsed.title,
          parsed.season,
          parsed.episode,
        );
      }
    } catch (err: any) {
      if (err instanceof TmdbUnavailableError) {
        this.logger.warn(
          `TMDB unavailable for ${file.filename}, will retry later`,
        );
        return "retry";
      }

      if (err instanceof TmdbClientError) {
        this.logger.error(
          `TMDB client error for ${file.filename}: ${err.message}`,
        );
        this.setMatchFailed(db, file, err.message);
        return "match_failed";
      }

      // Unexpected error
      this.logger.error(
        `Unexpected error matching ${file.filename}: ${err.message}`,
      );
      this.setMatchFailed(db, file, err.message);
      return "match_failed";
    }
  }

  private async matchMovie(
    db: Database.Database,
    file: { id: number; filename: string; path: string },
    title: string,
    year?: number,
  ): Promise<MatchResult> {
    const results = await this.tmdb.searchMovie(title, year);
    const best = this.pickBestMovie(results, year);

    if (!best) {
      this.setMatchFailed(db, file);
      return "match_failed";
    }

    const details = await this.tmdb.getMovieDetails(best.id);

    const persistMovieMatch = db.transaction(() => {
      const insertMetadata = db.prepare(`
        INSERT OR REPLACE INTO metadata 
        (media_file_id, tmdb_id, media_type, title, overview, poster_path, backdrop_path, vote_average, runtime, release_date, content_rating, genres, updated_at)
        VALUES (?, ?, 'movie', ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `);

      insertMetadata.run(
        file.id,
        details.id,
        details.title,
        details.overview || null,
        details.poster_path || null,
        details.backdrop_path || null,
        details.vote_average ?? null,
        details.runtime ?? null,
        details.release_date || null,
        null,
        details.genres
          ? JSON.stringify(details.genres.map((genre) => genre.name))
          : null,
      );

      db.prepare(
        "UPDATE media_files SET status = 'matched', updated_at = datetime('now') WHERE id = ?",
      ).run(file.id);
    });

    persistMovieMatch();

    this.logger.log(`Matched movie: ${file.filename} → ${details.title}`);
    return "matched";
  }

  private async matchTv(
    db: Database.Database,
    file: { id: number; filename: string; path: string },
    title: string,
    season?: number,
    episode?: number,
  ): Promise<MatchResult> {
    if (season === undefined || episode === undefined) {
      this.setMatchFailed(
        db,
        file,
        "Could not parse season/episode from filename",
      );
      return "match_failed";
    }

    const results = await this.tmdb.searchTv(title);
    const best = this.pickBestTv(results);

    if (!best) {
      this.setMatchFailed(db, file);
      return "match_failed";
    }

    const details = await this.tmdb.getTvDetails(best.id);
    const seasonDetails = await this.tmdb.getTvSeasonDetails(best.id, season);
    const episodes = seasonDetails?.episodes || [];
    const matchedEpisode = episodes.find(
      (candidate) => candidate.episode_number === episode,
    );

    if (!matchedEpisode) {
      this.setMatchFailed(
        db,
        file,
        `Episode S${season}E${episode} not found in TMDB season data`,
      );
      return "match_failed";
    }

    const persistTvMatch = db.transaction(() => {
      const insertMetadata = db.prepare(`
        INSERT OR REPLACE INTO metadata 
        (media_file_id, tmdb_id, media_type, title, overview, poster_path, backdrop_path, vote_average, runtime, release_date, content_rating, genres, updated_at)
        VALUES (?, ?, 'tv', ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `);

      insertMetadata.run(
        file.id,
        details.id,
        details.name,
        details.overview || null,
        details.poster_path || null,
        details.backdrop_path || null,
        details.vote_average ?? null,
        null,
        details.first_air_date || null,
        null,
        details.genres
          ? JSON.stringify(details.genres.map((genre) => genre.name))
          : null,
      );

      const metadataRow = db
        .prepare("SELECT id FROM metadata WHERE media_file_id = ?")
        .get(file.id) as { id: number };

      db.prepare("DELETE FROM tv_episodes WHERE metadata_id = ?").run(
        metadataRow.id,
      );

      db.prepare(
        `
        INSERT INTO tv_episodes (metadata_id, season_number, episode_number, name, overview, air_date, still_path)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      ).run(
        metadataRow.id,
        season,
        matchedEpisode.episode_number,
        matchedEpisode.name || null,
        matchedEpisode.overview || null,
        matchedEpisode.air_date || null,
        matchedEpisode.still_path || null,
      );

      db.prepare(
        "UPDATE media_files SET status = 'matched', updated_at = datetime('now') WHERE id = ?",
      ).run(file.id);
    });

    persistTvMatch();

    this.logger.log(`Matched TV: ${file.filename} → ${details.name}`);
    return "matched";
  }

  private pickBestMovie(
    results: TmdbSearchResult[],
    parsedYear?: number,
  ): TmdbSearchResult | null {
    if (results.length === 0) return null;

    if (parsedYear) {
      const yearMatches = results.filter(
        (r) =>
          r.release_date &&
          parseInt(r.release_date.substring(0, 4)) === parsedYear,
      );
      if (yearMatches.length > 0) {
        return yearMatches.sort((a, b) => b.popularity - a.popularity)[0];
      }
    }

    // Fallback: highest popularity regardless of year
    return results.sort((a, b) => b.popularity - a.popularity)[0];
  }

  private pickBestTv(results: TmdbSearchResult[]): TmdbSearchResult | null {
    if (results.length === 0) return null;
    return results.sort((a, b) => b.popularity - a.popularity)[0];
  }

  private setMatchFailed(
    db: Database.Database,
    file: { id: number; path: string },
    errorMessage?: string,
  ): void {
    db.prepare(
      "UPDATE media_files SET status = 'match_failed', updated_at = datetime('now') WHERE id = ?",
    ).run(file.id);

    db.prepare(
      "INSERT INTO scan_errors (file_path, error_type, error_message) VALUES (?, ?, ?)",
    ).run(file.path, "MATCH_FAILED", errorMessage || "No TMDB match found");
  }

  async applyManualMatch(
    file: { id: number; filename: string; path: string; source_id: number },
    tmdbId: number,
    mediaType: "movie" | "tv",
  ): Promise<{
    status: string;
    metadata: { title: string; tmdb_id: number; poster_path: string | null };
  }> {
    const db = this.database.getDatabase();

    if (mediaType === "movie") {
      const details = await this.tmdb.getMovieDetails(tmdbId);

      const persistMovieMatch = db.transaction(() => {
        db.prepare(
          `
          INSERT OR REPLACE INTO metadata 
          (media_file_id, tmdb_id, media_type, title, overview, poster_path, backdrop_path, vote_average, runtime, release_date, content_rating, genres, updated_at)
          VALUES (?, ?, 'movie', ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `,
        ).run(
          file.id,
          details.id,
          details.title,
          details.overview || null,
          details.poster_path || null,
          details.backdrop_path || null,
          details.vote_average ?? null,
          details.runtime ?? null,
          details.release_date || null,
          null,
          details.genres
            ? JSON.stringify(details.genres.map((genre) => genre.name))
            : null,
        );

        db.prepare(
          "UPDATE media_files SET status = 'matched', updated_at = datetime('now') WHERE id = ?",
        ).run(file.id);
      });

      persistMovieMatch();

      this.logger.log(
        `Manual match movie: ${file.filename} → ${details.title}`,
      );
      return {
        status: "matched",
        metadata: {
          title: details.title,
          tmdb_id: details.id,
          poster_path: details.poster_path,
        },
      };
    } else {
      const details = await this.tmdb.getTvDetails(tmdbId);

      // Parse season/episode from filename
      const parsed = this.filenameParser.parseFilename(file.filename, "tv");

      const persistTvMatch = db.transaction(() => {
        db.prepare(
          `
          INSERT OR REPLACE INTO metadata 
          (media_file_id, tmdb_id, media_type, title, overview, poster_path, backdrop_path, vote_average, runtime, release_date, content_rating, genres, updated_at)
          VALUES (?, ?, 'tv', ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `,
        ).run(
          file.id,
          details.id,
          details.name,
          details.overview || null,
          details.poster_path || null,
          details.backdrop_path || null,
          details.vote_average ?? null,
          null,
          details.first_air_date || null,
          null,
          details.genres
            ? JSON.stringify(details.genres.map((genre) => genre.name))
            : null,
        );

        db.prepare(
          "UPDATE media_files SET status = 'matched', updated_at = datetime('now') WHERE id = ?",
        ).run(file.id);
      });

      // Fetch episode data before committing if season/episode is parseable
      if (parsed.season !== undefined && parsed.episode !== undefined) {
        const seasonDetails = await this.tmdb.getTvSeasonDetails(
          tmdbId,
          parsed.season,
        );
        const episodes = seasonDetails?.episodes || [];
        const matchedEpisode = episodes.find(
          (ep) => ep.episode_number === parsed.episode,
        );

        if (!matchedEpisode) {
          throw new Error(
            `EPISODE_NOT_FOUND: S${parsed.season}E${parsed.episode} not in TMDB season data`,
          );
        }

        // Commit metadata + status + episode in one transaction
        const persistTvMatchWithEpisode = db.transaction(() => {
          persistTvMatch();

          const metadataRow = db
            .prepare("SELECT id FROM metadata WHERE media_file_id = ?")
            .get(file.id) as { id: number };

          db.prepare("DELETE FROM tv_episodes WHERE metadata_id = ?").run(
            metadataRow.id,
          );

          db.prepare(
            `
            INSERT INTO tv_episodes (metadata_id, season_number, episode_number, name, overview, air_date, still_path)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
          ).run(
            metadataRow.id,
            parsed.season,
            matchedEpisode.episode_number,
            matchedEpisode.name || null,
            matchedEpisode.overview || null,
            matchedEpisode.air_date || null,
            matchedEpisode.still_path || null,
          );
        });

        persistTvMatchWithEpisode();
      } else {
        // No season/episode parseable — still match at show level only
        persistTvMatch();
        this.logger.warn(
          `Manual match: Could not parse season/episode from filename: ${file.filename}`,
        );
      }

      this.logger.log(`Manual match TV: ${file.filename} → ${details.name}`);
      return {
        status: "matched",
        metadata: {
          title: details.name,
          tmdb_id: details.id,
          poster_path: details.poster_path,
        },
      };
    }
  }
}
