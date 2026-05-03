import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import Database from "better-sqlite3";
import { PipelineService } from "./pipeline.service";
import { DatabaseService } from "../database/database.service";

describe("PipelineService", () => {
  let service: PipelineService;
  let dbService: DatabaseService;
  let db: Database.Database;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PipelineService,
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

    service = module.get<PipelineService>(PipelineService);
  });

  afterEach(() => {
    dbService.onModuleDestroy();
  });

  // ── Helpers ──────────────────────────────────────────────────────────────

  function insertSource(): number {
    return db
      .prepare("INSERT INTO media_sources (path, type) VALUES (?, ?)")
      .run("/media/movies", "movies").lastInsertRowid as number;
  }

  function insertMediaFile(
    sourceId: number,
    filename: string,
    status = "matched",
    tier: number | null = null,
  ): number {
    return db
      .prepare(
        "INSERT INTO media_files (path, filename, source_id, status, tier) VALUES (?, ?, ?, ?, ?)",
      )
      .run(`/media/${filename}`, filename, sourceId, status, tier)
      .lastInsertRowid as number;
  }

  function insertTranscodeJob(fileId: number, tier: number, status: string): number {
    return db
      .prepare(
        "INSERT INTO transcode_jobs (file_id, tier, status) VALUES (?, ?, ?)",
      )
      .run(fileId, tier, status).lastInsertRowid as number;
  }

  // ── onModuleInit() ────────────────────────────────────────────────────────

  describe("onModuleInit()", () => {
    it("should reset stuck processing jobs to queued on startup", () => {
      const sourceId = insertSource();
      const fileId = insertMediaFile(sourceId, "stuck.mkv");
      insertTranscodeJob(fileId, 2, "processing");

      service.onModuleInit();

      const result = service.getStatus();
      expect(result.processing).toBe(0);
      expect(result.queued).toBe(1);
    });

    it("should not affect queued, completed, or failed jobs", () => {
      const sourceId = insertSource();
      const f1 = insertMediaFile(sourceId, "queued.mkv");
      const f2 = insertMediaFile(sourceId, "completed.mkv");
      const f3 = insertMediaFile(sourceId, "failed.mkv");

      insertTranscodeJob(f1, 2, "queued");
      insertTranscodeJob(f2, 2, "completed");
      insertTranscodeJob(f3, 3, "failed");

      service.onModuleInit();

      const result = service.getStatus();
      expect(result.queued).toBe(1);
      expect(result.completed).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.processing).toBe(0);
    });
  });

  // ── getStatus() ───────────────────────────────────────────────────────────

  describe("getStatus()", () => {
    it("should return all zeros when DB is empty", () => {
      const result = service.getStatus();
      expect(result).toEqual({
        queued: 0,
        processing: 0,
        completed: 0,
        failed: 0,
      });
    });

    it("should return correct counts for mixed job statuses", () => {
      const sourceId = insertSource();
      const f1 = insertMediaFile(sourceId, "a.mkv");
      const f2 = insertMediaFile(sourceId, "b.mkv");
      const f3 = insertMediaFile(sourceId, "c.mkv");
      const f4 = insertMediaFile(sourceId, "d.mkv");
      const f5 = insertMediaFile(sourceId, "e.mkv");

      insertTranscodeJob(f1, 2, "queued");
      insertTranscodeJob(f2, 2, "queued");
      insertTranscodeJob(f3, 3, "processing");
      insertTranscodeJob(f4, 3, "completed");
      insertTranscodeJob(f5, 3, "failed");

      const result = service.getStatus();
      expect(result.queued).toBe(2);
      expect(result.processing).toBe(1);
      expect(result.completed).toBe(1);
      expect(result.failed).toBe(1);
    });

    it("should default missing statuses to 0", () => {
      const sourceId = insertSource();
      const fileId = insertMediaFile(sourceId, "only-queued.mkv");
      insertTranscodeJob(fileId, 2, "queued");

      const result = service.getStatus();
      expect(result.queued).toBe(1);
      expect(result.processing).toBe(0);
      expect(result.completed).toBe(0);
      expect(result.failed).toBe(0);
    });
  });

  // ── getJobs() ─────────────────────────────────────────────────────────────

  describe("getJobs()", () => {
    it("should return empty array when no jobs exist", () => {
      const result = service.getJobs();
      expect(result).toEqual([]);
    });

    it("should return jobs with all expected fields", () => {
      const sourceId = insertSource();
      const fileId = insertMediaFile(sourceId, "movie.mkv");
      insertTranscodeJob(fileId, 2, "queued");

      const jobs = service.getJobs();
      expect(jobs).toHaveLength(1);

      const job = jobs[0];
      expect(typeof job.id).toBe("number");
      expect(job.file_id).toBe(fileId);
      expect(job.filename).toBe("movie.mkv");
      expect(job.tier).toBe(2);
      expect(job.status).toBe("queued");
      expect("output_path" in job).toBe(true);
      expect("error_details" in job).toBe(true);
      expect(typeof job.created_at).toBe("string");
      expect(typeof job.updated_at).toBe("string");
    });

    it("should return jobs ordered by created_at ASC then id ASC", () => {
      const sourceId = insertSource();
      const f1 = insertMediaFile(sourceId, "first.mkv");
      const f2 = insertMediaFile(sourceId, "second.mkv");
      const f3 = insertMediaFile(sourceId, "third.mkv");

      const job1Id = insertTranscodeJob(f1, 2, "queued");
      const job2Id = insertTranscodeJob(f2, 3, "processing");
      const job3Id = insertTranscodeJob(f3, 3, "completed");

      // Set created_at in reverse ID order to prove created_at sort, not insertion order
      db.prepare("UPDATE transcode_jobs SET created_at = ? WHERE id = ?").run("2026-01-01T10:00:00", job1Id);
      db.prepare("UPDATE transcode_jobs SET created_at = ? WHERE id = ?").run("2026-01-01T09:00:00", job2Id);
      db.prepare("UPDATE transcode_jobs SET created_at = ? WHERE id = ?").run("2026-01-01T08:00:00", job3Id);

      const jobs = service.getJobs();
      expect(jobs).toHaveLength(3);
      expect(jobs[0].id).toBe(job3Id); // created_at 08:00 — earliest
      expect(jobs[1].id).toBe(job2Id); // created_at 09:00
      expect(jobs[2].id).toBe(job1Id); // created_at 10:00 — latest
    });
  });
});
