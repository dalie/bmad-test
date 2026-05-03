import { Controller, Get } from "@nestjs/common";
import { PipelineService, PipelineStatus, PipelineJob } from "./pipeline.service";

@Controller("pipeline")
export class PipelineController {
  constructor(private readonly pipelineService: PipelineService) {}

  @Get("status")
  getStatus(): PipelineStatus {
    return this.pipelineService.getStatus();
  }

  @Get("jobs")
  getJobs(): PipelineJob[] {
    return this.pipelineService.getJobs();
  }
}
