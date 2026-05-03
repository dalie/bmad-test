import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { BrowseController } from "./browse.controller";
import { BrowseService } from "./browse.service";
import type {
  MovieListItem,
  ShowListItem,
  MovieDetail,
  ShowDetail,
  RecentItem,
} from "./browse.service";

describe("BrowseController", () => {
  let controller: BrowseController;
  let browseService: any;

  beforeEach(async () => {
    browseService = {
      getMovies: jest.fn(),
      getShows: jest.fn(),
      getMovieById: jest.fn(),
      getShowById: jest.fn(),
      getRecent: jest.fn(),
      search: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BrowseController],
      providers: [{ provide: BrowseService, useValue: browseService }],
    }).compile();

    controller = module.get<BrowseController>(BrowseController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  // ── GET /library/movies ───────────────────────────────────────────────────

  describe("GET /library/movies", () => {
    it("should return array from browseService.getMovies()", () => {
      const mockMovies: MovieListItem[] = [
        {
          id: 1,
          title: "Test Movie",
          year: 2023,
          poster_url: null,
          runtime: 120,
          rating: 8.0,
          added_at: "2023-01-01",
          transcode_tier: 1,
          playback_ready: true,
        },
      ];
      browseService.getMovies.mockReturnValue(mockMovies);

      const result = controller.getMovies();

      expect(result).toEqual(mockMovies);
      expect(browseService.getMovies).toHaveBeenCalledTimes(1);
    });
  });

  // ── GET /library/shows ────────────────────────────────────────────────────

  describe("GET /library/shows", () => {
    it("should return array from browseService.getShows()", () => {
      const mockShows: ShowListItem[] = [
        {
          id: 500,
          title: "Great Show",
          year: 2021,
          poster_url: null,
          rating: 8.5,
          season_count: 3,
          added_at: "2021-01-01",
        },
      ];
      browseService.getShows.mockReturnValue(mockShows);

      const result = controller.getShows();

      expect(result).toEqual(mockShows);
      expect(browseService.getShows).toHaveBeenCalledTimes(1);
    });
  });

  // ── GET /library/movies/:id ───────────────────────────────────────────────

  describe("GET /library/movies/:id", () => {
    it("should return MovieDetail when found", () => {
      const mockDetail: MovieDetail = {
        id: 42,
        title: "Found Movie",
        description: "A film",
        year: 2020,
        poster_url: null,
        runtime: 100,
        rating: 7.0,
        content_rating: "PG",
        audio_tracks: [],
        subtitle_tracks: [],
        file_id: 42,
        tier: 1,
        transcode_output_path: null,
      };
      browseService.getMovieById.mockReturnValue(mockDetail);

      const result = controller.getMovie(42);

      expect(result).toEqual(mockDetail);
      expect(browseService.getMovieById).toHaveBeenCalledWith(42);
      expect(browseService.getMovieById).toHaveBeenCalledTimes(1);
    });

    it("should throw NotFoundException when movie not found", () => {
      browseService.getMovieById.mockReturnValue(null);

      expect(() => controller.getMovie(99)).toThrow(NotFoundException);
      expect(browseService.getMovieById).toHaveBeenCalledTimes(1);
    });
  });

  // ── GET /library/shows/:id ────────────────────────────────────────────────

  describe("GET /library/shows/:id", () => {
    it("should return ShowDetail when found", () => {
      const mockDetail: ShowDetail = {
        id: 500,
        title: "My Show",
        description: "A show",
        year: 2021,
        poster_url: null,
        rating: 8.0,
        seasons: [],
      };
      browseService.getShowById.mockReturnValue(mockDetail);

      const result = controller.getShow(500);

      expect(result).toEqual(mockDetail);
      expect(browseService.getShowById).toHaveBeenCalledWith(500);
      expect(browseService.getShowById).toHaveBeenCalledTimes(1);
    });

    it("should throw NotFoundException when show not found", () => {
      browseService.getShowById.mockReturnValue(null);

      expect(() => controller.getShow(9999)).toThrow(NotFoundException);
      expect(browseService.getShowById).toHaveBeenCalledTimes(1);
    });
  });

  // ── GET /library/recent ───────────────────────────────────────────────────

  describe("GET /library/recent", () => {
    it("should call getRecent(20) for default limit", () => {
      const mockRecent: RecentItem[] = [];
      browseService.getRecent.mockReturnValue(mockRecent);

      const result = controller.getRecent(20);

      expect(result).toEqual(mockRecent);
      expect(browseService.getRecent).toHaveBeenCalledWith(20);
      expect(browseService.getRecent).toHaveBeenCalledTimes(1);
    });

    it("should call getRecent(5) when limit=5 provided", () => {
      browseService.getRecent.mockReturnValue([]);

      controller.getRecent(5);

      expect(browseService.getRecent).toHaveBeenCalledWith(5);
      expect(browseService.getRecent).toHaveBeenCalledTimes(1);
    });
  });

  // ── GET /library/search ───────────────────────────────────────────────────

  describe("GET /library/search", () => {
    it("should call search('foo') when q=foo", () => {
      const mockResults: RecentItem[] = [
        {
          id: 1,
          title: "Foo Movie",
          year: 2022,
          poster_url: null,
          rating: 7.0,
          media_type: "movie",
          added_at: "2022-01-01",
        },
      ];
      browseService.search.mockReturnValue(mockResults);

      const result = controller.search("foo");

      expect(result).toEqual(mockResults);
      expect(browseService.search).toHaveBeenCalledWith("foo");
      expect(browseService.search).toHaveBeenCalledTimes(1);
    });

    it("should call search('') when no q param provided", () => {
      browseService.search.mockReturnValue([]);

      controller.search("");

      expect(browseService.search).toHaveBeenCalledWith("");
      expect(browseService.search).toHaveBeenCalledTimes(1);
    });
  });
});
