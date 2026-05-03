import { ConfigService } from "@nestjs/config";
import { DatabaseService } from "../database/database.service";
import {
  TmdbService,
  TmdbUnavailableError,
  TmdbClientError,
} from "./tmdb.service";

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("TmdbService", () => {
  let service: TmdbService;
  let configService: Partial<ConfigService>;
  let databaseService: Partial<DatabaseService>;
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ advanceTimers: true });

    configService = {
      get: jest.fn().mockReturnValue("test-api-key"),
    };

    mockDb = {
      prepare: jest.fn().mockReturnValue({
        get: jest.fn().mockReturnValue(undefined),
        run: jest.fn(),
      }),
    };

    databaseService = {
      getDatabase: jest.fn().mockReturnValue(mockDb),
    };

    service = new TmdbService(
      configService as ConfigService,
      databaseService as unknown as DatabaseService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("searchMovie", () => {
    it("should search movies with title and year", async () => {
      const mockResults = [
        {
          id: 123,
          title: "Dust Bunny",
          overview: "A horror movie",
          poster_path: "/abc.jpg",
          release_date: "2025-03-15",
          vote_average: 7.2,
          popularity: 45.6,
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ results: mockResults }),
      });

      const results = await service.searchMovie("Dust Bunny", 2025);

      expect(results).toEqual(mockResults);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/3/search/movie?"),
        expect.objectContaining({
          headers: {
            Authorization: "Bearer test-api-key",
            Accept: "application/json",
          },
        }),
      );
      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain("query=Dust+Bunny");
      expect(calledUrl).toContain("year=2025");
      expect(calledUrl).toContain("language=en-US");
    });
  });

  describe("searchTv", () => {
    it("should search TV shows with title and year", async () => {
      const mockResults = [
        {
          id: 456,
          name: "Doctor Who",
          overview: "A sci-fi show",
          poster_path: "/def.jpg",
          first_air_date: "2005-03-26",
          vote_average: 8.1,
          popularity: 78.3,
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ results: mockResults }),
      });

      const results = await service.searchTv("Doctor Who", 2005);

      expect(results).toEqual(mockResults);
      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain("/3/search/tv?");
      expect(calledUrl).toContain("query=Doctor+Who");
      expect(calledUrl).toContain("first_air_date_year=2005");
    });
  });

  describe("getMovieDetails", () => {
    it("should fetch movie details by TMDB ID", async () => {
      const mockDetails = {
        id: 123,
        title: "Dust Bunny",
        overview: "A horror movie",
        poster_path: "/abc.jpg",
        backdrop_path: "/back.jpg",
        vote_average: 7.2,
        runtime: 95,
        release_date: "2025-03-15",
        genres: [{ id: 27, name: "Horror" }],
        production_countries: [{ iso_3166_1: "US", name: "United States" }],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockDetails,
      });

      const result = await service.getMovieDetails(123);

      expect(result).toEqual(mockDetails);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/3/movie/123?language=en-US"),
        expect.any(Object),
      );
    });
  });

  describe("getTvSeasonDetails", () => {
    it("should fetch season details with episodes", async () => {
      const mockSeason = {
        season_number: 1,
        episodes: [
          {
            episode_number: 1,
            name: "Rose",
            overview: "First episode",
            air_date: "2005-03-26",
            still_path: "/still.jpg",
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockSeason,
      });

      const result = await service.getTvSeasonDetails(456, 1);

      expect(result).toEqual(mockSeason);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/3/tv/456/season/1?language=en-US"),
        expect.any(Object),
      );
    });
  });

  describe("rate limiting", () => {
    it("should retry on 429 with Retry-After header", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Map([["Retry-After", "2"]]),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ results: [] }),
        });

      // Use a mock headers object with get method
      mockFetch.mockReset();
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: { get: () => "2" },
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ results: [] }),
        });

      const promise = service.searchMovie("Test");
      await jest.advanceTimersByTimeAsync(3000);
      const results = await promise;

      expect(results).toEqual([]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("error handling", () => {
    it("should throw TmdbUnavailableError on network error", async () => {
      jest.useRealTimers();
      // Override delay to be instant for this test
      (service as any).delay = () => Promise.resolve();
      mockFetch.mockRejectedValue(new TypeError("fetch failed"));

      await expect(service.searchMovie("Test")).rejects.toThrow(
        TmdbUnavailableError,
      );
      expect(mockFetch).toHaveBeenCalledTimes(3);
      jest.useFakeTimers({ advanceTimers: true });
    });

    it("should throw TmdbUnavailableError on 5xx response", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        headers: { get: () => null },
      });

      await expect(service.searchMovie("Test")).rejects.toThrow(
        TmdbUnavailableError,
      );
      await expect(service.searchMovie("Test")).rejects.toThrow(
        "TMDB returned 503",
      );
    });

    it("should throw TmdbClientError when API key is missing", async () => {
      (configService.get as jest.Mock).mockReturnValue(undefined);

      await expect(service.searchMovie("Test")).rejects.toThrow(
        TmdbClientError,
      );
      await expect(service.searchMovie("Test")).rejects.toThrow(
        "TMDB_API_KEY not configured",
      );
    });
  });

  describe("image base URL caching", () => {
    it("should fetch from API on first call and cache", async () => {
      mockDb.prepare.mockReturnValue({
        get: jest.fn().mockReturnValue(undefined),
        run: jest.fn(),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          images: { secure_base_url: "https://image.tmdb.org/t/p/" },
        }),
      });

      const url = await service.getImageBaseUrl();

      expect(url).toBe("https://image.tmdb.org/t/p/");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/3/configuration"),
        expect.any(Object),
      );
    });

    it("should return cached URL when fresh", async () => {
      const now = new Date().toISOString().replace("T", " ").replace("Z", "");
      mockDb.prepare.mockReturnValue({
        get: jest.fn().mockReturnValue({
          image_base_url: "https://image.tmdb.org/t/p/",
          last_fetched: now,
        }),
        run: jest.fn(),
      });

      const url = await service.getImageBaseUrl();

      expect(url).toBe("https://image.tmdb.org/t/p/");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should refetch when cache is older than 24 hours", async () => {
      const staleDate = new Date(Date.now() - 25 * 60 * 60 * 1000)
        .toISOString()
        .replace("T", " ")
        .replace("Z", "");
      const mockRun = jest.fn();
      mockDb.prepare.mockReturnValue({
        get: jest.fn().mockReturnValue({
          id: 1,
          image_base_url: "https://old.url/",
          last_fetched: staleDate,
        }),
        run: mockRun,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          images: { secure_base_url: "https://image.tmdb.org/t/p/" },
        }),
      });

      const url = await service.getImageBaseUrl();

      expect(url).toBe("https://image.tmdb.org/t/p/");
      expect(mockFetch).toHaveBeenCalled();
    });
  });
});
