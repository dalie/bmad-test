import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { LanDetectionService } from "./lan-detection.service";

@Injectable()
export class LanGuard implements CanActivate {
  constructor(private readonly lanDetection: LanDetectionService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    if (!this.lanDetection.isLan(request)) {
      throw new ForbiddenException("Admin access is restricted to LAN clients");
    }
    return true;
  }
}
