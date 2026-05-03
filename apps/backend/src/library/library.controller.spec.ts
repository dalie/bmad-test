import { Test, TestingModule } from "@nestjs/testing";
import { LibraryController } from "./library.controller";
import { LibraryService } from "./library.service";
import { WatcherService } from "./watcher.service";
import { TmdbUnavailableError, TmdbClientError } from "./tmdb.service";
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
  UnprocessableEntityException,
  ServiceUnavailableException,
  BadGatewayException,
} from "@nestjs/common";

describe("LibraryController", () => {
  let controller: LibraryController;
  let libraryService: any;
  let watcherService: any;

  beforeEach(async () => {
    libraryService = {
      startScan: jest.fn(),
      getScanStatus: jest.fn(),
      getFiles: jest.fn(),
      getFile: jest.fn(),
      getUnmatchedFiles: jest.fn(),
      manualMatch: jest.fn(),
    };

    watcherService = {
      getStatus: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LibraryController],
      providers: [
        { provide: LibraryService, useValue: libraryService },
        { provide: WatcherService, useValue: watcherService },
      ],
    }).compile();

    controller = module.get<LibraryController>(LibraryController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  describe("GET /library/unmatched", () => {
    it("should return unmatched files with pagination", () => {
      const mockResult = {
        items: [
          {
            id: 1,
            filename: "test.mkv",
            path: "/media/movies/test.mkv",
            source_type: "movies",
            error_message: "No TMDB match found",
            created_at: "2026-05-01",
          },
        ],
        total: 1,
        offset: 0,
        limit: 50,
      };
      libraryService.getUnmatchedFiles.mockReturnValue(mockResult);

      const result = controller.getUnmatchedFiles(0, 50);

      expect(result).toEqual(mockResult);
      expect(libraryService.getUnmatchedFiles).toHaveBeenCalledWith(0, 50);
    });

    it("should pass custom offset and limit", () => {
      libraryService.getUnmatchedFiles.mockReturnValue({
        items: [],
        total: 0,
        offset: 10,
        limit: 20,
      });

      controller.getUnmatchedFiles(10, 20);

      expect(libraryService.getUnmatchedFiles).toHaveBeenCalledWith(10, 20);
    });
  });

  describe("POST /library/files/:id/match", () => {
    it("should match a file successfully (movie)", async () => {
      const mockResult = {
        status: "matched",
        metadata: {
          title: "Test Movie",
          tmdb_id: 123,
          poster_path: "/poster.jpg",
        },
      };
      libraryService.manualMatch.mockResolvedValue(mockResult);

      const result = await controller.manualMatch(1, { tmdbId: 123 });

      expect(result).toEqual(mockResult);
      expect(libraryService.manualMatch).toHaveBeenCalledWith(1, 123);
    });

    it("should throw BadRequestException when tmdbId is missing", async () => {
      await expect(
        controller.manualMatch(1, { tmdbId: undefined as any }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw BadRequestException when tmdbId is not a positive integer", async () => {
      await expect(controller.manualMatch(1, { tmdbId: -5 })).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.manualMatch(1, { tmdbId: 0 })).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.manualMatch(1, { tmdbId: 1.5 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should throw NotFoundException when file not found", async () => {
      libraryService.manualMatch.mockRejectedValue(new Error("FILE_NOT_FOUND"));

      await expect(
        controller.manualMatch(999, { tmdbId: 123 }),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ConflictException when file already matched", async () => {
      libraryService.manualMatch.mockRejectedValue(
        new Error("FILE_ALREADY_MATCHED"),
      );

      await expect(controller.manualMatch(1, { tmdbId: 123 })).rejects.toThrow(
        ConflictException,
      );
    });

    it("should throw ServiceUnavailableException on TmdbUnavailableError", async () => {
      libraryService.manualMatch.mockRejectedValue(
        new TmdbUnavailableError("rate limited"),
      );

      await expect(controller.manualMatch(1, { tmdbId: 123 })).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it("should throw BadGatewayException on TmdbClientError", async () => {
      libraryService.manualMatch.mockRejectedValue(
        new TmdbClientError("bad key"),
      );

      await expect(controller.manualMatch(1, { tmdbId: 123 })).rejects.toThrow(
        BadGatewayException,
      );
    });

    it("should throw UnprocessableEntityException when file not eligible", async () => {
      libraryService.manualMatch.mockRejectedValue(
        new Error("FILE_NOT_ELIGIBLE"),
      );

      await expect(controller.manualMatch(1, { tmdbId: 123 })).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it("should throw NotFoundException when source not found", async () => {
      libraryService.manualMatch.mockRejectedValue(
        new Error("SOURCE_NOT_FOUND"),
      );

      await expect(controller.manualMatch(1, { tmdbId: 123 })).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should throw BadRequestException when TMDB returns 404", async () => {
      libraryService.manualMatch.mockRejectedValue(
        new TmdbClientError("TMDB returned 404: Not Found"),
      );

      await expect(
        controller.manualMatch(1, { tmdbId: 999999 }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw BadRequestException when body is null", async () => {
      await expect(controller.manualMatch(1, null as any)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe("GET /library/unmatched validation", () => {
    it("should throw BadRequestException for negative offset", () => {
      expect(() => controller.getUnmatchedFiles(-1, 50)).toThrow(
        BadRequestException,
      );
    });

    it("should throw BadRequestException for zero limit", () => {
      expect(() => controller.getUnmatchedFiles(0, 0)).toThrow(
        BadRequestException,
      );
    });
  });

  describe("GET /library/watcher/status", () => {
    it("should return watcher status", () => {
      const mockStatus = {
        watching: true,
        paths: ["/media/movies", "/media/tv"],
        errors: [],
      };
      watcherService.getStatus.mockReturnValue(mockStatus);

      const result = controller.getWatcherStatus();
      expect(result).toEqual(mockStatus);
      expect(watcherService.getStatus).toHaveBeenCalled();
    });
  });
});
