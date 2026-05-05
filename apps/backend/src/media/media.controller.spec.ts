import { Test, TestingModule } from "@nestjs/testing";
import { HttpException, NotFoundException } from "@nestjs/common";
import * as fs from "fs";
import { MediaController } from "./media.controller";
import { MediaService, MediaFileInfo, SubtitleInfo } from "./media.service";

jest.mock("fs");

const mockFs = fs as jest.Mocked<typeof fs>;

describe("MediaController", () => {
  let controller: MediaController;
  let mediaService: any;

  beforeEach(async () => {
    mediaService = {
      getFileInfo: jest.fn(),
      getAudioSidecarPath: jest.fn(),
      getSubtitleInfo: jest.fn(),
      getSubtitlesForFile: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MediaController],
      providers: [{ provide: MediaService, useValue: mediaService }],
    }).compile();

    controller = module.get<MediaController>(MediaController);
  });

  function mockRequest(rangeHeader?: string): any {
    return { headers: { range: rangeHeader } };
  }

  function mockResponse(): any {
    const res: any = {
      status: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
    };
    return res;
  }

  // ── GET /api/media/stream/:fileId ──────────────────────────────────────

  describe("GET /media/stream/:fileId", () => {
    it("should return 206 with range headers for range request", () => {
      const fileInfo: MediaFileInfo = {
        id: 1,
        path: "/media/movies/movie.mp4",
        tier: 1,
        contentType: "video/mp4",
      };
      mediaService.getFileInfo.mockReturnValue(fileInfo);
      mockFs.statSync.mockReturnValue({ size: 1000 } as any);
      mockFs.createReadStream.mockReturnValue({ pipe: jest.fn() } as any);

      const req = mockRequest("bytes=0-499");
      const res = mockResponse();

      const result = controller.streamVideo(1, req, res);

      expect(res.status).toHaveBeenCalledWith(206);
      expect(res.set).toHaveBeenCalledWith({
        "Content-Range": "bytes 0-499/1000",
        "Accept-Ranges": "bytes",
        "Content-Length": 500,
        "Content-Type": "video/mp4",
      });
      expect(mockFs.createReadStream).toHaveBeenCalledWith(
        "/media/movies/movie.mp4",
        { start: 0, end: 499 },
      );
      expect(result).toBeDefined();
    });

    it("should return 200 with full file when no Range header", () => {
      const fileInfo: MediaFileInfo = {
        id: 1,
        path: "/media/movies/movie.mp4",
        tier: 1,
        contentType: "video/mp4",
      };
      mediaService.getFileInfo.mockReturnValue(fileInfo);
      mockFs.statSync.mockReturnValue({ size: 1000 } as any);
      mockFs.createReadStream.mockReturnValue({ pipe: jest.fn() } as any);

      const req = mockRequest(undefined);
      const res = mockResponse();

      const result = controller.streamVideo(1, req, res);

      expect(res.status).not.toHaveBeenCalled();
      expect(res.set).toHaveBeenCalledWith({
        "Content-Length": 1000,
        "Content-Type": "video/mp4",
        "Accept-Ranges": "bytes",
      });
      expect(mockFs.createReadStream).toHaveBeenCalledWith(
        "/media/movies/movie.mp4",
      );
      expect(result).toBeDefined();
    });

    it("should support bytes=START- format (no end)", () => {
      const fileInfo: MediaFileInfo = {
        id: 1,
        path: "/media/movies/movie.mp4",
        tier: 1,
        contentType: "video/mp4",
      };
      mediaService.getFileInfo.mockReturnValue(fileInfo);
      mockFs.statSync.mockReturnValue({ size: 1000 } as any);
      mockFs.createReadStream.mockReturnValue({ pipe: jest.fn() } as any);

      const req = mockRequest("bytes=500-");
      const res = mockResponse();

      const result = controller.streamVideo(1, req, res);

      expect(res.status).toHaveBeenCalledWith(206);
      expect(res.set).toHaveBeenCalledWith({
        "Content-Range": "bytes 500-999/1000",
        "Accept-Ranges": "bytes",
        "Content-Length": 500,
        "Content-Type": "video/mp4",
      });
      expect(mockFs.createReadStream).toHaveBeenCalledWith(
        "/media/movies/movie.mp4",
        { start: 500, end: 999 },
      );
    });

    it("should throw for invalid range (start > fileSize)", () => {
      const fileInfo: MediaFileInfo = {
        id: 1,
        path: "/media/movies/movie.mp4",
        tier: 1,
        contentType: "video/mp4",
      };
      mediaService.getFileInfo.mockReturnValue(fileInfo);
      mockFs.statSync.mockReturnValue({ size: 1000 } as any);

      const req = mockRequest("bytes=1500-2000");
      const res = mockResponse();

      expect(() => controller.streamVideo(1, req, res)).toThrow();
      expect(res.status).toHaveBeenCalledWith(416);
      expect(res.set).toHaveBeenCalledWith({
        "Content-Range": "bytes */1000",
      });
    });

    it("should throw NotFoundException for non-existent file", () => {
      mediaService.getFileInfo.mockImplementation(() => {
        throw new NotFoundException("Media file not found");
      });

      const req = mockRequest();
      const res = mockResponse();

      expect(() => controller.streamVideo(999, req, res)).toThrow(
        NotFoundException,
      );
    });

    it("should throw NotFoundException for non-ready file", () => {
      mediaService.getFileInfo.mockImplementation(() => {
        throw new NotFoundException("Media file not ready");
      });

      const req = mockRequest();
      const res = mockResponse();

      expect(() => controller.streamVideo(1, req, res)).toThrow(
        NotFoundException,
      );
    });
  });

  // ── GET /api/media/stream/:fileId/audio ────────────────────────────────

  describe("GET /media/stream/:fileId/audio", () => {
    it("should stream audio sidecar for Tier 2 file", () => {
      mediaService.getAudioSidecarPath.mockReturnValue(
        "/mnt/cache/sidecars/audio.aac",
      );
      mockFs.statSync.mockReturnValue({ size: 5000 } as any);
      mockFs.createReadStream.mockReturnValue({ pipe: jest.fn() } as any);

      const req = mockRequest(undefined);
      const res = mockResponse();

      const result = controller.streamAudio(1, req, res);

      expect(res.set).toHaveBeenCalledWith({
        "Content-Length": 5000,
        "Content-Type": "audio/aac",
        "Accept-Ranges": "bytes",
      });
      expect(result).toBeDefined();
    });

    it("should throw NotFoundException for non-Tier-2 file", () => {
      mediaService.getAudioSidecarPath.mockImplementation(() => {
        throw new NotFoundException(
          "Audio sidecar only available for Tier 2 files",
        );
      });

      const req = mockRequest();
      const res = mockResponse();

      expect(() => controller.streamAudio(1, req, res)).toThrow(
        NotFoundException,
      );
    });
  });

  // ── GET /api/media/subtitles/:subtitleId ───────────────────────────────

  describe("GET /media/subtitles/:subtitleId", () => {
    it("should serve subtitle file with text/vtt content type", () => {
      const subtitleInfo: SubtitleInfo = {
        id: 1,
        mediaFileId: 10,
        webvttPath: "/mnt/cache/subtitles/en.vtt",
      };
      mediaService.getSubtitleInfo.mockReturnValue(subtitleInfo);
      mockFs.statSync.mockReturnValue({ size: 2000 } as any);
      mockFs.createReadStream.mockReturnValue({ pipe: jest.fn() } as any);

      const res = mockResponse();

      const result = controller.streamSubtitle(1, res);

      expect(res.set).toHaveBeenCalledWith({
        "Content-Type": "text/vtt",
        "Content-Length": 2000,
      });
      expect(mockFs.createReadStream).toHaveBeenCalledWith(
        "/mnt/cache/subtitles/en.vtt",
      );
      expect(result).toBeDefined();
    });

    it("should throw NotFoundException for invalid subtitle id", () => {
      mediaService.getSubtitleInfo.mockImplementation(() => {
        throw new NotFoundException("Subtitle not found");
      });

      const res = mockResponse();

      expect(() => controller.streamSubtitle(999, res)).toThrow(
        NotFoundException,
      );
    });
  });

  // ── GET /api/media/:fileId/subtitles ─────────────────────────────────────

  describe("GET /media/:fileId/subtitles", () => {
    it("should return array of available subtitle tracks", () => {
      const tracks = [
        { id: 1, language: "eng" },
        { id: 2, language: "fra" },
      ];
      mediaService.getSubtitlesForFile.mockReturnValue(tracks);

      const result = controller.getSubtitlesForFile(42);

      expect(mediaService.getSubtitlesForFile).toHaveBeenCalledWith(42);
      expect(result).toEqual(tracks);
    });

    it("should return empty array when no subtitles available", () => {
      mediaService.getSubtitlesForFile.mockReturnValue([]);

      const result = controller.getSubtitlesForFile(42);

      expect(result).toEqual([]);
    });

    it("should return empty array for non-existent fileId", () => {
      mediaService.getSubtitlesForFile.mockReturnValue([]);

      const result = controller.getSubtitlesForFile(999);

      expect(result).toEqual([]);
    });
  });
});
