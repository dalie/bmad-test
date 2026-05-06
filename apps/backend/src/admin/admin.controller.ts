import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AdminStats, AdminStatsService } from "./admin-stats.service";
import {
  AdminJobsService,
  FailedJobSummary,
  JobDetail,
  PipelineMonitorStatus,
} from "./admin-jobs.service";
import { LanDetectionService } from "./lan-detection.service";
import { LanGuard } from "./lan.guard";
import { LibraryService, ScanRecord } from "../library/library.service";

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
  constructor(
    private readonly adminStatsService: AdminStatsService,
    private readonly adminJobsService: AdminJobsService,
    private readonly libraryService: LibraryService,
  ) {}

  @Get("stats")
  getStats(): AdminStats {
    return this.adminStatsService.getStats();
  }

  @Get("pipeline")
  getPipelineStatus(): PipelineMonitorStatus {
    return this.adminJobsService.getPipelineStatus();
  }

  @Get("jobs")
  getFailedJobs(): FailedJobSummary[] {
    return this.adminJobsService.getFailedJobs();
  }

  @Get("jobs/:id")
  getJobDetails(@Param("id") id: string): JobDetail {
    return this.adminJobsService.getJobDetails(id);
  }

  @Post("jobs/:id/retry")
  retryJob(@Param("id", ParseIntPipe) id: number): { success: boolean } {
    return this.adminJobsService.retryJob(id);
  }

  @Post("rescan")
  triggerRescan(): { scanId: string } {
    const scanId = this.libraryService.startScan(true);
    return { scanId };
  }

  @Get("rescan/:scanId")
  getScanStatus(@Param("scanId") scanId: string): ScanRecord {
    const record = this.libraryService.getScanStatus(scanId);
    if (!record) {
      throw new NotFoundException(`Scan ${scanId} not found`);
    }
    return record;
  }
}
