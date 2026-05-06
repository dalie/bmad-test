import { Test, TestingModule } from "@nestjs/testing";
import { AccessController, AdminController } from "./admin.controller";
import { AdminStatsService, AdminStats } from "./admin-stats.service";
import {
  AdminJobsService,
  FailedJobSummary,
  JobDetail,
  PipelineMonitorStatus,
} from "./admin-jobs.service";
import { LanDetectionService } from "./lan-detection.service";
import { LanGuard } from "./lan.guard";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { LibraryService, ScanRecord } from "../library/library.service";

const mockStats: AdminStats = {
  library: { totalTitles: 20, movieCount: 15, tvShowCount: 5 },
  transcode: {
    byTier: { tier1: 10, tier2: 7, tier3: 3 },
    byStatus: { ready: 0, queued: 4, processing: 2, failed: 1, completed: 8 },
  },
  pipeline: {
    discovered: 3,
    probed: 2,
    matched: 12,
    unmatched: 1,
    totalErrors: 2,
  },
};

describe("AccessController", () => {
  let controller: AccessController;
  let lanDetectionService: jest.Mocked<LanDetectionService>;

  beforeEach(async () => {
    lanDetectionService = {
      isLan: jest.fn(),
      isLocalIp: jest.fn(),
      getClientIp: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AccessController],
      providers: [
        { provide: LanDetectionService, useValue: lanDetectionService },
      ],
    }).compile();

    controller = module.get<AccessController>(AccessController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  describe("GET /admin/access", () => {
    it("should return { admin: true } from loopback", () => {
      lanDetectionService.isLan.mockReturnValue(true);
      const request = { ip: "127.0.0.1", headers: {} };

      expect(controller.checkAccess(request)).toEqual({ admin: true });
    });

    it("should return { admin: false } for non-LAN client", () => {
      lanDetectionService.isLan.mockReturnValue(false);
      const request = { ip: "10.0.0.5", headers: {} };

      expect(controller.checkAccess(request)).toEqual({ admin: false });
    });
  });
});

describe("AdminController", () => {
  let controller: AdminController;
  let adminStatsService: jest.Mocked<AdminStatsService>;
  let adminJobsService: jest.Mocked<AdminJobsService>;
  let libraryService: jest.Mocked<LibraryService>;

  beforeEach(async () => {
    const lanDetectionService = {
      isLan: jest.fn(),
      isLocalIp: jest.fn(),
      getClientIp: jest.fn(),
    } as any;

    adminStatsService = {
      getStats: jest.fn().mockReturnValue(mockStats),
    } as any;

    adminJobsService = {
      getPipelineStatus: jest.fn().mockReturnValue({
        transcode: { queued: 2, processing: 1, completed: 10, failed: 3 },
        scanErrors: 5,
        probeFailures: 2,
        matchFailures: 1,
      }),
      getFailedJobs: jest.fn().mockReturnValue([
        {
          id: "1",
          filename: "test.mkv",
          stage: "transcode",
          errorMessage: "ffmpeg error",
          timestamp: "2026-05-05T10:00:00",
          retryable: true,
        },
      ]),
      getJobDetails: jest.fn().mockReturnValue({
        id: "1",
        filename: "test.mkv",
        filePath: "/media/test.mkv",
        stage: "transcode",
        tier: 3,
        status: "failed",
        errorMessage: "ffmpeg error",
        errorDetails: "full stack trace",
        createdAt: "2026-05-05T09:00:00",
        updatedAt: "2026-05-05T10:00:00",
      }),
      retryJob: jest.fn().mockReturnValue({ success: true }),
    } as any;

    libraryService = {
      startScan: jest.fn().mockReturnValue("scan-uuid-123"),
      getScanStatus: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: LanDetectionService, useValue: lanDetectionService },
        { provide: AdminStatsService, useValue: adminStatsService },
        { provide: AdminJobsService, useValue: adminJobsService },
        { provide: LibraryService, useValue: libraryService },
        LanGuard,
      ],
    }).compile();

    controller = module.get<AdminController>(AdminController);
  });

  describe("GET /admin/stats (protected)", () => {
    it("should return full stats object", () => {
      const result = controller.getStats();
      expect(result).toEqual(mockStats);
      expect(adminStatsService.getStats).toHaveBeenCalled();
    });
  });

  describe("GET /admin/pipeline", () => {
    it("should return pipeline status counts", () => {
      const result = controller.getPipelineStatus();
      expect(result.transcode.queued).toBe(2);
      expect(result.transcode.failed).toBe(3);
      expect(result.scanErrors).toBe(5);
      expect(adminJobsService.getPipelineStatus).toHaveBeenCalled();
    });
  });

  describe("GET /admin/jobs", () => {
    it("should return jobs list", () => {
      const result = controller.getFailedJobs();
      expect(result).toHaveLength(1);
      expect(result[0].filename).toBe("test.mkv");
      expect(adminJobsService.getFailedJobs).toHaveBeenCalled();
    });
  });

  describe("GET /admin/jobs/:id", () => {
    it("should return job details", () => {
      const result = controller.getJobDetails("1");
      expect(result.filename).toBe("test.mkv");
      expect(result.errorDetails).toBe("full stack trace");
      expect(adminJobsService.getJobDetails).toHaveBeenCalledWith("1");
    });
  });

  describe("POST /admin/jobs/:id/retry", () => {
    it("should return success", () => {
      const result = controller.retryJob(1);
      expect(result).toEqual({ success: true });
      expect(adminJobsService.retryJob).toHaveBeenCalledWith(1);
    });
  });

  describe("POST /admin/rescan", () => {
    it("should call libraryService.startScan(true) and return scanId", () => {
      const result = controller.triggerRescan();
      expect(result).toEqual({ scanId: "scan-uuid-123" });
      expect(libraryService.startScan).toHaveBeenCalledWith(true);
    });
  });

  describe("GET /admin/rescan/:scanId", () => {
    it("should return scan record when found", () => {
      const mockRecord: ScanRecord = {
        id: "scan-uuid-123",
        status: "in_progress",
        startedAt: "2026-05-05T10:00:00.000Z",
        completedAt: null,
        discovered: 15,
        processed: 7,
        failed: 0,
        errors: [],
      };
      libraryService.getScanStatus.mockReturnValue(mockRecord);

      const result = controller.getScanStatus("scan-uuid-123");
      expect(result).toEqual(mockRecord);
      expect(libraryService.getScanStatus).toHaveBeenCalledWith(
        "scan-uuid-123",
      );
    });

    it("should throw NotFoundException when scanId not found", () => {
      libraryService.getScanStatus.mockReturnValue(undefined);

      expect(() => controller.getScanStatus("nonexistent-id")).toThrow(
        NotFoundException,
      );
    });
  });

  describe("LanGuard integration", () => {
    let guard: LanGuard;
    let lanDetectionService: jest.Mocked<LanDetectionService>;

    beforeEach(() => {
      lanDetectionService = {
        isLan: jest.fn(),
        isLocalIp: jest.fn(),
        getClientIp: jest.fn(),
      } as any;
      guard = new LanGuard(lanDetectionService);
    });

    it("should block non-LAN access to protected endpoints", () => {
      lanDetectionService.isLan.mockReturnValue(false);
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({ ip: "10.0.0.5", headers: {} }),
        }),
      } as any;

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });
});
