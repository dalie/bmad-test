import { Test, TestingModule } from "@nestjs/testing";
import { PipelineController } from "./pipeline.controller";
import { PipelineService, PipelineStatus, PipelineJob } from "./pipeline.service";

describe("PipelineController", () => {
  let controller: PipelineController;
  let pipelineService: jest.Mocked<Pick<PipelineService, "getStatus" | "getJobs">>;

  beforeEach(async () => {
    pipelineService = {
      getStatus: jest.fn(),
      getJobs: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PipelineController],
      providers: [
        {
          provide: PipelineService,
          useValue: pipelineService,
        },
      ],
    }).compile();

    controller = module.get<PipelineController>(PipelineController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  describe("GET /pipeline/status", () => {
    it("should return the result of pipelineService.getStatus()", () => {
      const mockStatus: PipelineStatus = {
        queued: 3,
        processing: 1,
        completed: 10,
        failed: 2,
      };
      pipelineService.getStatus.mockReturnValue(mockStatus);

      const result = controller.getStatus();

      expect(result).toEqual(mockStatus);
      expect(pipelineService.getStatus).toHaveBeenCalledTimes(1);
    });
  });

  describe("GET /pipeline/jobs", () => {
    it("should return the result of pipelineService.getJobs()", () => {
      const mockJobs: PipelineJob[] = [
        {
          id: 1,
          file_id: 42,
          filename: "movie.mkv",
          tier: 2,
          status: "queued",
          output_path: null,
          error_details: null,
          created_at: "2026-05-03T12:00:00",
          updated_at: "2026-05-03T12:00:00",
        },
      ];
      pipelineService.getJobs.mockReturnValue(mockJobs);

      const result = controller.getJobs();

      expect(result).toEqual(mockJobs);
      expect(pipelineService.getJobs).toHaveBeenCalledTimes(1);
    });

    it("should return empty array when there are no jobs", () => {
      pipelineService.getJobs.mockReturnValue([]);

      const result = controller.getJobs();

      expect(result).toEqual([]);
      expect(pipelineService.getJobs).toHaveBeenCalledTimes(1);
    });
  });
});
