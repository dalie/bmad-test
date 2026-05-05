import { Test, TestingModule } from "@nestjs/testing";
import { AccessController, AdminController } from "./admin.controller";
import { LanDetectionService } from "./lan-detection.service";
import { LanGuard } from "./lan.guard";
import { ForbiddenException } from "@nestjs/common";

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

  beforeEach(async () => {
    const lanDetectionService = {
      isLan: jest.fn(),
      isLocalIp: jest.fn(),
      getClientIp: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: LanDetectionService, useValue: lanDetectionService },
        LanGuard,
      ],
    }).compile();

    controller = module.get<AdminController>(AdminController);
  });

  describe("GET /admin/stats (protected)", () => {
    it("should return {} when accessed", () => {
      expect(controller.getStats()).toEqual({});
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
