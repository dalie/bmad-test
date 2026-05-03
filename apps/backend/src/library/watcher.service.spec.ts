import { Test, TestingModule } from "@nestjs/testing";
import { WatcherService } from "./watcher.service";
import { DatabaseService } from "../database/database.service";
import { LibraryService } from "./library.service";
import * as fs from "fs";

jest.mock("fs", () => {
  const actual = jest.requireActual("fs");
  return {
    ...actual,
    watch: jest.fn(),
    promises: {
      ...actual.promises,
      stat: jest.fn(),
    },
  };
});

const mockWatch = fs.watch as jest.MockedFunction<typeof fs.watch>;
const mockStat = fs.promises.stat as jest.MockedFunction<
  typeof fs.promises.stat
>;

describe("WatcherService", () => {
  let service: WatcherService;
  let mockDatabaseService: any;
  let mockLibraryService: any;
  let mockWatcher: any;
  let watchCallbacks: Map<
    string,
    (eventType: string, filename: string) => void
  >;

  beforeEach(async () => {
    jest.useFakeTimers();
    watchCallbacks = new Map();

    mockWatcher = {
      close: jest.fn(),
      on: jest.fn(),
    };

    mockWatch.mockImplementation(((
      watchPath: any,
      _options: any,
      callback: any,
    ) => {
      watchCallbacks.set(watchPath, callback);
      return mockWatcher;
    }) as any);

    mockStat.mockResolvedValue({
      size: 1024,
      mtimeMs: 1000,
    } as any);

    mockDatabaseService = {
      getDatabase: jest.fn().mockReturnValue({
        prepare: jest.fn().mockReturnValue({
          all: jest.fn().mockReturnValue([
            { id: 1, path: "/media/movies", type: "movies" },
            { id: 2, path: "/media/tv", type: "tv" },
          ]),
        }),
      }),
    };

    mockLibraryService = {
      syncFiles: jest.fn(),
      executeProbing: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WatcherService,
        { provide: DatabaseService, useValue: mockDatabaseService },
        { provide: LibraryService, useValue: mockLibraryService },
      ],
    }).compile();

    service = module.get<WatcherService>(WatcherService);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("lifecycle", () => {
    it("should start watching on init with correct paths", () => {
      service.onModuleInit();

      expect(mockWatch).toHaveBeenCalledTimes(2);
      expect(mockWatch).toHaveBeenCalledWith(
        "/media/movies",
        { recursive: true },
        expect.any(Function),
      );
      expect(mockWatch).toHaveBeenCalledWith(
        "/media/tv",
        { recursive: true },
        expect.any(Function),
      );
    });

    it("should close all watchers on destroy", () => {
      service.onModuleInit();
      service.onModuleDestroy();

      expect(mockWatcher.close).toHaveBeenCalledTimes(2);
    });

    it("should register error handler on each watcher", () => {
      service.onModuleInit();

      expect(mockWatcher.on).toHaveBeenCalledWith(
        "error",
        expect.any(Function),
      );
    });
  });

  describe("file detection", () => {
    beforeEach(() => {
      service.onModuleInit();
    });

    it("should detect new video file and trigger pipeline", async () => {
      const mockStats = { size: 1024, mtimeMs: 1000 } as fs.Stats;
      mockStat.mockResolvedValue(mockStats);

      watchCallbacks.get("/media/movies")!("rename", "NewMovie.2026.mkv");

      // Let existence check + stability check first stat resolve
      await jest.advanceTimersByTimeAsync(2000);
      // Stability check second stat resolves - file stable
      await jest.advanceTimersByTimeAsync(3000);
      // Debounce fires

      expect(mockLibraryService.syncFiles).toHaveBeenCalledWith(1, [
        {
          path: "/media/movies/NewMovie.2026.mkv",
          filename: "NewMovie.2026.mkv",
          stats: mockStats,
        },
      ]);
      expect(mockLibraryService.executeProbing).toHaveBeenCalled();
    });

    it("should ignore non-video files", async () => {
      watchCallbacks.get("/media/movies")!("rename", "readme.txt");
      await jest.advanceTimersByTimeAsync(10000);

      expect(mockStat).not.toHaveBeenCalled();
      expect(mockLibraryService.syncFiles).not.toHaveBeenCalled();
    });

    it("should ignore .nfo files", async () => {
      watchCallbacks.get("/media/movies")!("rename", "movie.nfo");
      await jest.advanceTimersByTimeAsync(10000);

      expect(mockStat).not.toHaveBeenCalled();
      expect(mockLibraryService.syncFiles).not.toHaveBeenCalled();
    });

    it("should ignore change events (only handle rename)", async () => {
      watchCallbacks.get("/media/movies")!("change", "movie.mkv");
      await jest.advanceTimersByTimeAsync(10000);

      expect(mockStat).not.toHaveBeenCalled();
    });

    it("should ignore deleted files (stat throws)", async () => {
      mockStat.mockRejectedValue(
        new Error("ENOENT: no such file or directory"),
      );

      watchCallbacks.get("/media/movies")!("rename", "deleted.mkv");
      await jest.advanceTimersByTimeAsync(10000);

      expect(mockLibraryService.syncFiles).not.toHaveBeenCalled();
    });
  });

  describe("stability check", () => {
    beforeEach(() => {
      service.onModuleInit();
    });

    it("should process file when stable (same size/mtime)", async () => {
      const stableStats = { size: 2048, mtimeMs: 5000 } as fs.Stats;
      mockStat.mockResolvedValue(stableStats);

      watchCallbacks.get("/media/movies")!("rename", "stable.mp4");

      await jest.advanceTimersByTimeAsync(2000);
      await jest.advanceTimersByTimeAsync(3000);

      expect(mockLibraryService.syncFiles).toHaveBeenCalledWith(1, [
        expect.objectContaining({ path: "/media/movies/stable.mp4" }),
      ]);
    });

    it("should retry when file is unstable (different size)", async () => {
      let callCount = 0;
      mockStat.mockImplementation(async () => {
        callCount++;
        if (callCount <= 2) {
          return { size: callCount * 100, mtimeMs: 1000 } as fs.Stats;
        }
        return { size: 300, mtimeMs: 1000 } as fs.Stats;
      });

      watchCallbacks.get("/media/movies")!("rename", "unstable.mkv");

      // First stability round (existence + stat1 + wait + stat2 unstable)
      await jest.advanceTimersByTimeAsync(2000);
      // Retry stability round (stat1 + wait + stat2 stable)
      await jest.advanceTimersByTimeAsync(2000);
      // Debounce
      await jest.advanceTimersByTimeAsync(3000);

      expect(mockLibraryService.syncFiles).toHaveBeenCalled();
    });

    it("should log warning and skip file after max retries", async () => {
      let callCount = 0;
      mockStat.mockImplementation(async () => {
        callCount++;
        return { size: callCount * 100, mtimeMs: callCount * 100 } as fs.Stats;
      });

      const loggerSpy = jest.spyOn(service["logger"], "warn");

      watchCallbacks.get("/media/movies")!("rename", "never-stable.avi");

      // Run through all retries (30 * 2s = 60s + initial)
      await jest.advanceTimersByTimeAsync(65000);

      expect(mockLibraryService.syncFiles).not.toHaveBeenCalled();
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining("never stabilized"),
      );
    });
  });

  describe("error resilience", () => {
    it("should handle watcher error event without crashing", () => {
      service.onModuleInit();

      const errorCallback = mockWatcher.on.mock.calls.find(
        (call: any) => call[0] === "error",
      )[1];

      expect(() => {
        errorCallback(new Error("EACCES: permission denied"));
      }).not.toThrow();

      const status = service.getStatus();
      expect(status.errors).toEqual(
        expect.arrayContaining([expect.stringContaining("permission denied")]),
      );
    });

    it("should handle fs.watch setup failure gracefully", () => {
      mockWatch.mockImplementation(() => {
        throw new Error("ENOENT: no such file or directory");
      });

      expect(() => service.onModuleInit()).not.toThrow();

      const status = service.getStatus();
      expect(status.watching).toBe(false);
      expect(status.errors.length).toBeGreaterThan(0);
    });

    it("should log error when stability stat fails", async () => {
      let callCount = 0;
      mockStat.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return { size: 1024, mtimeMs: 1000 } as fs.Stats;
        }
        throw new Error("EACCES: permission denied");
      });

      const loggerSpy = jest.spyOn(service["logger"], "error");

      service.onModuleInit();
      watchCallbacks.get("/media/movies")!("rename", "perm-error.mkv");

      await jest.advanceTimersByTimeAsync(5000);

      expect(mockLibraryService.syncFiles).not.toHaveBeenCalled();
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining("Stability check failed"),
      );
    });
  });

  describe("debouncing", () => {
    beforeEach(() => {
      service.onModuleInit();
    });

    it("should batch multiple rapid events into single syncFiles call", async () => {
      const mockStats = { size: 1024, mtimeMs: 1000 } as fs.Stats;
      mockStat.mockResolvedValue(mockStats);

      watchCallbacks.get("/media/movies")!("rename", "movie1.mkv");
      watchCallbacks.get("/media/movies")!("rename", "movie2.mp4");
      watchCallbacks.get("/media/movies")!("rename", "movie3.avi");

      // Stability checks resolve
      await jest.advanceTimersByTimeAsync(2000);
      // Debounce fires
      await jest.advanceTimersByTimeAsync(3000);

      expect(mockLibraryService.syncFiles).toHaveBeenCalledTimes(1);
      expect(mockLibraryService.syncFiles).toHaveBeenCalledWith(
        1,
        expect.arrayContaining([
          expect.objectContaining({ filename: "movie1.mkv" }),
          expect.objectContaining({ filename: "movie2.mp4" }),
          expect.objectContaining({ filename: "movie3.avi" }),
        ]),
      );
    });
  });

  describe("getStatus", () => {
    it("should return correct status when watching", () => {
      service.onModuleInit();

      const status = service.getStatus();
      expect(status.watching).toBe(true);
      expect(status.paths).toEqual(["/media/movies", "/media/tv"]);
      expect(status.errors).toEqual([]);
    });

    it("should return watching=false before init", () => {
      const status = service.getStatus();
      expect(status.watching).toBe(false);
      expect(status.paths).toEqual([]);
    });
  });
});
