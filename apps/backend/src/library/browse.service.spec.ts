import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import Database from "better-sqlite3";
import { BrowseService } from "./browse.service";
import { DatabaseService } from "../database/database.service";

describe("BrowseService", () => {
  let service: BrowseService;
  let dbService: DatabaseService;
  let db: Database.Database;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BrowseService,
        DatabaseService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === "CACHE_PATH") return ":memory:";
              return undefined;
            },
          },
        },
      ],
    }).compile();

    dbService = module.get<DatabaseService>(DatabaseService);
    dbService.onModuleInit();
    db = dbService.getDatabase();

    service = module.get<BrowseService>(BrowseService);
  });

  afterEach(() => {
    dbService.onModuleDestroy();
  });

  // ── Helpers ──────────────────────────────────────────────────────────────

  function insertSource(type: "movies" | "tv" = "movies"): number {
    return db
      .prepare("INSERT INTO media_sources (path, type) VALUES (?, ?)")
      .run(`/media/${type}`, type).lastInsertRowid as number;
  }

  function insertMediaFile(
    sourceId: number,
    filename: string,
    status = "ready",
    tier: number | null = 1,
  ): number {
    return db
      .prepare(
        "INSERT INTO media_files (path, filename, source_id, status, tier) VALUES (?, ?, ?, ?, ?)",
      )
      .run(`/media/${filename}`, filename, sourceId, status, tier)
      .lastInsertRowid as number;
  }

  function insertMediaFileWithProbeData(
    sourceId: number,
    filename: string,
    probeDataJson: string,
    status = "ready",
    tier: number | null = 1,
  ): number {
    return db
      .prepare(
        "INSERT INTO media_files (path, filename, source_id, status, tier, probe_data) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(`/media/${filename}`, filename, sourceId, status, tier, probeDataJson)
      .lastInsertRowid as number;
  }

  function insertMetadata(
    fileId: number,
    tmdbId: number,
    mediaType: "movie" | "tv",
    title: string,
    extras: {
      release_date?: string;
      poster_path?: string;
      overview?: string;
      vote_average?: number;
      runtime?: number;
      content_rating?: string;
    } = {},
  ): number {
    return db
      .prepare(
        `INSERT INTO metadata
           (media_file_id, tmdb_id, media_type, title, release_date, poster_path, overview, vote_average, runtime, content_rating)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        fileId,
        tmdbId,
        mediaType,
        title,
        extras.release_date ?? null,
        extras.poster_path ?? null,
        extras.overview ?? null,
        extras.vote_average ?? null,
        extras.runtime ?? null,
        extras.content_rating ?? null,
      ).lastInsertRowid as number;
  }

  function insertTvEpisode(
    metadataId: number,
    seasonNumber: number,
    episodeNumber: number,
    name?: string,
  ): number {
    return db
      .prepare(
        "INSERT INTO tv_episodes (metadata_id, season_number, episode_number, name) VALUES (?, ?, ?, ?)",
      )
      .run(metadataId, seasonNumber, episodeNumber, name ?? null)
      .lastInsertRowid as number;
  }

  function insertTranscodeJob(
    fileId: number,
    tier: number,
    status: string,
    outputPath?: string,
  ): number {
    return db
      .prepare(
        "INSERT INTO transcode_jobs (file_id, tier, status, output_path) VALUES (?, ?, ?, ?)",
      )
      .run(fileId, tier, status, outputPath ?? null).lastInsertRowid as number;
  }

  function insertSubtitle(
    mediaFileId: number,
    type: "embedded" | "sidecar",
    language?: string,
    webvttPath?: string,
  ): number {
    return db
      .prepare(
        "INSERT INTO subtitles (media_file_id, type, language, webvtt_path) VALUES (?, ?, ?, ?)",
      )
      .run(mediaFileId, type, language ?? null, webvttPath ?? null)
      .lastInsertRowid as number;
  }

  function insertTmdbConfig(imageBaseUrl: string): void {
    db.prepare(
      "INSERT INTO tmdb_config (image_base_url, last_fetched) VALUES (?, datetime('now'))",
    ).run(imageBaseUrl);
  }

  // ── getMovies() ───────────────────────────────────────────────────────────

  describe("getMovies()", () => {
    it("should return [] when DB is empty", () => {
      expect(service.getMovies()).toEqual([]);
    });

    it("should return a single ready movie with correct fields", () => {
      insertTmdbConfig("https://image.tmdb.org/t/p/");
      const sourceId = insertSource("movies");
      const fileId = insertMediaFile(sourceId, "movie.mkv", "ready", 1);
      insertMetadata(fileId, 100, "movie", "Test Movie", {
        release_date: "2023-07-15",
        poster_path: "/abc.jpg",
        runtime: 120,
        vote_average: 7.5,
      });

      const results = service.getMovies();
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        id: fileId,
        title: "Test Movie",
        year: 2023,
        poster_url: "https://image.tmdb.org/t/p/w500/abc.jpg",
        runtime: 120,
        rating: 7.5,
        transcode_tier: 1,
        playback_ready: true,
      });
    });

    it("should include movies with status=completed", () => {
      const sourceId = insertSource("movies");
      const fileId = insertMediaFile(sourceId, "movie.mkv", "completed", 1);
      insertMetadata(fileId, 101, "movie", "Completed Movie");

      const results = service.getMovies();
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(fileId);
    });

    it("should NOT include movies with status=classified", () => {
      const sourceId = insertSource("movies");
      const fileId = insertMediaFile(sourceId, "movie.mkv", "classified", 1);
      insertMetadata(fileId, 102, "movie", "Not Ready Movie");

      expect(service.getMovies()).toEqual([]);
    });

    it("should return multiple movies ordered A-Z by title", () => {
      const sourceId = insertSource("movies");
      const f1 = insertMediaFile(sourceId, "zebra.mkv", "ready", 1);
      const f2 = insertMediaFile(sourceId, "alpha.mkv", "ready", 1);
      insertMetadata(f1, 200, "movie", "Zebra Movie");
      insertMetadata(f2, 201, "movie", "Alpha Movie");

      const results = service.getMovies();
      expect(results[0].title).toBe("Alpha Movie");
      expect(results[1].title).toBe("Zebra Movie");
    });

    it("should return null poster_url when poster_path is null", () => {
      insertTmdbConfig("https://image.tmdb.org/t/p/");
      const sourceId = insertSource("movies");
      const fileId = insertMediaFile(sourceId, "movie.mkv", "ready", 1);
      insertMetadata(fileId, 103, "movie", "No Poster Movie", {
        poster_path: undefined,
      });

      const results = service.getMovies();
      expect(results[0].poster_url).toBeNull();
    });

    it("should return null poster_url when tmdb_config is missing", () => {
      const sourceId = insertSource("movies");
      const fileId = insertMediaFile(sourceId, "movie.mkv", "ready", 1);
      insertMetadata(fileId, 104, "movie", "No Config Movie", {
        poster_path: "/abc.jpg",
      });

      const results = service.getMovies();
      expect(results[0].poster_url).toBeNull();
    });

    it("should construct poster_url correctly", () => {
      insertTmdbConfig("https://image.tmdb.org/t/p/");
      const sourceId = insertSource("movies");
      const fileId = insertMediaFile(sourceId, "movie.mkv", "ready", 1);
      insertMetadata(fileId, 105, "movie", "Poster Movie", {
        poster_path: "/xyz.jpg",
      });

      const results = service.getMovies();
      expect(results[0].poster_url).toBe("https://image.tmdb.org/t/p/w500/xyz.jpg");
    });

    it("should set playback_ready=true for all returned movies", () => {
      const sourceId = insertSource("movies");
      const f1 = insertMediaFile(sourceId, "m1.mkv", "ready", 1);
      const f2 = insertMediaFile(sourceId, "m2.mkv", "completed", 1);
      insertMetadata(f1, 301, "movie", "Movie One");
      insertMetadata(f2, 302, "movie", "Movie Two");

      const results = service.getMovies();
      expect(results.every((r) => r.playback_ready === true)).toBe(true);
    });
  });

  // ── getShows() ────────────────────────────────────────────────────────────

  describe("getShows()", () => {
    it("should return [] when DB is empty", () => {
      expect(service.getShows()).toEqual([]);
    });

    it("should return a single show with correct season_count", () => {
      insertTmdbConfig("https://image.tmdb.org/t/p/");
      const sourceId = insertSource("tv");

      // Episode 1 (season 1)
      const f1 = insertMediaFile(sourceId, "show.s01e01.mkv", "ready", 1);
      const m1 = insertMetadata(f1, 500, "tv", "Great Show", {
        release_date: "2021-01-01",
        poster_path: "/show.jpg",
        vote_average: 8.0,
      });
      insertTvEpisode(m1, 1, 1, "Pilot");

      // Episode 2 (season 2)
      const f2 = insertMediaFile(sourceId, "show.s02e01.mkv", "ready", 1);
      const m2 = insertMetadata(f2, 500, "tv", "Great Show", {
        release_date: "2022-01-01",
        poster_path: "/show.jpg",
        vote_average: 8.0,
      });
      insertTvEpisode(m2, 2, 1, "New Season");

      const results = service.getShows();
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        id: 500,
        title: "Great Show",
        year: 2021,
        season_count: 2,
        poster_url: "https://image.tmdb.org/t/p/w500/show.jpg",
      });
    });

    it("should include shows with status=completed", () => {
      const sourceId = insertSource("tv");
      const f1 = insertMediaFile(sourceId, "show.s01e01.mkv", "completed", 1);
      const m1 = insertMetadata(f1, 501, "tv", "Completed Show");
      insertTvEpisode(m1, 1, 1);

      expect(service.getShows()).toHaveLength(1);
    });

    it("should NOT include shows where all episodes are non-ready", () => {
      const sourceId = insertSource("tv");
      const f1 = insertMediaFile(sourceId, "show.s01e01.mkv", "classified", 1);
      const m1 = insertMetadata(f1, 502, "tv", "Not Ready Show");
      insertTvEpisode(m1, 1, 1);

      expect(service.getShows()).toEqual([]);
    });

    it("should return multiple shows ordered A-Z", () => {
      const sourceId = insertSource("tv");
      const f1 = insertMediaFile(sourceId, "z.s01e01.mkv", "ready", 1);
      const f2 = insertMediaFile(sourceId, "a.s01e01.mkv", "ready", 1);
      const m1 = insertMetadata(f1, 503, "tv", "Zebra Show");
      const m2 = insertMetadata(f2, 504, "tv", "Alpha Show");
      insertTvEpisode(m1, 1, 1);
      insertTvEpisode(m2, 1, 1);

      const results = service.getShows();
      expect(results[0].title).toBe("Alpha Show");
      expect(results[1].title).toBe("Zebra Show");
    });

    it("should set added_at to MIN(created_at) across all episodes", () => {
      const sourceId = insertSource("tv");
      // Insert first episode with an earlier timestamp
      db.prepare(
        "INSERT INTO media_files (path, filename, source_id, status, tier, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).run("/media/ep1.mkv", "ep1.mkv", sourceId, "ready", 1, "2023-01-01T00:00:00");
      const f1Id = db.prepare("SELECT last_insert_rowid() AS id").get() as { id: number };

      db.prepare(
        "INSERT INTO media_files (path, filename, source_id, status, tier, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).run("/media/ep2.mkv", "ep2.mkv", sourceId, "ready", 1, "2023-06-01T00:00:00");
      const f2Id = db.prepare("SELECT last_insert_rowid() AS id").get() as { id: number };

      const m1 = insertMetadata(f1Id.id, 505, "tv", "Old Show");
      const m2 = insertMetadata(f2Id.id, 505, "tv", "Old Show");
      insertTvEpisode(m1, 1, 1);
      insertTvEpisode(m2, 1, 2);

      const results = service.getShows();
      expect(results[0].added_at).toBe("2023-01-01T00:00:00");
    });
  });

  // ── getMovieById() ────────────────────────────────────────────────────────

  describe("getMovieById()", () => {
    it("should return null for non-existent id", () => {
      expect(service.getMovieById(999)).toBeNull();
    });

    it("should return full MovieDetail for existing movie", () => {
      insertTmdbConfig("https://image.tmdb.org/t/p/");
      const sourceId = insertSource("movies");
      const fileId = insertMediaFile(sourceId, "movie.mkv", "ready", 2);
      insertMetadata(fileId, 600, "movie", "Detail Movie", {
        release_date: "2020-05-10",
        poster_path: "/poster.jpg",
        overview: "A great film",
        vote_average: 9.1,
        runtime: 150,
        content_rating: "PG-13",
      });

      const result = service.getMovieById(fileId);
      expect(result).not.toBeNull();
      expect(result!.title).toBe("Detail Movie");
      expect(result!.description).toBe("A great film");
      expect(result!.year).toBe(2020);
      expect(result!.poster_url).toBe("https://image.tmdb.org/t/p/w500/poster.jpg");
      expect(result!.runtime).toBe(150);
      expect(result!.rating).toBe(9.1);
      expect(result!.content_rating).toBe("PG-13");
      expect(result!.file_id).toBe(fileId);
      expect(result!.tier).toBe(2);
    });

    it("should parse audio tracks from probe_data correctly", () => {
      const sourceId = insertSource("movies");
      const probeData = JSON.stringify({
        format: { container: "mkv", duration: 7200, bitrate: 5000 },
        video: { codec: "h264", width: 1920, height: 1080 },
        audioTracks: [
          { index: 0, codec: "aac", channels: 2, language: "eng" },
          { index: 1, codec: "ac3", channels: 6, language: "spa" },
        ],
        subtitleTracks: [],
      });
      const fileId = insertMediaFileWithProbeData(sourceId, "movie.mkv", probeData, "ready", 1);
      insertMetadata(fileId, 601, "movie", "Audio Movie");

      const result = service.getMovieById(fileId);
      expect(result!.audio_tracks).toHaveLength(2);
      expect(result!.audio_tracks[0]).toMatchObject({
        index: 0,
        codec: "aac",
        channels: 2,
        language: "eng",
      });
      expect(result!.audio_tracks[1]).toMatchObject({
        index: 1,
        codec: "ac3",
        channels: 6,
        language: "spa",
      });
    });

    it("should return [] audio_tracks when no probe_data", () => {
      const sourceId = insertSource("movies");
      const fileId = insertMediaFile(sourceId, "movie.mkv", "ready", 1);
      insertMetadata(fileId, 602, "movie", "No Probe Movie");

      const result = service.getMovieById(fileId);
      expect(result!.audio_tracks).toEqual([]);
    });

    it("should include subtitles in subtitle_tracks", () => {
      const sourceId = insertSource("movies");
      const fileId = insertMediaFile(sourceId, "movie.mkv", "ready", 1);
      insertMetadata(fileId, 603, "movie", "Sub Movie");
      insertSubtitle(fileId, "embedded", "eng", "/data/subtitles/1.vtt");
      insertSubtitle(fileId, "sidecar", "spa", "/data/subtitles/2.vtt");

      const result = service.getMovieById(fileId);
      expect(result!.subtitle_tracks).toHaveLength(2);
      expect(result!.subtitle_tracks[0]).toMatchObject({
        type: "embedded",
        language: "eng",
        webvtt_path: "/data/subtitles/1.vtt",
      });
    });

    it("should return [] subtitle_tracks when no subtitles", () => {
      const sourceId = insertSource("movies");
      const fileId = insertMediaFile(sourceId, "movie.mkv", "ready", 1);
      insertMetadata(fileId, 604, "movie", "No Sub Movie");

      const result = service.getMovieById(fileId);
      expect(result!.subtitle_tracks).toEqual([]);
    });

    it("should include transcode_output_path for Tier 2 movie", () => {
      const sourceId = insertSource("movies");
      const fileId = insertMediaFile(sourceId, "movie.mkv", "ready", 2);
      insertMetadata(fileId, 605, "movie", "Tier2 Movie");
      insertTranscodeJob(fileId, 2, "completed", `/cache/sidecars/${fileId}.m4a`);

      const result = service.getMovieById(fileId);
      expect(result!.transcode_output_path).toBe(`/cache/sidecars/${fileId}.m4a`);
    });

    it("should return null transcode_output_path for Tier 1 movie with no transcode job", () => {
      const sourceId = insertSource("movies");
      const fileId = insertMediaFile(sourceId, "movie.mkv", "ready", 1);
      insertMetadata(fileId, 606, "movie", "Tier1 Movie");

      const result = service.getMovieById(fileId);
      expect(result!.transcode_output_path).toBeNull();
    });

    it("should return null for movie with status=classified", () => {
      const sourceId = insertSource("movies");
      const fileId = insertMediaFile(sourceId, "movie.mkv", "classified", 1);
      insertMetadata(fileId, 607, "movie", "Not Ready Movie");

      expect(service.getMovieById(fileId)).toBeNull();
    });

    it("should return null for TV show file queried via getMovieById", () => {
      const sourceId = insertSource("tv");
      const fileId = insertMediaFile(sourceId, "show.s01e01.mkv", "ready", 1);
      const metaId = insertMetadata(fileId, 700, "tv", "Some Show");
      insertTvEpisode(metaId, 1, 1);

      expect(service.getMovieById(fileId)).toBeNull();
    });
  });

  // ── getShowById() ─────────────────────────────────────────────────────────

  describe("getShowById()", () => {
    it("should return null for non-existent tmdbId", () => {
      expect(service.getShowById(9999)).toBeNull();
    });

    it("should return ShowDetail for a show with one season and two episodes", () => {
      insertTmdbConfig("https://image.tmdb.org/t/p/");
      const sourceId = insertSource("tv");

      const probeData = JSON.stringify({ format: { duration: 1800, container: "mp4", bitrate: 2000 }, video: null, audioTracks: [], subtitleTracks: [] });

      const f1 = insertMediaFileWithProbeData(sourceId, "s01e01.mkv", probeData, "ready", 1);
      const f2 = insertMediaFileWithProbeData(sourceId, "s01e02.mkv", probeData, "ready", 1);
      const m1 = insertMetadata(f1, 800, "tv", "My Show", {
        release_date: "2022-03-01",
        poster_path: "/show.jpg",
        overview: "A show",
        vote_average: 7.8,
      });
      const m2 = insertMetadata(f2, 800, "tv", "My Show", {
        release_date: "2022-03-01",
        poster_path: "/show.jpg",
        overview: "A show",
        vote_average: 7.8,
      });
      insertTvEpisode(m1, 1, 1, "Episode 1");
      insertTvEpisode(m2, 1, 2, "Episode 2");

      const result = service.getShowById(800);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(800);
      expect(result!.title).toBe("My Show");
      expect(result!.seasons).toHaveLength(1);
      expect(result!.seasons[0].season_number).toBe(1);
      expect(result!.seasons[0].episodes).toHaveLength(2);
    });

    it("should order seasons DESC (latest first)", () => {
      const sourceId = insertSource("tv");
      const f1 = insertMediaFile(sourceId, "s01e01.mkv", "ready", 1);
      const f2 = insertMediaFile(sourceId, "s02e01.mkv", "ready", 1);
      const f3 = insertMediaFile(sourceId, "s03e01.mkv", "ready", 1);
      const m1 = insertMetadata(f1, 801, "tv", "Seasons Show");
      const m2 = insertMetadata(f2, 801, "tv", "Seasons Show");
      const m3 = insertMetadata(f3, 801, "tv", "Seasons Show");
      insertTvEpisode(m1, 1, 1);
      insertTvEpisode(m2, 2, 1);
      insertTvEpisode(m3, 3, 1);

      const result = service.getShowById(801);
      expect(result!.seasons[0].season_number).toBe(3);
      expect(result!.seasons[1].season_number).toBe(2);
      expect(result!.seasons[2].season_number).toBe(1);
    });

    it("should order episodes within season ASC by episode_number", () => {
      const sourceId = insertSource("tv");
      const f1 = insertMediaFile(sourceId, "s01e03.mkv", "ready", 1);
      const f2 = insertMediaFile(sourceId, "s01e01.mkv", "ready", 1);
      const f3 = insertMediaFile(sourceId, "s01e02.mkv", "ready", 1);
      const m1 = insertMetadata(f1, 802, "tv", "Ep Order Show");
      const m2 = insertMetadata(f2, 802, "tv", "Ep Order Show");
      const m3 = insertMetadata(f3, 802, "tv", "Ep Order Show");
      insertTvEpisode(m1, 1, 3, "Episode 3");
      insertTvEpisode(m2, 1, 1, "Episode 1");
      insertTvEpisode(m3, 1, 2, "Episode 2");

      const result = service.getShowById(802);
      const episodes = result!.seasons[0].episodes;
      expect(episodes[0].episode_number).toBe(1);
      expect(episodes[1].episode_number).toBe(2);
      expect(episodes[2].episode_number).toBe(3);
    });

    it("should include multiple seasons all present", () => {
      const sourceId = insertSource("tv");
      for (let season = 1; season <= 4; season++) {
        const f = insertMediaFile(sourceId, `show.s0${season}e01.mkv`, "ready", 1);
        const m = insertMetadata(f, 803, "tv", "Multi Season Show");
        insertTvEpisode(m, season, 1);
      }

      const result = service.getShowById(803);
      expect(result!.seasons).toHaveLength(4);
    });

    it("should extract episode duration from probe_data", () => {
      const sourceId = insertSource("tv");
      const probeData = JSON.stringify({
        format: { container: "mkv", duration: 2700, bitrate: 4000 },
        video: null,
        audioTracks: [],
        subtitleTracks: [],
      });
      const f1 = insertMediaFileWithProbeData(sourceId, "s01e01.mkv", probeData, "ready", 1);
      const m1 = insertMetadata(f1, 804, "tv", "Duration Show");
      insertTvEpisode(m1, 1, 1, "Ep1");

      const result = service.getShowById(804);
      expect(result!.seasons[0].episodes[0].duration).toBe(2700);
    });

    it("should include file_id = media_files.id for each episode", () => {
      const sourceId = insertSource("tv");
      const f1 = insertMediaFile(sourceId, "s01e01.mkv", "ready", 1);
      const m1 = insertMetadata(f1, 805, "tv", "File ID Show");
      insertTvEpisode(m1, 1, 1);

      const result = service.getShowById(805);
      expect(result!.seasons[0].episodes[0].file_id).toBe(f1);
    });

    it("should return null when show has no ready episodes", () => {
      const sourceId = insertSource("tv");
      const f1 = insertMediaFile(sourceId, "s01e01.mkv", "classified", 1);
      const m1 = insertMetadata(f1, 806, "tv", "Not Ready Show");
      insertTvEpisode(m1, 1, 1);

      expect(service.getShowById(806)).toBeNull();
    });
  });

  // ── getRecent() ───────────────────────────────────────────────────────────

  describe("getRecent()", () => {
    it("should return [] when DB is empty", () => {
      expect(service.getRecent(20)).toEqual([]);
    });

    it("should return mixed movies and TV shows ordered by added_at DESC", () => {
      const movieSourceId = insertSource("movies");
      const tvSourceId = insertSource("tv");

      db.prepare(
        "INSERT INTO media_files (path, filename, source_id, status, tier, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).run("/media/movie.mkv", "movie.mkv", movieSourceId, "ready", 1, "2023-01-01T00:00:00");
      const movieFileId = (db.prepare("SELECT last_insert_rowid() AS id").get() as { id: number }).id;

      db.prepare(
        "INSERT INTO media_files (path, filename, source_id, status, tier, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).run("/media/ep.mkv", "ep.mkv", tvSourceId, "ready", 1, "2023-06-01T00:00:00");
      const tvFileId = (db.prepare("SELECT last_insert_rowid() AS id").get() as { id: number }).id;

      insertMetadata(movieFileId, 900, "movie", "Old Movie");
      const tvMeta = insertMetadata(tvFileId, 901, "tv", "New Show");
      insertTvEpisode(tvMeta, 1, 1);

      const results = service.getRecent(20);
      expect(results).toHaveLength(2);
      expect(results[0].media_type).toBe("tv");
      expect(results[1].media_type).toBe("movie");
    });

    it("should collapse TV show episodes to one entry (grouped by tmdb_id)", () => {
      const sourceId = insertSource("tv");
      const f1 = insertMediaFile(sourceId, "ep1.mkv", "ready", 1);
      const f2 = insertMediaFile(sourceId, "ep2.mkv", "ready", 1);
      const f3 = insertMediaFile(sourceId, "ep3.mkv", "ready", 1);
      const m1 = insertMetadata(f1, 950, "tv", "Big Show");
      const m2 = insertMetadata(f2, 950, "tv", "Big Show");
      const m3 = insertMetadata(f3, 950, "tv", "Big Show");
      insertTvEpisode(m1, 1, 1);
      insertTvEpisode(m2, 1, 2);
      insertTvEpisode(m3, 1, 3);

      const results = service.getRecent(20);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(950);
    });

    it("should respect the limit parameter", () => {
      const sourceId = insertSource("movies");
      for (let i = 0; i < 5; i++) {
        const f = insertMediaFile(sourceId, `movie${i}.mkv`, "ready", 1);
        insertMetadata(f, 1000 + i, "movie", `Movie ${i}`);
      }

      const results = service.getRecent(3);
      expect(results).toHaveLength(3);
    });

    it("should return only the most recently added with limit=1", () => {
      const sourceId = insertSource("movies");
      db.prepare(
        "INSERT INTO media_files (path, filename, source_id, status, tier, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).run("/media/old.mkv", "old.mkv", sourceId, "ready", 1, "2022-01-01T00:00:00");
      const oldId = (db.prepare("SELECT last_insert_rowid() AS id").get() as { id: number }).id;

      db.prepare(
        "INSERT INTO media_files (path, filename, source_id, status, tier, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).run("/media/new.mkv", "new.mkv", sourceId, "ready", 1, "2024-01-01T00:00:00");
      const newId = (db.prepare("SELECT last_insert_rowid() AS id").get() as { id: number }).id;

      insertMetadata(oldId, 2000, "movie", "Old Movie");
      insertMetadata(newId, 2001, "movie", "New Movie");

      const results = service.getRecent(1);
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("New Movie");
    });
  });

  // ── search() ─────────────────────────────────────────────────────────────

  describe("search()", () => {
    let searchMovieSourceId: number;
    let searchTvSourceId: number;

    beforeEach(() => {
      insertTmdbConfig("https://image.tmdb.org/t/p/");
      searchMovieSourceId = insertSource("movies");
      searchTvSourceId = insertSource("tv");

      const f1 = insertMediaFile(searchMovieSourceId, "taskmaster.mkv", "ready", 1);
      insertMetadata(f1, 3000, "movie", "Taskmaster");

      const f2 = insertMediaFile(searchMovieSourceId, "other.mkv", "ready", 1);
      insertMetadata(f2, 3001, "movie", "Other Movie");

      const f3 = insertMediaFile(searchTvSourceId, "show.s01e01.mkv", "ready", 1);
      const m3 = insertMetadata(f3, 3002, "tv", "Taskmaster TV");
      insertTvEpisode(m3, 1, 1);
    });

    it("should match title substring case-insensitively (q=Task)", () => {
      const results = service.search("Task");
      expect(results.map((r) => r.title)).toContain("Taskmaster");
      expect(results.map((r) => r.title)).toContain("Taskmaster TV");
    });

    it("should match case-insensitively (q=task)", () => {
      const results = service.search("task");
      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results.map((r) => r.title)).toContain("Taskmaster");
    });

    it("should return all ready titles when q=''", () => {
      const results = service.search("");
      expect(results.length).toBeGreaterThanOrEqual(3);
    });

    it("should return [] for nonexistent title", () => {
      const results = service.search("nonexistent_xyz_abc");
      expect(results).toEqual([]);
    });

    it("should collapse TV show episodes to one entry", () => {
      const f4 = insertMediaFile(searchTvSourceId, "show.s01e02.mkv", "ready", 1);
      const m4 = insertMetadata(f4, 3002, "tv", "Taskmaster TV");
      insertTvEpisode(m4, 1, 2);

      const results = service.search("Taskmaster TV");
      const tvResults = results.filter((r) => r.title === "Taskmaster TV");
      expect(tvResults).toHaveLength(1);
    });
  });
});
