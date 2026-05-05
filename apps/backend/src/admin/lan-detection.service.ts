import { Injectable, Logger } from "@nestjs/common";
import * as os from "os";

@Injectable()
export class LanDetectionService {
  private readonly logger = new Logger(LanDetectionService.name);
  private readonly subnets: string[];

  constructor() {
    const adminSubnet = process.env.ADMIN_SUBNET;
    if (adminSubnet) {
      this.subnets = this.parseAdminSubnet(adminSubnet);
    } else {
      this.subnets = this.discoverSubnets();
    }
  }

  isLan(request: any): boolean {
    const clientIp = this.getClientIp(request);
    return this.isLocalIp(clientIp);
  }

  isLocalIp(ip: string): boolean {
    if (this.isLoopback(ip)) {
      return true;
    }

    const normalized = this.normalizeIp(ip);
    return this.subnets.some((cidr) => this.isOnSubnet(normalized, cidr));
  }

  getClientIp(request: any): string {
    if (process.env.TRUST_PROXY === "true") {
      const forwarded = request.headers?.["x-forwarded-for"];
      if (forwarded) {
        return (typeof forwarded === "string" ? forwarded : forwarded[0])
          .split(",")[0]
          .trim();
      }
    }
    return request.ip || request.connection?.remoteAddress || "";
  }

  private isLoopback(ip: string): boolean {
    const normalized = this.normalizeIp(ip);
    return normalized === "127.0.0.1" || ip === "::1";
  }

  private normalizeIp(ip: string): string {
    if (ip.startsWith("::ffff:")) {
      return ip.slice(7);
    }
    return ip;
  }

  private parseAdminSubnet(value: string): string[] {
    const entries = value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const valid: string[] = [];
    for (const entry of entries) {
      if (!entry.includes("/")) {
        this.logger.warn(
          `ADMIN_SUBNET entry "${entry}" is missing CIDR prefix (e.g. /24) — skipped`,
        );
        continue;
      }
      const [, prefixStr] = entry.split("/");
      const prefix = parseInt(prefixStr, 10);
      if (isNaN(prefix) || prefix < 0 || prefix > 32) {
        this.logger.warn(
          `ADMIN_SUBNET entry "${entry}" has invalid prefix — skipped`,
        );
        continue;
      }
      valid.push(entry);
    }
    if (valid.length === 0) {
      this.logger.error(
        "ADMIN_SUBNET is set but contains no valid CIDRs — falling back to auto-discovery",
      );
      return this.discoverSubnets();
    }
    return valid;
  }

  private discoverSubnets(): string[] {
    const interfaces = os.networkInterfaces();
    const subnets: string[] = [];

    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (!iface.internal && iface.family === "IPv4" && iface.cidr) {
          subnets.push(iface.cidr);
        }
      }
    }

    return subnets;
  }

  private isOnSubnet(clientIp: string, networkCidr: string): boolean {
    const [networkIp, prefixStr] = networkCidr.split("/");
    const prefix = parseInt(prefixStr, 10);
    if (isNaN(prefix)) {
      return false;
    }
    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    return (this.ipToInt(clientIp) & mask) === (this.ipToInt(networkIp) & mask);
  }

  private ipToInt(ip: string): number {
    return (
      ip
        .split(".")
        .reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0
    );
  }
}
