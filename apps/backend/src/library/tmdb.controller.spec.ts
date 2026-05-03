import { Test, TestingModule } from "@nestjs/testing";
import { TmdbController } from "./tmdb.controller";
import {
  TmdbService,
  TmdbUnavailableError,
  TmdbClientError,
} from "./tmdb.service";
import {
  BadRequestException,
  ServiceUnavailableException,
  BadGatewayException,
} from "@nestjs/common";

describe("TmdbController", () => {
  let controller: TmdbController;
  let tmdbService: any;

  beforeEach(async () => {
    tmdbService = {
      searchMovie: jest.fn(),
      searchTv: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TmdbController],
      providers: [{ provide: TmdbService, useValue: tmdbService }],
    }).compile();

    controller = module.get<TmdbController>(TmdbController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  describe("GET /tmdb/search", () => {
    it("should return movie search results", async () => {
      const mockResults = [
        {
          id: 123,
          title: "Test Movie",
          overview: "A movie",
          poster_path: "/poster.jpg",
          release_date: "2025-01-01",
          vote_average: 7.5,
          popularity: 100,
        },
      ];
      tmdbService.searchMovie.mockResolvedValue(mockResults);

      const result = await controller.search("Test Movie", "movie");

      expect(result).toEqual(mockResults);
      expect(tmdbService.searchMovie).toHaveBeenCalledWith("Test Movie");
    });

    it("should return tv search results", async () => {
      const mockResults = [
        {
          id: 456,
          name: "Test Show",
          overview: "A show",
          poster_path: "/poster.jpg",
          first_air_date: "2025-01-01",
          vote_average: 8.0,
          popularity: 200,
        },
      ];
      tmdbService.searchTv.mockResolvedValue(mockResults);

      const result = await controller.search("Test Show", "tv");

      expect(result).toEqual(mockResults);
      expect(tmdbService.searchTv).toHaveBeenCalledWith("Test Show");
    });

    it("should throw BadRequestException when query is empty", async () => {
      await expect(controller.search("", "movie")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should throw BadRequestException when query is missing", async () => {
      await expect(
        controller.search(undefined as any, "movie"),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw BadRequestException when type is invalid", async () => {
      await expect(controller.search("test", "invalid")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should throw BadRequestException when type is missing", async () => {
      await expect(controller.search("test", undefined as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should throw ServiceUnavailableException on TmdbUnavailableError", async () => {
      tmdbService.searchMovie.mockRejectedValue(
        new TmdbUnavailableError("rate limited"),
      );

      await expect(controller.search("test", "movie")).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it("should throw BadGatewayException on TmdbClientError", async () => {
      tmdbService.searchTv.mockRejectedValue(
        new TmdbClientError("bad api key"),
      );

      await expect(controller.search("test", "tv")).rejects.toThrow(
        BadGatewayException,
      );
    });
  });
});
