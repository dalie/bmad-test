import { Module, OnModuleInit, Logger } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { ScannerService } from "./scanner.service";
import { ProbeService } from "./probe.service";
import { LibraryService } from "./library.service";
import { LibraryController } from "./library.controller";
import { FilenameParserService } from "./filename-parser.service";
import { TmdbService } from "./tmdb.service";

@Module({
  imports: [DatabaseModule],
  controllers: [LibraryController],
  providers: [
    ScannerService,
    ProbeService,
    LibraryService,
    FilenameParserService,
    TmdbService,
  ],
  exports: [
    ScannerService,
    ProbeService,
    LibraryService,
    FilenameParserService,
    TmdbService,
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
