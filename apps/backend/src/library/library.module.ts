import { Module, OnModuleInit, Logger } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { ScannerService } from "./scanner.service";
import { LibraryService } from "./library.service";
import { LibraryController } from "./library.controller";

@Module({
  imports: [DatabaseModule],
  controllers: [LibraryController],
  providers: [ScannerService, LibraryService],
  exports: [ScannerService, LibraryService],
})
export class LibraryModule implements OnModuleInit {
  private readonly logger = new Logger(LibraryModule.name);

  constructor(private readonly libraryService: LibraryService) {}

  onModuleInit() {
    this.logger.log("Triggering startup library scan");
    this.libraryService.startScan(true);
  }
}
