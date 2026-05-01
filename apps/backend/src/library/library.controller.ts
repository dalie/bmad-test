import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Body,
  HttpCode,
  ParseIntPipe,
  DefaultValuePipe,
} from "@nestjs/common";
import { LibraryService } from "./library.service";

@Controller("api/library")
export class LibraryController {
  constructor(private readonly libraryService: LibraryService) {}

  @Post("scan")
  @HttpCode(202)
  triggerScan(@Body() body: { full?: boolean }) {
    const scanId = this.libraryService.startScan(body?.full);
    return { scanId, status: "in_progress" };
  }

  @Get("scan/:scanId")
  getScanStatus(@Param("scanId") scanId: string) {
    const record = this.libraryService.getScanStatus(scanId);
    if (!record) {
      return { status: "not_found" };
    }
    return record;
  }

  @Get("files")
  getFiles(
    @Query("offset", new DefaultValuePipe(0), ParseIntPipe) offset: number,
    @Query("limit", new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.libraryService.getFiles(offset, limit);
  }
}
