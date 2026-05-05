import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { LanDetectionService } from "./lan-detection.service";
import { LanGuard } from "./lan.guard";

@Controller("admin")
export class AccessController {
  constructor(private readonly lanDetection: LanDetectionService) {}

  @Get("access")
  checkAccess(@Req() request: any): { admin: boolean } {
    return { admin: this.lanDetection.isLan(request) };
  }
}

@Controller("admin")
@UseGuards(LanGuard)
export class AdminController {
  @Get("stats")
  getStats(): Record<string, never> {
    return {};
  }
}
