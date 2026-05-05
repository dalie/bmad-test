import { LanGuard } from "./lan.guard";
import { LanDetectionService } from "./lan-detection.service";
import { ExecutionContext, ForbiddenException } from "@nestjs/common";

describe("LanGuard", () => {
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

  function createMockContext(ip: string): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ ip, headers: {} }),
      }),
    } as any;
  }

  it("should allow request from LAN IP", () => {
    lanDetectionService.isLan.mockReturnValue(true);
    const context = createMockContext("192.168.1.50");

    expect(guard.canActivate(context)).toBe(true);
  });

  it("should throw ForbiddenException for non-LAN IP", () => {
    lanDetectionService.isLan.mockReturnValue(false);
    const context = createMockContext("10.0.0.5");

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
