import { Test, TestingModule } from "@nestjs/testing";
import { ConfigController } from "./config.controller";
import { ConfigService } from "./config.service";

describe("ConfigController", () => {
  let controller: ConfigController;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConfigController],
      providers: [
        {
          provide: ConfigService,
          useValue: {
            getSources: jest.fn().mockReturnValue([
              { path: "/mnt/media/movies", type: "movies" },
              { path: "/mnt/media/tv", type: "tv" },
            ]),
          },
        },
      ],
    }).compile();

    controller = module.get<ConfigController>(ConfigController);
    configService = module.get<ConfigService>(ConfigService);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  describe("getSources", () => {
    it("should return array of media sources", () => {
      const result = controller.getSources();
      expect(result).toEqual([
        { path: "/mnt/media/movies", type: "movies" },
        { path: "/mnt/media/tv", type: "tv" },
      ]);
    });

    it("should return objects with path and type properties", () => {
      const result = controller.getSources();
      expect(result).toHaveLength(2);
      for (const source of result) {
        expect(source).toHaveProperty("path");
        expect(source).toHaveProperty("type");
        expect(["movies", "tv"]).toContain(source.type);
      }
    });

    it("should call configService.getSources", () => {
      controller.getSources();
      expect(configService.getSources).toHaveBeenCalled();
    });
  });
});
