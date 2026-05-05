import { Module } from "@nestjs/common";
import { AccessController, AdminController } from "./admin.controller";
import { LanDetectionService } from "./lan-detection.service";
import { LanGuard } from "./lan.guard";

@Module({
  controllers: [AccessController, AdminController],
  providers: [LanDetectionService, LanGuard],
  exports: [LanDetectionService],
})
export class AdminModule {}
