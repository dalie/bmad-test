import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import Database from "better-sqlite3";
import { MatchingService } from "./matching.service";
import { DatabaseService } from "../database/database.service";
import { FilenameParserService } from "./filename-parser.service";
import {
  TmdbService,
  TmdbUnavailableError,
  TmdbClientError,
} from "./tmdb.service";

describe("MatchingService", () => {
  let service: MatchingService;
  let dbService: DatabaseService;
  let filenameParser: FilenameParserService;
  let tmdbService: TmdbService;
  let db: Database.Database;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchingService,
        DatabaseService,
        FilenameParserService,
        TmdbService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === "CACHE_PATH") return ":memory:";
              if (key === "TMDB_API_KEY") return "test-key";
              return undefined;
            },
          },
        },
      ],
    }).compile();

    dbService = module.get<DatabaseService>(DatabaseService);
    dbService.onModuleInit();
    db = dbService.getDatabase();

    service = module.get<MatchingService>(MatchingService);
    filenameParser = module.get<FilenameParserService>(FilenameParserService);
    tmdbService = module.get<TmdbService>(TmdbService);
  });

  afterEach(() => {
    dbService.onModuleDestroy();
  });

  function insertSource(type: "movies" | "tv"): number {
    return db
      .prepare("INSERT INTO media_sources (path, type) VALUES (?, ?)")
      .run(`/media/${type}`, type).lastInsertRowid as number;
  }

  function insertFile(
    sourceId: number,
    filename: string,
    filePath?: string,
  ): number {
    const p = filePath || `/media/movies/${filename}`;
    return db
      .prepare(
        "INSERT INTO media_files (path, filename, source_id, status) VALUES (?, ?, ?, 'probed')",
      )
      .run(p, filename, sourceId).lastInsertRowid as number;
  }

  describe("Movie matching happy path", () => {
    it("should match a movie file and store metadata", async () => {
      const sourceId = insertSource("movies");
      const fileId = insertFile(
        sourceId,
        "Dust.Bunny.2025.REPACK.720p.WEB.H264-SLOT.mkv",
      );

      jest.spyOn(tmdbService, "searchMovie").mockResolvedValue([
        {
          id: 12345,
          title: "Dust Bunny",
          overview: "A great movie",
          poster_path: "/poster.jpg",
          release_date: "2025-03-15",
          vote_average: 7.5,
          popularity: 100,
        },
      ]);

      jest.spyOn(tmdbService, "getMovieDetails").mockResolvedValue({
        id: 12345,
        title: "Dust Bunny",
        overview: "A great movie about dust bunnies",
        poster_path: "/poster.jpg",
        backdrop_path: "/backdrop.jpg",
        vote_average: 7.5,
        runtime: 120,
        release_date: "2025-03-15",
        genres: [
          { id: 1, name: "Comedy" },
          { id: 2, name: "Family" },
        ],
        production_countries: [{ iso_3166_1: "US", name: "United States" }],
      });

      const result = await service.matchFile({
        id: fileId,
        filename: "Dust.Bunny.2025.REPACK.720p.WEB.H264-SLOT.mkv",
        source_id: sourceId,
        path: `/media/movies/Dust.Bunny.2025.REPACK.720p.WEB.H264-SLOT.mkv`,
      });

      expect(result).toBe("matched");

      // Verify status updated
      const file = db
        .prepare("SELECT status FROM media_files WHERE id = ?")
        .get(fileId) as any;
      expect(file.status).toBe("matched");

      // Verify metadata stored
      const metadata = db
        .prepare("SELECT * FROM metadata WHERE media_file_id = ?")
        .get(fileId) as any;
      expect(metadata).toBeDefined();
      expect(metadata.tmdb_id).toBe(12345);
      expect(metadata.media_type).toBe("movie");
      expect(metadata.title).toBe("Dust Bunny");
      expect(metadata.overview).toBe("A great movie about dust bunnies");
      expect(metadata.poster_path).toBe("/poster.jpg");
      expect(metadata.backdrop_path).toBe("/backdrop.jpg");
      expect(metadata.vote_average).toBe(7.5);
      expect(metadata.runtime).toBe(120);
      expect(metadata.release_date).toBe("2025-03-15");
      expect(JSON.parse(metadata.genres)).toEqual(["Comedy", "Family"]);

      // Verify searchMovie was called with parsed title and year
      expect(tmdbService.searchMovie).toHaveBeenCalledWith("Dust Bunny", 2025);
    });

    it("should persist movie metadata inside a transaction", async () => {
      const sourceId = insertSource("movies");
      const fileId = insertFile(sourceId, "Movie.2024.1080p.mkv");
      const transactionSpy = jest.spyOn(db, "transaction");

      jest.spyOn(tmdbService, "searchMovie").mockResolvedValue([
        {
          id: 100,
          title: "Movie",
          overview: "A movie",
          poster_path: null,
          release_date: "2024-01-01",
          vote_average: 7,
          popularity: 10,
        },
      ]);
      jest.spyOn(tmdbService, "getMovieDetails").mockResolvedValue({
        id: 100,
        title: "Movie",
        overview: "A movie",
        poster_path: null,
        backdrop_path: null,
        vote_average: 7,
        runtime: 100,
        release_date: "2024-01-01",
        genres: [],
        production_countries: [],
      });

      await service.matchFile({
        id: fileId,
        filename: "Movie.2024.1080p.mkv",
        source_id: sourceId,
        path: "/media/movies/Movie.2024.1080p.mkv",
      });

      expect(transactionSpy).toHaveBeenCalled();
    });

    it("should prefer year-matching results with highest popularity", async () => {
      const sourceId = insertSource("movies");
      const fileId = insertFile(sourceId, "Avatar.2009.1080p.BluRay.mkv");

      jest.spyOn(tmdbService, "searchMovie").mockResolvedValue([
        {
          id: 111,
          title: "Avatar",
          overview: "Wrong year",
          poster_path: null,
          release_date: "2022-12-16",
          vote_average: 7.0,
          popularity: 200,
        },
        {
          id: 222,
          title: "Avatar",
          overview: "Correct year",
          poster_path: null,
          release_date: "2009-12-18",
          vote_average: 7.9,
          popularity: 150,
        },
      ]);

      jest.spyOn(tmdbService, "getMovieDetails").mockResolvedValue({
        id: 222,
        title: "Avatar",
        overview: "Correct year",
        poster_path: null,
        backdrop_path: null,
        vote_average: 7.9,
        runtime: 162,
        release_date: "2009-12-18",
        genres: [{ id: 1, name: "Sci-Fi" }],
        production_countries: [],
      });

      await service.matchFile({
        id: fileId,
        filename: "Avatar.2009.1080p.BluRay.mkv",
        source_id: sourceId,
        path: "/media/movies/Avatar.2009.1080p.BluRay.mkv",
      });

      // Should have called getMovieDetails with the 2009 version (id: 222)
      expect(tmdbService.getMovieDetails).toHaveBeenCalledWith(222);
    });
  });

  describe("TV matching happy path", () => {
    it("should match a TV file and store metadata with episode", async () => {
      const sourceId = insertSource("tv");
      const fileId = insertFile(
        sourceId,
        "Breaking.Bad.S01E01.720p.BluRay.mkv",
        "/media/tv/Breaking.Bad.S01E01.720p.BluRay.mkv",
      );

      jest.spyOn(tmdbService, "searchTv").mockResolvedValue([
        {
          id: 1396,
          name: "Breaking Bad",
          overview: "A chemistry teacher turns to crime",
          poster_path: "/bb-poster.jpg",
          first_air_date: "2008-01-20",
          vote_average: 8.9,
          popularity: 300,
        },
      ]);

      jest.spyOn(tmdbService, "getTvDetails").mockResolvedValue({
        id: 1396,
        name: "Breaking Bad",
        overview: "A chemistry teacher turns to crime",
        poster_path: "/bb-poster.jpg",
        backdrop_path: "/bb-backdrop.jpg",
        vote_average: 8.9,
        first_air_date: "2008-01-20",
        genres: [
          { id: 1, name: "Drama" },
          { id: 2, name: "Crime" },
        ],
        number_of_seasons: 5,
      });

      jest.spyOn(tmdbService, "getTvSeasonDetails").mockResolvedValue({
        season_number: 1,
        episodes: [
          {
            episode_number: 1,
            name: "Pilot",
            overview: "Walter White begins his journey",
            air_date: "2008-01-20",
            still_path: "/ep1-still.jpg",
          },
          {
            episode_number: 2,
            name: "Cat's in the Bag...",
            overview: "Walt and Jesse deal with the aftermath",
            air_date: "2008-01-27",
            still_path: "/ep2-still.jpg",
          },
        ],
      });

      const result = await service.matchFile({
        id: fileId,
        filename: "Breaking.Bad.S01E01.720p.BluRay.mkv",
        source_id: sourceId,
        path: "/media/tv/Breaking.Bad.S01E01.720p.BluRay.mkv",
      });

      expect(result).toBe("matched");

      // Verify status updated
      const file = db
        .prepare("SELECT status FROM media_files WHERE id = ?")
        .get(fileId) as any;
      expect(file.status).toBe("matched");

      // Verify metadata stored
      const metadata = db
        .prepare("SELECT * FROM metadata WHERE media_file_id = ?")
        .get(fileId) as any;
      expect(metadata).toBeDefined();
      expect(metadata.tmdb_id).toBe(1396);
      expect(metadata.media_type).toBe("tv");
      expect(metadata.title).toBe("Breaking Bad");
      expect(JSON.parse(metadata.genres)).toEqual(["Drama", "Crime"]);

      // Verify only the specific episode was stored (episode 1)
      const episodes = db
        .prepare("SELECT * FROM tv_episodes WHERE metadata_id = ?")
        .all(metadata.id) as any[];
      expect(episodes).toHaveLength(1);
      expect(episodes[0].season_number).toBe(1);
      expect(episodes[0].episode_number).toBe(1);
      expect(episodes[0].name).toBe("Pilot");
      expect(episodes[0].still_path).toBe("/ep1-still.jpg");

      // Verify searchTv was called
      expect(tmdbService.searchTv).toHaveBeenCalledWith("Breaking Bad");
      expect(tmdbService.getTvSeasonDetails).toHaveBeenCalledWith(1396, 1);
    });

    it("should fail when season or episode cannot be parsed", async () => {
      const sourceId = insertSource("tv");
      const fileId = insertFile(
        sourceId,
        "Breaking.Bad.720p.BluRay.mkv",
        "/media/tv/Breaking.Bad.720p.BluRay.mkv",
      );
      const searchTvSpy = jest.spyOn(tmdbService, "searchTv");

      const result = await service.matchFile({
        id: fileId,
        filename: "Breaking.Bad.720p.BluRay.mkv",
        source_id: sourceId,
        path: "/media/tv/Breaking.Bad.720p.BluRay.mkv",
      });

      expect(result).toBe("match_failed");
      expect(searchTvSpy).not.toHaveBeenCalled();

      const file = db
        .prepare("SELECT status FROM media_files WHERE id = ?")
        .get(fileId) as any;
      expect(file.status).toBe("match_failed");
    });

    it("should fail when the requested episode is missing from season data", async () => {
      const sourceId = insertSource("tv");
      const fileId = insertFile(
        sourceId,
        "Breaking.Bad.S01E03.720p.BluRay.mkv",
        "/media/tv/Breaking.Bad.S01E03.720p.BluRay.mkv",
      );

      jest.spyOn(tmdbService, "searchTv").mockResolvedValue([
        {
          id: 1396,
          name: "Breaking Bad",
          overview: "A chemistry teacher turns to crime",
          poster_path: "/bb-poster.jpg",
          first_air_date: "2008-01-20",
          vote_average: 8.9,
          popularity: 300,
        },
      ]);
      jest.spyOn(tmdbService, "getTvDetails").mockResolvedValue({
        id: 1396,
        name: "Breaking Bad",
        overview: "A chemistry teacher turns to crime",
        poster_path: "/bb-poster.jpg",
        backdrop_path: "/bb-backdrop.jpg",
        vote_average: 8.9,
        first_air_date: "2008-01-20",
        genres: [{ id: 1, name: "Drama" }],
        number_of_seasons: 5,
      });
      jest.spyOn(tmdbService, "getTvSeasonDetails").mockResolvedValue({
        season_number: 1,
        episodes: [
          {
            episode_number: 1,
            name: "Pilot",
            overview: "Walter White begins his journey",
            air_date: "2008-01-20",
            still_path: "/ep1-still.jpg",
          },
        ],
      });

      const result = await service.matchFile({
        id: fileId,
        filename: "Breaking.Bad.S01E03.720p.BluRay.mkv",
        source_id: sourceId,
        path: "/media/tv/Breaking.Bad.S01E03.720p.BluRay.mkv",
      });

      expect(result).toBe("match_failed");

      const file = db
        .prepare("SELECT status FROM media_files WHERE id = ?")
        .get(fileId) as any;
      expect(file.status).toBe("match_failed");

      const episodes = db
        .prepare(
          "SELECT * FROM tv_episodes WHERE metadata_id IN (SELECT id FROM metadata WHERE media_file_id = ?)",
        )
        .all(fileId) as any[];
      expect(episodes).toHaveLength(0);
    });
  });

  describe("Match failure", () => {
    it("should set status to match_failed when TMDB returns no results", async () => {
      const sourceId = insertSource("movies");
      const fileId = insertFile(
        sourceId,
        "Unknown.Movie.2024.mkv",
        "/media/movies/Unknown.Movie.2024.mkv",
      );

      jest.spyOn(tmdbService, "searchMovie").mockResolvedValue([]);

      const result = await service.matchFile({
        id: fileId,
        filename: "Unknown.Movie.2024.mkv",
        source_id: sourceId,
        path: "/media/movies/Unknown.Movie.2024.mkv",
      });

      expect(result).toBe("match_failed");

      // Verify status
      const file = db
        .prepare("SELECT status FROM media_files WHERE id = ?")
        .get(fileId) as any;
      expect(file.status).toBe("match_failed");

      // Verify error logged
      const errors = db
        .prepare(
          "SELECT * FROM scan_errors WHERE file_path = ? AND error_type = 'MATCH_FAILED'",
        )
        .all("/media/movies/Unknown.Movie.2024.mkv") as any[];
      expect(errors).toHaveLength(1);
      expect(errors[0].error_message).toBe("No TMDB match found");
    });
  });

  describe("TMDB unavailable", () => {
    it("should return retry and keep status probed when TMDB is unavailable", async () => {
      const sourceId = insertSource("movies");
      const fileId = insertFile(
        sourceId,
        "Some.Movie.2024.mkv",
        "/media/movies/Some.Movie.2024.mkv",
      );

      jest
        .spyOn(tmdbService, "searchMovie")
        .mockRejectedValue(
          new TmdbUnavailableError("TMDB rate limited after 3 attempts"),
        );

      const result = await service.matchFile({
        id: fileId,
        filename: "Some.Movie.2024.mkv",
        source_id: sourceId,
        path: "/media/movies/Some.Movie.2024.mkv",
      });

      expect(result).toBe("retry");

      // Status should remain probed
      const file = db
        .prepare("SELECT status FROM media_files WHERE id = ?")
        .get(fileId) as any;
      expect(file.status).toBe("probed");

      // No scan_errors entry
      const errors = db
        .prepare("SELECT * FROM scan_errors WHERE file_path = ?")
        .all("/media/movies/Some.Movie.2024.mkv") as any[];
      expect(errors).toHaveLength(0);
    });
  });

  describe("TMDB client error", () => {
    it("should set match_failed on TmdbClientError", async () => {
      const sourceId = insertSource("movies");
      const fileId = insertFile(
        sourceId,
        "Another.Movie.2024.mkv",
        "/media/movies/Another.Movie.2024.mkv",
      );

      jest
        .spyOn(tmdbService, "searchMovie")
        .mockRejectedValue(new TmdbClientError("TMDB_API_KEY not configured"));

      const result = await service.matchFile({
        id: fileId,
        filename: "Another.Movie.2024.mkv",
        source_id: sourceId,
        path: "/media/movies/Another.Movie.2024.mkv",
      });

      expect(result).toBe("match_failed");

      const file = db
        .prepare("SELECT status FROM media_files WHERE id = ?")
        .get(fileId) as any;
      expect(file.status).toBe("match_failed");

      const errors = db
        .prepare("SELECT * FROM scan_errors WHERE file_path = ?")
        .all("/media/movies/Another.Movie.2024.mkv") as any[];
      expect(errors).toHaveLength(1);
      expect(errors[0].error_message).toBe("TMDB_API_KEY not configured");
    });
  });

  describe("applyManualMatch", () => {
    function insertMatchFailedFile(
      sourceId: number,
      filename: string,
      filePath?: string,
    ): number {
      const p = filePath || `/media/movies/${filename}`;
      return db
        .prepare(
          "INSERT INTO media_files (path, filename, source_id, status) VALUES (?, ?, ?, 'match_failed')",
        )
        .run(p, filename, sourceId).lastInsertRowid as number;
    }

    it("should manually match a movie file and store metadata", async () => {
      const sourceId = insertSource("movies");
      const fileId = insertMatchFailedFile(
        sourceId,
        "Some.Movie.2024.1080p.mkv",
      );

      jest.spyOn(tmdbService, "getMovieDetails").mockResolvedValue({
        id: 999,
        title: "Some Movie",
        overview: "A great film",
        poster_path: "/poster.jpg",
        backdrop_path: "/backdrop.jpg",
        vote_average: 8.0,
        runtime: 110,
        release_date: "2024-06-01",
        genres: [{ id: 1, name: "Action" }],
        production_countries: [],
      });

      const result = await service.applyManualMatch(
        {
          id: fileId,
          filename: "Some.Movie.2024.1080p.mkv",
          path: `/media/movies/Some.Movie.2024.1080p.mkv`,
          source_id: sourceId,
        },
        999,
        "movie",
      );

      expect(result.status).toBe("matched");
      expect(result.metadata.title).toBe("Some Movie");
      expect(result.metadata.tmdb_id).toBe(999);
      expect(result.metadata.poster_path).toBe("/poster.jpg");

      // Verify status updated
      const file = db
        .prepare("SELECT status FROM media_files WHERE id = ?")
        .get(fileId) as any;
      expect(file.status).toBe("matched");

      // Verify metadata stored
      const metadata = db
        .prepare("SELECT * FROM metadata WHERE media_file_id = ?")
        .get(fileId) as any;
      expect(metadata).toBeDefined();
      expect(metadata.tmdb_id).toBe(999);
      expect(metadata.media_type).toBe("movie");
      expect(metadata.title).toBe("Some Movie");
    });

    it("should manually match a TV file and store show metadata + episode", async () => {
      const sourceId = insertSource("tv");
      const fileId = insertMatchFailedFile(
        sourceId,
        "Taskmaster.S21E03.1080p.mkv",
        "/media/tv/Taskmaster.S21E03.1080p.mkv",
      );

      jest.spyOn(tmdbService, "getTvDetails").mockResolvedValue({
        id: 555,
        name: "Taskmaster",
        overview: "Comedy panel show",
        poster_path: "/tv-poster.jpg",
        backdrop_path: "/tv-backdrop.jpg",
        vote_average: 8.5,
        first_air_date: "2015-07-28",
        genres: [{ id: 35, name: "Comedy" }],
        number_of_seasons: 21,
      });

      jest.spyOn(tmdbService, "getTvSeasonDetails").mockResolvedValue({
        season_number: 21,
        episodes: [
          {
            episode_number: 1,
            name: "Ep 1",
            overview: "First",
            air_date: "2025-01-01",
            still_path: null,
          },
          {
            episode_number: 2,
            name: "Ep 2",
            overview: "Second",
            air_date: "2025-01-08",
            still_path: null,
          },
          {
            episode_number: 3,
            name: "Ep 3",
            overview: "Third",
            air_date: "2025-01-15",
            still_path: "/still3.jpg",
          },
        ],
      });

      const result = await service.applyManualMatch(
        {
          id: fileId,
          filename: "Taskmaster.S21E03.1080p.mkv",
          path: "/media/tv/Taskmaster.S21E03.1080p.mkv",
          source_id: sourceId,
        },
        555,
        "tv",
      );

      expect(result.status).toBe("matched");
      expect(result.metadata.title).toBe("Taskmaster");
      expect(result.metadata.tmdb_id).toBe(555);

      // Verify metadata stored
      const metadata = db
        .prepare("SELECT * FROM metadata WHERE media_file_id = ?")
        .get(fileId) as any;
      expect(metadata).toBeDefined();
      expect(metadata.tmdb_id).toBe(555);
      expect(metadata.media_type).toBe("tv");
      expect(metadata.title).toBe("Taskmaster");

      // Verify episode stored
      const episode = db
        .prepare("SELECT * FROM tv_episodes WHERE metadata_id = ?")
        .get(metadata.id) as any;
      expect(episode).toBeDefined();
      expect(episode.season_number).toBe(21);
      expect(episode.episode_number).toBe(3);
      expect(episode.name).toBe("Ep 3");
      expect(episode.still_path).toBe("/still3.jpg");
    });

    it("should still succeed for TV when season/episode cannot be parsed from filename", async () => {
      const sourceId = insertSource("tv");
      const fileId = insertMatchFailedFile(
        sourceId,
        "some-weird-filename.mkv",
        "/media/tv/some-weird-filename.mkv",
      );

      jest.spyOn(tmdbService, "getTvDetails").mockResolvedValue({
        id: 777,
        name: "Some Show",
        overview: "A show",
        poster_path: "/show.jpg",
        backdrop_path: null,
        vote_average: 7.0,
        first_air_date: "2020-01-01",
        genres: [],
        number_of_seasons: 5,
      });

      const result = await service.applyManualMatch(
        {
          id: fileId,
          filename: "some-weird-filename.mkv",
          path: "/media/tv/some-weird-filename.mkv",
          source_id: sourceId,
        },
        777,
        "tv",
      );

      expect(result.status).toBe("matched");
      expect(result.metadata.title).toBe("Some Show");

      // Verify file is matched even without episode data
      const file = db
        .prepare("SELECT status FROM media_files WHERE id = ?")
        .get(fileId) as any;
      expect(file.status).toBe("matched");

      // Verify no episode row created
      const metadata = db
        .prepare("SELECT * FROM metadata WHERE media_file_id = ?")
        .get(fileId) as any;
      const episodes = db
        .prepare("SELECT * FROM tv_episodes WHERE metadata_id = ?")
        .all(metadata.id) as any[];
      expect(episodes).toHaveLength(0);
    });

    it("should propagate TmdbUnavailableError for manual match", async () => {
      const sourceId = insertSource("movies");
      const fileId = insertMatchFailedFile(sourceId, "Test.Movie.mkv");

      jest
        .spyOn(tmdbService, "getMovieDetails")
        .mockRejectedValue(new TmdbUnavailableError("rate limited"));

      await expect(
        service.applyManualMatch(
          {
            id: fileId,
            filename: "Test.Movie.mkv",
            path: "/media/movies/Test.Movie.mkv",
            source_id: sourceId,
          },
          123,
          "movie",
        ),
      ).rejects.toThrow(TmdbUnavailableError);
    });

    it("should propagate TmdbClientError for manual match", async () => {
      const sourceId = insertSource("movies");
      const fileId = insertMatchFailedFile(sourceId, "Test.Movie.mkv");

      jest
        .spyOn(tmdbService, "getMovieDetails")
        .mockRejectedValue(new TmdbClientError("invalid key"));

      await expect(
        service.applyManualMatch(
          {
            id: fileId,
            filename: "Test.Movie.mkv",
            path: "/media/movies/Test.Movie.mkv",
            source_id: sourceId,
          },
          123,
          "movie",
        ),
      ).rejects.toThrow(TmdbClientError);
    });

    it("should throw when episode is parseable but not found in TMDB season data", async () => {
      const sourceId = insertSource("tv");
      const fileId = insertMatchFailedFile(
        sourceId,
        "Show.S01E99.1080p.mkv",
        "/media/tv/Show.S01E99.1080p.mkv",
      );

      jest.spyOn(tmdbService, "getTvDetails").mockResolvedValue({
        id: 888,
        name: "Show",
        overview: "A show",
        poster_path: "/show.jpg",
        backdrop_path: null,
        vote_average: 7.0,
        first_air_date: "2020-01-01",
        genres: [],
        number_of_seasons: 1,
      });

      jest.spyOn(tmdbService, "getTvSeasonDetails").mockResolvedValue({
        season_number: 1,
        episodes: [
          {
            episode_number: 1,
            name: "Pilot",
            overview: "First",
            air_date: "2020-01-01",
            still_path: null,
          },
        ],
      });

      await expect(
        service.applyManualMatch(
          {
            id: fileId,
            filename: "Show.S01E99.1080p.mkv",
            path: "/media/tv/Show.S01E99.1080p.mkv",
            source_id: sourceId,
          },
          888,
          "tv",
        ),
      ).rejects.toThrow("EPISODE_NOT_FOUND");

      // Verify file status was NOT changed (rolled back)
      const file = db
        .prepare("SELECT status FROM media_files WHERE id = ?")
        .get(fileId) as any;
      expect(file.status).toBe("match_failed");
    });
  });
});
