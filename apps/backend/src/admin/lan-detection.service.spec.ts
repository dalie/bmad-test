import { LanDetectionService } from "./lan-detection.service";
import * as os from "os";

jest.mock("os", () => ({
  ...jest.requireActual("os"),
  networkInterfaces: jest.fn(),
}));

const mockedNetworkInterfaces = os.networkInterfaces as jest.MockedFunction<
  typeof os.networkInterfaces
>;

describe("LanDetectionService", () => {
  let service: LanDetectionService;

  beforeEach(() => {
    delete process.env.ADMIN_SUBNET;
    delete process.env.TRUST_PROXY;

    mockedNetworkInterfaces.mockReturnValue({
      eth0: [
        {
          address: "192.168.1.108",
          netmask: "255.255.255.0",
          family: "IPv4",
          mac: "00:00:00:00:00:00",
          internal: false,
          cidr: "192.168.1.108/24",
        },
      ],
      lo: [
        {
          address: "127.0.0.1",
          netmask: "255.0.0.0",
          family: "IPv4",
          mac: "00:00:00:00:00:00",
          internal: true,
          cidr: "127.0.0.1/8",
        },
      ],
    });

    service = new LanDetectionService();
  });

  describe("isLocalIp", () => {
    it("should return true for 127.0.0.1 (loopback)", () => {
      expect(service.isLocalIp("127.0.0.1")).toBe(true);
    });

    it("should return true for ::1 (IPv6 loopback)", () => {
      expect(service.isLocalIp("::1")).toBe(true);
    });

    it("should return true for ::ffff:127.0.0.1 (IPv4-mapped loopback)", () => {
      expect(service.isLocalIp("::ffff:127.0.0.1")).toBe(true);
    });

    it("should return true for same-subnet IP (192.168.1.50)", () => {
      expect(service.isLocalIp("192.168.1.50")).toBe(true);
    });

    it("should return true for IPv4-mapped IPv6 on same subnet", () => {
      expect(service.isLocalIp("::ffff:192.168.1.50")).toBe(true);
    });

    it("should return false for different-subnet IP (10.0.0.5)", () => {
      expect(service.isLocalIp("10.0.0.5")).toBe(false);
    });

    it("should return false for external IP (8.8.8.8)", () => {
      expect(service.isLocalIp("8.8.8.8")).toBe(false);
    });
  });

  describe("ADMIN_SUBNET override", () => {
    it("should use ADMIN_SUBNET env var when set", () => {
      process.env.ADMIN_SUBNET = "10.0.0.0/24";
      const svc = new LanDetectionService();

      expect(svc.isLocalIp("10.0.0.50")).toBe(true);
      expect(svc.isLocalIp("192.168.1.50")).toBe(false);
    });
  });

  describe("getClientIp", () => {
    it("should return request.ip by default", () => {
      const request = { ip: "192.168.1.50", headers: {} };
      expect(service.getClientIp(request)).toBe("192.168.1.50");
    });

    it("should ignore x-forwarded-for when TRUST_PROXY is not set", () => {
      const request = {
        ip: "172.17.0.1",
        headers: { "x-forwarded-for": "192.168.1.50" },
      };
      expect(service.getClientIp(request)).toBe("172.17.0.1");
    });

    it("should use x-forwarded-for when TRUST_PROXY is true", () => {
      process.env.TRUST_PROXY = "true";
      const request = {
        ip: "172.17.0.1",
        headers: { "x-forwarded-for": "192.168.1.50, 10.0.0.1" },
      };
      expect(service.getClientIp(request)).toBe("192.168.1.50");
    });
  });

  describe("isLan", () => {
    it("should return true for LAN request", () => {
      const request = { ip: "192.168.1.50", headers: {} };
      expect(service.isLan(request)).toBe(true);
    });

    it("should return false for non-LAN request", () => {
      const request = { ip: "10.0.0.5", headers: {} };
      expect(service.isLan(request)).toBe(false);
    });
  });
});
