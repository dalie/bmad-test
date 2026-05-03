import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { execFile } from "child_process";
import * as path from "path";
import * as fs from "fs";
import Database from "better-sqlite3";
import { TranscodeService } from "./transcode.service";
import { DatabaseService } from "../database/database.service";

// Mock child_process.execFile so execFileAsync can be controlled in tests
jest.mock("child_process", () => ({ execFile: jest.fn() }));

// CACHE_PATH for tests — same :memory: pattern as classification.service.spec.ts
// DatabaseService treats ':memory:' as in-memory SQLite (isolated per test)
// TranscodeService uses ':memory:' as cachePath → sidecar dir becomes ':memory:/sidecars' (relative)
const TEST_CACHE_PATH = ":memory:";
const SIDECAR_DIR = path.join(TEST_CACHE_PATH, "sidecars");

describe("TranscodeService", () => {
  let service: TranscodeService;
  let dbService: DatabaseService;
  let db: Database.Database;

  const mockExecFile = execFile as unknown as jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();
    sourceCounter = 0;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TranscodeService,
        DatabaseService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === "CACHE_PATH") return TEST_CACHE_PATH;
              return undefined;
            },
          },
        },
      ],
    }).compile();

    dbService = module.get<DatabaseService>(DatabaseService);
    dbService.onModuleInit();
    db = dbService.getDatabase();

    service = module.get<TranscodeService>(TranscodeService);
  });

  afterEach(() => {
    dbService.onModuleDestroy();
    // Clean up the sidecar directory artifact created by mkdirSync during tests
    if (fs.existsSync(SIDECAR_DIR)) {
      fs.rmSync(SIDECAR_DIR, { recursive: true, force: true });
    }
  });

  // ── Helpers ──────────────────────────────────────────────────────────────

  let sourceCounter = 0;

  function insertSource(): number {
    sourceCounter++;
    return db
      .prepare("INSERT INTO media_sources (path, type) VALUES (?, ?)")
      .run(`/media/movies-${sourceCounter}`, "movies").lastInsertRowid as number;
  }

  function insertClassifiedFile(
    sourceId: number,
    filename: string,
    tier: number,
  ): number {
    return db
      .prepare(
        "INSERT INTO media_files (path, filename, source_id, status, tier) VALUES (?, ?, ?, 'classified', ?)",
      )
      .run(`/media/${filename}`, filename, sourceId, tier)
      .lastInsertRowid as number;
  }

  function insertTranscodeJob(fileId: number, tier: number, status = "queued"): number {
    return db
      .prepare(
        "INSERT INTO transcode_jobs (file_id, tier, status) VALUES (?, ?, ?)",
      )
      .run(fileId, tier, status).lastInsertRowid as number;
  }

  function getJob(jobId: number): any {
    return db
      .prepare("SELECT * FROM transcode_jobs WHERE id = ?")
      .get(jobId) as any;
  }

  function getFile(fileId: number): any {
    return db
      .prepare("SELECT * FROM media_files WHERE id = ?")
      .get(fileId) as any;
  }

  function mockFfmpegSuccess() {
    mockExecFile.mockImplementation((...args: any[]) => {
      const callback = args[args.length - 1];
      callback(null, "", "");
    });
  }

  function mockFfmpegFailure(message = "FFmpeg error") {
    mockExecFile.mockImplementation((...args: any[]) => {
      const callback = args[args.length - 1];
      callback(new Error(message), "", "");
    });
  }

  // ── 4.3: Successful audio sidecar ────────────────────────────────────────

  describe("4.3: successful audio sidecar", () => {
    it("sets transcode_jobs.status to completed, output_path, and media_files.status to ready", async () => {
      mockFfmpegSuccess();
      const sourceId = insertSource();
      const fileId = insertClassifiedFile(sourceId, "movie.mkv", 2);
      const jobId = insertTranscodeJob(fileId, 2);

      await service.executeAudioSidecarQueue();

      const job = getJob(jobId);
      expect(job.status).toBe("completed");
      expect(job.output_path).toContain(`${fileId}.m4a`);

      const file = getFile(fileId);
      expect(file.status).toBe("ready");
    });
  });

  // ── 4.4: FFmpeg failure ───────────────────────────────────────────────────

  describe("4.4: FFmpeg failure", () => {
    it("sets transcode_jobs.status to failed with error_details, media_files.status stays classified", async () => {
      mockFfmpegFailure("codec not found");
      const sourceId = insertSource();
      const fileId = insertClassifiedFile(sourceId, "movie.mkv", 2);
      const jobId = insertTranscodeJob(fileId, 2);

      await service.executeAudioSidecarQueue();

      const job = getJob(jobId);
      expect(job.status).toBe("failed");
      expect(job.error_details).toContain("codec not found");

      const file = getFile(fileId);
      expect(file.status).toBe("classified");
    });
  });

  // ── 4.5: Crash recovery ──────────────────────────────────────────────────

  describe("4.5: crash recovery", () => {
    it("resets processing jobs back to queued before processing", async () => {
      mockFfmpegSuccess();
      const sourceId = insertSource();
      const fileId = insertClassifiedFile(sourceId, "movie.mkv", 2);
      const jobId = insertTranscodeJob(fileId, 2, "processing");

      // Verify job starts as processing
      expect(getJob(jobId).status).toBe("processing");

      await service.executeAudioSidecarQueue();

      // After the queue run: crash-recovery reset it to queued then processed it to completed
      const job = getJob(jobId);
      expect(job.status).toBe("completed");
    });
  });

  // ── 4.6: Mutex guard ─────────────────────────────────────────────────────

  describe("4.6: mutex guard", () => {
    it("skips concurrent execution — second call while first is running is a no-op", async () => {
      // Simulate already-transcoding
      (service as any).transcoding = true;

      const logSpy = jest.spyOn((service as any).logger, "log");
      await service.executeAudioSidecarQueue();

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("already in progress"),
      );
      expect(mockExecFile).not.toHaveBeenCalled();

      (service as any).transcoding = false;
    });
  });

  // ── 4.7: Error isolation ─────────────────────────────────────────────────

  describe("4.7: error isolation", () => {
    it("continues processing remaining jobs when one FFmpeg call fails", async () => {
      const sourceId = insertSource();
      const file1Id = insertClassifiedFile(sourceId, "fail.mkv", 2);
      const job1Id = insertTranscodeJob(file1Id, 2);
      const file2Id = insertClassifiedFile(sourceId, "success.mkv", 2);
      const job2Id = insertTranscodeJob(file2Id, 2);

      // First call fails, second succeeds
      mockExecFile
        .mockImplementationOnce((...args: any[]) => {
          const callback = args[args.length - 1];
          callback(new Error("FFmpeg failure"), "", "");
        })
        .mockImplementationOnce((...args: any[]) => {
          const callback = args[args.length - 1];
          callback(null, "", "");
        });

      await service.executeAudioSidecarQueue();

      expect(getJob(job1Id).status).toBe("failed");
      expect(getFile(file1Id).status).toBe("classified");

      expect(getJob(job2Id).status).toBe("completed");
      expect(getFile(file2Id).status).toBe("ready");
    });
  });

  // ── 4.8: No Tier 2 jobs ──────────────────────────────────────────────────

  describe("4.8: no Tier 2 queued jobs", () => {
    it("completes without calling FFmpeg when no queued Tier 2 jobs exist", async () => {
      await service.executeAudioSidecarQueue();
      expect(mockExecFile).not.toHaveBeenCalled();
    });
  });

  // ── 4.9: Output path construction ────────────────────────────────────────

  describe("4.9: output path construction", () => {
    it("constructs sidecar path as <cachePath>/sidecars/<fileId>.m4a", async () => {
      mockFfmpegSuccess();
      const sourceId = insertSource();
      const fileId = insertClassifiedFile(sourceId, "movie.mkv", 2);
      const jobId = insertTranscodeJob(fileId, 2);

      await service.executeAudioSidecarQueue();

      const job = getJob(jobId);
      const expectedPath = path.join(SIDECAR_DIR, `${fileId}.m4a`);
      expect(job.output_path).toBe(expectedPath);
    });
  });

  // ── Only Tier 2 jobs are processed ───────────────────────────────────────

  describe("tier filtering", () => {
    it("only processes Tier 2 jobs — ignores Tier 3 queued jobs", async () => {
      mockFfmpegSuccess();
      const sourceId = insertSource();
      const file3Id = insertClassifiedFile(sourceId, "tier3.mkv", 3);
      const job3Id = insertTranscodeJob(file3Id, 3);

      await service.executeAudioSidecarQueue();

      // Tier 3 job should remain untouched (queued, not processed by this service)
      expect(getJob(job3Id).status).toBe("queued");
      expect(mockExecFile).not.toHaveBeenCalled();
    });
  });
});
