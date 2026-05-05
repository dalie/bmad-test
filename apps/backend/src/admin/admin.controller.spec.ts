import { Test, TestingModule } from "@nestjs/testing";
import { AccessController, AdminController } from "./admin.controller";
import { AdminStatsService, AdminStats } from "./admin-stats.service";
import { LanDetectionService } from "./lan-detection.service";
import { LanGuard } from "./lan.guard";
import { ForbiddenException } from "@nestjs/common";

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

  beforeEach(async () => {
    const lanDetectionService = {
      isLan: jest.fn(),
      isLocalIp: jest.fn(),
      getClientIp: jest.fn(),
    } as any;

    adminStatsService = {
      getStats: jest.fn().mockReturnValue(mockStats),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: LanDetectionService, useValue: lanDetectionService },
        { provide: AdminStatsService, useValue: adminStatsService },
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
