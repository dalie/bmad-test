import { Test, TestingModule } from "@nestjs/testing";
import { AdminStatsService } from "./admin-stats.service";
import { DatabaseService } from "../database/database.service";

describe("AdminStatsService", () => {
  let service: AdminStatsService;
  let mockPrepare: jest.Mock;

  function setupMockDb(queryResults: Record<string, any>) {
    mockPrepare = jest.fn().mockImplementation((sql: string) => ({
      get: jest.fn().mockReturnValue(queryResults[sql]?.get ?? { count: 0 }),
      all: jest.fn().mockReturnValue(queryResults[sql]?.all ?? []),
    }));

    return {
      getDatabase: jest.fn().mockReturnValue({ prepare: mockPrepare }),
    };
  }

  async function createService(mockDbService: any) {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminStatsService,
        { provide: DatabaseService, useValue: mockDbService },
      ],
    }).compile();
    return module.get<AdminStatsService>(AdminStatsService);
  }

  describe("getStats", () => {
    it("should return correct library totals (movies vs TV)", async () => {
      const mockDb = setupMockDb({
        "SELECT COUNT(*) as count FROM metadata WHERE media_type = 'movie'": {
          get: { count: 15 },
        },
        "SELECT COUNT(DISTINCT tmdb_id) as count FROM metadata WHERE media_type = 'tv'":
          {
            get: { count: 5 },
          },
      });

      service = await createService(mockDb);
      const stats = service.getStats();

      expect(stats.library.movieCount).toBe(15);
      expect(stats.library.tvShowCount).toBe(5);
      expect(stats.library.totalTitles).toBe(20);
    });

    it("should return correct transcode breakdown by tier", async () => {
      const mockDb = setupMockDb({
        "SELECT tier, COUNT(*) as count FROM media_files WHERE tier IS NOT NULL GROUP BY tier":
          {
            all: [
              { tier: 1, count: 10 },
              { tier: 2, count: 7 },
              { tier: 3, count: 3 },
            ],
          },
      });

      service = await createService(mockDb);
      const stats = service.getStats();

      expect(stats.transcode.byTier).toEqual({
        tier1: 10,
        tier2: 7,
        tier3: 3,
      });
    });

    it("should return correct transcode breakdown by status", async () => {
      const mockDb = setupMockDb({
        "SELECT status, COUNT(*) as count FROM transcode_jobs GROUP BY status":
          {
            all: [
              { status: "queued", count: 4 },
              { status: "processing", count: 2 },
              { status: "completed", count: 8 },
              { status: "failed", count: 1 },
            ],
          },
      });

      service = await createService(mockDb);
      const stats = service.getStats();

      expect(stats.transcode.byStatus).toEqual({
        ready: 0,
        queued: 4,
        processing: 2,
        completed: 8,
        failed: 1,
      });
    });

    it("should return correct import pipeline counts by media_files.status", async () => {
      const mockDb = setupMockDb({
        "SELECT status, COUNT(*) as count FROM media_files GROUP BY status": {
          all: [
            { status: "discovered", count: 3 },
            { status: "probed", count: 2 },
            { status: "matched", count: 5 },
            { status: "classified", count: 4 },
            { status: "ready", count: 6 },
            { status: "completed", count: 10 },
            { status: "match_failed", count: 2 },
          ],
        },
      });

      service = await createService(mockDb);
      const stats = service.getStats();

      expect(stats.pipeline.discovered).toBe(3);
      expect(stats.pipeline.probed).toBe(2);
      expect(stats.pipeline.matched).toBe(25); // matched + classified + ready + completed
      expect(stats.pipeline.unmatched).toBe(2);
    });

    it("should return scan_errors count", async () => {
      const mockDb = setupMockDb({
        "SELECT COUNT(*) as count FROM scan_errors": {
          get: { count: 7 },
        },
      });

      service = await createService(mockDb);
      const stats = service.getStats();

      expect(stats.pipeline.totalErrors).toBe(7);
    });

    it("should count probe_failed toward totalErrors", async () => {
      const mockDb = setupMockDb({
        "SELECT status, COUNT(*) as count FROM media_files GROUP BY status": {
          all: [{ status: "probe_failed", count: 3 }],
        },
        "SELECT COUNT(*) as count FROM scan_errors": {
          get: { count: 2 },
        },
      });

      service = await createService(mockDb);
      const stats = service.getStats();

      expect(stats.pipeline.totalErrors).toBe(5);
    });

    it("should return zeros when database is empty", async () => {
      const mockDb = setupMockDb({});

      service = await createService(mockDb);
      const stats = service.getStats();

      expect(stats).toEqual({
        library: { totalTitles: 0, movieCount: 0, tvShowCount: 0 },
        transcode: {
          byTier: { tier1: 0, tier2: 0, tier3: 0 },
          byStatus: {
            ready: 0,
            queued: 0,
            processing: 0,
            failed: 0,
            completed: 0,
          },
        },
        pipeline: {
          discovered: 0,
          probed: 0,
          matched: 0,
          unmatched: 0,
          totalErrors: 0,
        },
      });
    });
  });
});
