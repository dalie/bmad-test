import { Controller, Get } from "@nestjs/common";
import { ConfigService, MediaSource } from "./config.service";

@Controller("config")
export class ConfigController {
  constructor(private readonly configService: ConfigService) {}

  @Get("sources")
  getSources(): MediaSource[] {
    return this.configService.getSources();
  }
}
