import { Test, TestingModule } from "@nestjs/testing";
import { LibraryService } from "./library.service";
import { DatabaseService } from "../database/database.service";
import { ScannerService } from "./scanner.service";
import { ProbeService } from "./probe.service";
import { MatchingService } from "./matching.service";

describe("LibraryService", () => {
  let service: LibraryService;
  let mockDbService: any;
  let mockScanner: any;
  let mockProbeService: any;
  let mockMatchingService: any;
  let mockTransaction: jest.Mock;

  beforeEach(async () => {
    mockTransaction = jest.fn((cb) => {
      const wrappedFn = () => cb();
      return wrappedFn;
    });
    mockDbService = {
      getDatabase: jest.fn().mockReturnValue({
        prepare: jest.fn().mockImplementation((query: string) => {
          return {
            all: jest.fn().mockReturnValue([]),
            get: jest.fn().mockReturnValue({ total: 0 }),
            run: jest.fn(),
          };
        }),
        transaction: mockTransaction,
      }),
    };
    mockScanner = {
      scanDirectory: jest.fn(),
    };
    mockProbeService = {
      probeFile: jest.fn(),
    };
    mockMatchingService = {
      matchFile: jest.fn().mockResolvedValue("matched"),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LibraryService,
        { provide: DatabaseService, useValue: mockDbService },
        { provide: ScannerService, useValue: mockScanner },
        { provide: ProbeService, useValue: mockProbeService },
        { provide: MatchingService, useValue: mockMatchingService },
      ],
    }).compile();

    service = module.get<LibraryService>(LibraryService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("syncFiles", () => {
    it("should insert new files and mark missing files", () => {
      const mockRunFn = jest.fn();
      const mockAllFn = jest
        .fn()
        .mockReturnValueOnce([
          {
            id: 1,
            path: "/tmp/old.mp4",
            filename: "old.mp4",
            size: 50,
            mtime: 500,
            status: "discovered",
          },
        ])
        .mockReturnValue([]);
      const mockDb = mockDbService.getDatabase();
      mockDb.prepare = jest.fn().mockReturnValue({
        all: mockAllFn,
        get: jest.fn().mockReturnValue({ total: 0 }),
        run: mockRunFn,
      });

      const scannedFiles = [
        {
          path: "/tmp/new.mp4",
          filename: "new.mp4",
          stats: { size: 100, mtimeMs: 1000 } as any,
        },
      ];

      service.syncFiles(1, scannedFiles);
      expect(mockDb.transaction).toHaveBeenCalled();
      // Verify the transaction body was executed (insert for new file + mark missing for old)
      expect(mockRunFn).toHaveBeenCalled();
    });

    it("should flag modified files when size or mtime change", () => {
      const mockRunFn = jest.fn();
      const mockAllFn = jest.fn().mockReturnValueOnce([
        {
          id: 1,
          path: "/tmp/video.mp4",
          filename: "video.mp4",
          size: 50,
          mtime: 500,
          status: "discovered",
        },
      ]);
      const mockDb = mockDbService.getDatabase();
      mockDb.prepare = jest.fn().mockReturnValue({
        all: mockAllFn,
        get: jest.fn().mockReturnValue({ total: 0 }),
        run: mockRunFn,
      });

      const scannedFiles = [
        {
          path: "/tmp/video.mp4",
          filename: "video.mp4",
          stats: { size: 200, mtimeMs: 2000 } as any,
        },
      ];

      service.syncFiles(1, scannedFiles);
      expect(mockDb.transaction).toHaveBeenCalled();
      // flagModifiedStmt should have been called with new size, mtime, and id
      expect(mockRunFn).toHaveBeenCalledWith(200, 2000, 1);
    });
  });

  describe("startScan", () => {
    it("should return a scan ID and create a scan record", () => {
      const scanId = service.startScan(false);
      expect(scanId).toBeDefined();
      const status = service.getScanStatus(scanId);
      expect(status).toBeDefined();
      expect(status!.id).toBe(scanId);
      expect(status!.startedAt).toBeDefined();
    });
  });

  describe("getFiles", () => {
    it("should return paginated files", () => {
      const result = service.getFiles(0, 10);
      expect(result).toHaveProperty("items");
      expect(result).toHaveProperty("total");
      expect(result).toHaveProperty("offset", 0);
      expect(result).toHaveProperty("limit", 10);
    });
  });

  describe("executeProbing", () => {
    it("should probe discovered files and update status to probed on success", async () => {
      const mockRunFn = jest.fn();
      const mockAllFn = jest
        .fn()
        .mockReturnValue([
          { id: 1, path: "/media/movie.mkv", filename: "movie.mkv" },
        ]);
      const mockDb = mockDbService.getDatabase();
      mockDb.prepare = jest.fn().mockReturnValue({
        all: mockAllFn,
        get: jest.fn(),
        run: mockRunFn,
      });

      mockProbeService.probeFile.mockResolvedValue({
        format: {
          container: "matroska,webm",
          duration: 7200,
          bitrate: 5000000,
        },
        video: { codec: "h264", width: 1920, height: 1080 },
        audioTracks: [{ index: 1, codec: "ac3", channels: 6 }],
        subtitleTracks: [],
      });

      // Mock readdir for sidecar detection - no sidecars
      jest.spyOn(require("fs").promises, "readdir").mockResolvedValue([]);

      await service.executeProbing();

      expect(mockProbeService.probeFile).toHaveBeenCalledWith(
        "/media/movie.mkv",
      );
      // Should update status to probed and store probe_data
      expect(mockRunFn).toHaveBeenCalled();
    });

    it("should set status to probe_failed and log error on failure", async () => {
      const mockRunFn = jest.fn();
      const mockAllFn = jest
        .fn()
        .mockReturnValue([
          { id: 2, path: "/media/corrupt.mkv", filename: "corrupt.mkv" },
        ]);
      const mockDb = mockDbService.getDatabase();
      mockDb.prepare = jest.fn().mockReturnValue({
        all: mockAllFn,
        get: jest.fn(),
        run: mockRunFn,
      });

      mockProbeService.probeFile.mockRejectedValue(new Error("ffprobe failed"));

      await service.executeProbing();

      expect(mockProbeService.probeFile).toHaveBeenCalledWith(
        "/media/corrupt.mkv",
      );
      // Should update status to probe_failed and insert error
      expect(mockRunFn).toHaveBeenCalled();
    });

    it("should process files sequentially", async () => {
      const callOrder: number[] = [];
      const mockAllFn = jest.fn().mockReturnValue([
        { id: 1, path: "/media/a.mkv", filename: "a.mkv" },
        { id: 2, path: "/media/b.mkv", filename: "b.mkv" },
      ]);
      const mockDb = mockDbService.getDatabase();
      mockDb.prepare = jest.fn().mockReturnValue({
        all: mockAllFn,
        get: jest.fn(),
        run: jest.fn(),
      });

      jest.spyOn(require("fs").promises, "readdir").mockResolvedValue([]);

      mockProbeService.probeFile.mockImplementation(
        async (filePath: string) => {
          callOrder.push(filePath === "/media/a.mkv" ? 1 : 2);
          return {
            format: { container: "mkv", duration: 100, bitrate: 1000 },
            video: null,
            audioTracks: [],
            subtitleTracks: [],
          };
        },
      );

      await service.executeProbing();

      expect(callOrder).toEqual([1, 2]);
    });
  });

  describe("detectSidecarSubtitles", () => {
    it("should detect sidecar subtitle files matching video basename", async () => {
      const mockRunFn = jest.fn();
      const mockDb = mockDbService.getDatabase();
      mockDb.prepare = jest.fn().mockReturnValue({
        all: jest.fn().mockReturnValue([]),
        get: jest.fn(),
        run: mockRunFn,
      });

      jest
        .spyOn(require("fs").promises, "readdir")
        .mockResolvedValue([
          "Movie.Name.2024.mkv",
          "Movie.Name.2024.srt",
          "Movie.Name.2024.en.srt",
          "Movie.Name.2024.fr.ass",
          "Other.File.srt",
        ]);

      await service.detectSidecarSubtitles(1, "/media/Movie.Name.2024.mkv");

      // Should insert 3 sidecar entries (not the .mkv itself or the Other file)
      expect(mockRunFn).toHaveBeenCalledTimes(3);
    });

    it("should extract language from filename suffix", async () => {
      const runCalls: any[] = [];
      const mockDb = mockDbService.getDatabase();
      mockDb.prepare = jest.fn().mockReturnValue({
        all: jest.fn().mockReturnValue([]),
        get: jest.fn(),
        run: (...args: any[]) => runCalls.push(args),
      });

      jest
        .spyOn(require("fs").promises, "readdir")
        .mockResolvedValue(["Movie.en.srt"]);

      await service.detectSidecarSubtitles(5, "/media/Movie.mkv");

      expect(runCalls[0]).toEqual([5, "en", "srt", "/media/Movie.en.srt"]);
    });

    it("should handle readdir failure gracefully", async () => {
      jest
        .spyOn(require("fs").promises, "readdir")
        .mockRejectedValue(new Error("ENOENT"));

      // Should not throw
      await expect(
        service.detectSidecarSubtitles(1, "/nonexistent/path/movie.mkv"),
      ).resolves.toBeUndefined();
    });
  });

  describe("getFile", () => {
    it("should return file with subtitles", () => {
      const mockDb = mockDbService.getDatabase();
      const mockGet = jest
        .fn()
        .mockReturnValue({ id: 1, filename: "movie.mkv" });
      const mockAll = jest
        .fn()
        .mockReturnValue([{ id: 1, type: "embedded", language: "eng" }]);
      mockDb.prepare = jest.fn().mockReturnValue({
        get: mockGet,
        all: mockAll,
        run: jest.fn(),
      });

      const result = service.getFile(1);
      expect(result).not.toBeNull();
      expect(result!.file.filename).toBe("movie.mkv");
      expect(result!.subtitles).toHaveLength(1);
    });

    it("should return null for non-existent file", () => {
      const mockDb = mockDbService.getDatabase();
      mockDb.prepare = jest.fn().mockReturnValue({
        get: jest.fn().mockReturnValue(undefined),
        all: jest.fn().mockReturnValue([]),
        run: jest.fn(),
      });

      const result = service.getFile(999);
      expect(result).toBeNull();
    });
  });

  describe("executeMatching", () => {
    it("should process all probed files", async () => {
      const probedFiles = [
        { id: 1, path: "/media/a.mkv", filename: "a.mkv", source_id: 1 },
        { id: 2, path: "/media/b.mkv", filename: "b.mkv", source_id: 1 },
      ];
      const mockDb = mockDbService.getDatabase();
      mockDb.prepare = jest.fn().mockReturnValue({
        all: jest.fn().mockReturnValue(probedFiles),
        get: jest.fn(),
        run: jest.fn(),
      });

      await service.executeMatching();

      expect(mockMatchingService.matchFile).toHaveBeenCalledTimes(2);
      expect(mockMatchingService.matchFile).toHaveBeenCalledWith(
        probedFiles[0],
      );
      expect(mockMatchingService.matchFile).toHaveBeenCalledWith(
        probedFiles[1],
      );
    });

    it("should queue another pass if matching is already in progress", async () => {
      const mockDb = mockDbService.getDatabase();
      const firstBatch = [
        { id: 1, path: "/media/a.mkv", filename: "a.mkv", source_id: 1 },
      ];
      const secondBatch = [
        { id: 2, path: "/media/b.mkv", filename: "b.mkv", source_id: 1 },
      ];
      const all = jest
        .fn()
        .mockReturnValueOnce(firstBatch)
        .mockReturnValueOnce(secondBatch);
      mockDb.prepare = jest.fn().mockReturnValue({
        all,
        get: jest.fn(),
        run: jest.fn(),
      });

      mockMatchingService.matchFile.mockImplementation(
        async (file: { id: number }) => {
          if (file.id === 1) {
            await service.executeMatching();
          }
          return "matched";
        },
      );

      await service.executeMatching();

      expect(mockMatchingService.matchFile).toHaveBeenCalledTimes(2);
      expect(mockMatchingService.matchFile).toHaveBeenNthCalledWith(
        1,
        firstBatch[0],
      );
      expect(mockMatchingService.matchFile).toHaveBeenNthCalledWith(
        2,
        secondBatch[0],
      );
      expect(all).toHaveBeenCalledTimes(2);
    });

    it("should continue matching remaining files after one failure", async () => {
      const probedFiles = [
        { id: 1, path: "/media/a.mkv", filename: "a.mkv", source_id: 1 },
        { id: 2, path: "/media/b.mkv", filename: "b.mkv", source_id: 1 },
      ];
      const mockDb = mockDbService.getDatabase();
      mockDb.prepare = jest.fn().mockReturnValue({
        all: jest.fn().mockReturnValue(probedFiles),
        get: jest.fn(),
        run: jest.fn(),
      });

      mockMatchingService.matchFile
        .mockRejectedValueOnce(new Error("boom"))
        .mockResolvedValueOnce("matched");

      await expect(service.executeMatching()).resolves.toBeUndefined();
      expect(mockMatchingService.matchFile).toHaveBeenCalledTimes(2);
      expect(mockMatchingService.matchFile).toHaveBeenNthCalledWith(
        1,
        probedFiles[0],
      );
      expect(mockMatchingService.matchFile).toHaveBeenNthCalledWith(
        2,
        probedFiles[1],
      );
    });
  });

  describe("pipeline integration", () => {
    it("should trigger executeMatching after probing completes", async () => {
      const mockDb = mockDbService.getDatabase();
      mockDb.prepare = jest.fn().mockReturnValue({
        all: jest.fn().mockReturnValue([]),
        get: jest.fn(),
        run: jest.fn(),
      });

      // Spy on executeMatching
      const matchingSpy = jest
        .spyOn(service, "executeMatching")
        .mockResolvedValue();

      await service.executeProbing();

      expect(matchingSpy).toHaveBeenCalled();
    });
  });
});
