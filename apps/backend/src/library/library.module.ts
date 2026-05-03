import { Module, OnModuleInit, Logger } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { ScannerService } from "./scanner.service";
import { ProbeService } from "./probe.service";
import { LibraryService } from "./library.service";
import { LibraryController } from "./library.controller";
import { TmdbController } from "./tmdb.controller";
import { FilenameParserService } from "./filename-parser.service";
import { MatchingService } from "./matching.service";
import { TmdbService } from "./tmdb.service";
import { WatcherService } from "./watcher.service";
import { ClassificationService } from "./classification.service";
import { TranscodeService } from "./transcode.service";
import { SubtitleService } from "./subtitle.service";
import { PipelineService } from "./pipeline.service";
import { PipelineController } from "./pipeline.controller";
import { BrowseService } from "./browse.service";
import { BrowseController } from "./browse.controller";

@Module({
  imports: [DatabaseModule],
  controllers: [LibraryController, TmdbController, PipelineController, BrowseController],
  providers: [
    ScannerService,
    ProbeService,
    LibraryService,
    FilenameParserService,
    TmdbService,
    MatchingService,
    WatcherService,
    ClassificationService,
    TranscodeService,
    SubtitleService,
    PipelineService,
    BrowseService,
  ],
  exports: [
    ScannerService,
    ProbeService,
    LibraryService,
    FilenameParserService,
    TmdbService,
    MatchingService,
    WatcherService,
    ClassificationService,
    TranscodeService,
    SubtitleService,
    PipelineService,
    BrowseService,
  ],
})
export class LibraryModule implements OnModuleInit {
  private readonly logger = new Logger(LibraryModule.name);

  constructor(private readonly libraryService: LibraryService) {}

  onModuleInit() {
    this.logger.log("Triggering startup library scan");
    this.libraryService.startScan(true);
  }
}
