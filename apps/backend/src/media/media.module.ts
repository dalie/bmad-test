import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { MediaController } from "./media.controller";
import { MediaService } from "./media.service";

@Module({
  imports: [DatabaseModule],
  controllers: [MediaController],
  providers: [MediaService],
})
export class MediaModule {}
