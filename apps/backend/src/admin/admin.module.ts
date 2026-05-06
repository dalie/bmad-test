import { Module } from "@nestjs/common";
import { AdminJobsService } from "./admin-jobs.service";
import { AdminStatsService } from "./admin-stats.service";
import { AccessController, AdminController } from "./admin.controller";
import { LanDetectionService } from "./lan-detection.service";
import { LanGuard } from "./lan.guard";
import { DatabaseModule } from "../database/database.module";
import { LibraryModule } from "../library/library.module";

@Module({
  imports: [DatabaseModule, LibraryModule],
  controllers: [AccessController, AdminController],
  providers: [
    LanDetectionService,
    LanGuard,
    AdminStatsService,
    AdminJobsService,
  ],
  exports: [LanDetectionService],
})
export class AdminModule {}
