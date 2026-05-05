import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { NotFoundException, BadRequestException } from "@nestjs/common";
import Database from "better-sqlite3";
import { AdminJobsService } from "./admin-jobs.service";
import { DatabaseService } from "../database/database.service";

describe("AdminJobsService", () => {
  let service: AdminJobsService;
  let dbService: DatabaseService;
  let db: Database.Database;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminJobsService,
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

    service = module.get<AdminJobsService>(AdminJobsService);
  });

  afterEach(() => {
    dbService.onModuleDestroy();
  });

  function insertSource(type = "movies"): number {
    return db
      .prepare("INSERT INTO media_sources (path, type) VALUES (?, ?)")
      .run(`/media/${type}`, type).lastInsertRowid as number;
  }

  function insertMediaFile(
    sourceId: number,
    filename: string,
    status = "discovered",
  ): number {
    return db
      .prepare(
        "INSERT INTO media_files (path, filename, source_id, status) VALUES (?, ?, ?, ?)",
      )
      .run(`/media/movies/${filename}`, filename, sourceId, status)
      .lastInsertRowid as number;
  }

  function insertTranscodeJob(
    fileId: number,
    tier: number,
    status: string,
    errorDetails: string | null = null,
  ): number {
    return db
      .prepare(
        "INSERT INTO transcode_jobs (file_id, tier, status, error_details) VALUES (?, ?, ?, ?)",
      )
      .run(fileId, tier, status, errorDetails).lastInsertRowid as number;
  }

  function insertScanError(
    filePath: string,
    errorType: string,
    errorMessage: string,
  ): number {
    return db
      .prepare(
        "INSERT INTO scan_errors (file_path, error_type, error_message) VALUES (?, ?, ?)",
      )
      .run(filePath, errorType, errorMessage).lastInsertRowid as number;
  }

  describe("getPipelineStatus", () => {
    it("should return correct aggregate counts", () => {
      const sourceId = insertSource();
      const f1 = insertMediaFile(sourceId, "a.mkv");
      const f2 = insertMediaFile(sourceId, "b.mkv");
      const f3 = insertMediaFile(sourceId, "c.mkv");
      const f4 = insertMediaFile(sourceId, "d.mkv", "match_failed");

      insertTranscodeJob(f1, 2, "queued");
      insertTranscodeJob(f2, 3, "failed", "some error");
      insertTranscodeJob(f3, 2, "completed");

      insertScanError("/media/x.mkv", "PROBE_FAILED", "probe err");
      insertScanError("/media/y.mkv", "SCAN_ERROR", "scan err");

      const status = service.getPipelineStatus();

      expect(status.transcode.queued).toBe(1);
      expect(status.transcode.failed).toBe(1);
      expect(status.transcode.completed).toBe(1);
      expect(status.transcode.processing).toBe(0);
      expect(status.scanErrors).toBe(2);
      expect(status.probeFailures).toBe(1);
      expect(status.matchFailures).toBe(1);
    });

    it("should return zeros when no jobs or errors exist", () => {
      const status = service.getPipelineStatus();

      expect(status.transcode.queued).toBe(0);
      expect(status.transcode.failed).toBe(0);
      expect(status.transcode.completed).toBe(0);
      expect(status.transcode.processing).toBe(0);
      expect(status.scanErrors).toBe(0);
      expect(status.probeFailures).toBe(0);
      expect(status.matchFailures).toBe(0);
    });
  });

  describe("getFailedJobs", () => {
    it("should return transcode failures with filename, stage, error, timestamp", () => {
      const sourceId = insertSource();
      const fileId = insertMediaFile(sourceId, "movie.mkv");
      insertTranscodeJob(fileId, 3, "failed", "ffmpeg crashed");

      const jobs = service.getFailedJobs();

      expect(jobs.length).toBeGreaterThanOrEqual(1);
      const tj = jobs.find((j) => j.stage === "transcode");
      expect(tj).toBeDefined();
      expect(tj!.filename).toBe("movie.mkv");
      expect(tj!.errorMessage).toBe("ffmpeg crashed");
      expect(tj!.retryable).toBe(true);
      expect(tj!.timestamp).toBeDefined();
    });

    it("should return scan/probe/match errors from scan_errors table", () => {
      insertScanError("/media/file.mkv", "PROBE_FAILED", "cannot probe");
      insertScanError("/media/other.mkv", "MATCH_FAILED", "no match");

      const jobs = service.getFailedJobs();

      const probeJob = jobs.find((j) => j.stage === "probe");
      expect(probeJob).toBeDefined();
      expect(probeJob!.filename).toBe("/media/file.mkv");
      expect(probeJob!.errorMessage).toBe("cannot probe");
      expect(probeJob!.retryable).toBe(false);
      expect(probeJob!.id).toMatch(/^se-/);

      const matchJob = jobs.find((j) => j.stage === "match");
      expect(matchJob).toBeDefined();
      expect(matchJob!.filename).toBe("/media/other.mkv");
    });

    it("should return empty results when no jobs/errors exist", () => {
      const jobs = service.getFailedJobs();
      expect(jobs).toEqual([]);
    });
  });

  describe("getJobDetails", () => {
    it("should return full details for existing transcode job", () => {
      const sourceId = insertSource();
      const fileId = insertMediaFile(sourceId, "vid.mkv");
      const jobId = insertTranscodeJob(fileId, 3, "failed", "stack trace here");

      const detail = service.getJobDetails(String(jobId));

      expect(detail.id).toBe(String(jobId));
      expect(detail.filename).toBe("vid.mkv");
      expect(detail.stage).toBe("transcode");
      expect(detail.tier).toBe(3);
      expect(detail.errorDetails).toBe("stack trace here");
      expect(detail.createdAt).toBeDefined();
    });

    it("should return full details for scan error job", () => {
      const errorId = insertScanError(
        "/media/test/file.mkv",
        "PROBE_FAILED",
        "ffprobe timeout",
      );

      const detail = service.getJobDetails(`se-${errorId}`);

      expect(detail.id).toBe(`se-${errorId}`);
      expect(detail.filename).toBe("file.mkv");
      expect(detail.filePath).toBe("/media/test/file.mkv");
      expect(detail.stage).toBe("probe");
      expect(detail.errorMessage).toBe("ffprobe timeout");
      expect(detail.tier).toBeNull();
    });

    it("should throw NotFoundException for missing transcode job", () => {
      expect(() => service.getJobDetails("9999")).toThrow(NotFoundException);
    });

    it("should throw NotFoundException for missing scan error", () => {
      expect(() => service.getJobDetails("se-9999")).toThrow(NotFoundException);
    });

    it("should throw NotFoundException for invalid id format", () => {
      expect(() => service.getJobDetails("se-abc")).toThrow(NotFoundException);
      expect(() => service.getJobDetails("abc")).toThrow(NotFoundException);
    });
  });

  describe("retryJob", () => {
    it("should reset status to queued and clear error_details", () => {
      const sourceId = insertSource();
      const fileId = insertMediaFile(sourceId, "retry.mkv");
      const jobId = insertTranscodeJob(fileId, 2, "failed", "error msg");

      const result = service.retryJob(jobId);

      expect(result).toEqual({ success: true });

      const row = db
        .prepare(
          "SELECT status, error_details FROM transcode_jobs WHERE id = ?",
        )
        .get(jobId) as any;
      expect(row.status).toBe("queued");
      expect(row.error_details).toBeNull();
    });

    it("should throw NotFoundException for missing job", () => {
      expect(() => service.retryJob(9999)).toThrow(NotFoundException);
    });

    it("should throw BadRequestException for non-failed job", () => {
      const sourceId = insertSource();
      const fileId = insertMediaFile(sourceId, "ok.mkv");
      const jobId = insertTranscodeJob(fileId, 2, "completed");

      expect(() => service.retryJob(jobId)).toThrow(BadRequestException);
    });
  });
});
