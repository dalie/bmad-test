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
  NotFoundException,
  ConflictException,
  BadRequestException,
  UnprocessableEntityException,
  ServiceUnavailableException,
  BadGatewayException,
} from "@nestjs/common";
import { LibraryService } from "./library.service";
import { WatcherService } from "./watcher.service";
import { TmdbUnavailableError, TmdbClientError } from "./tmdb.service";

@Controller("library")
export class LibraryController {
  constructor(
    private readonly libraryService: LibraryService,
    private readonly watcherService: WatcherService,
  ) {}

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

  @Get("unmatched")
  getUnmatchedFiles(
    @Query("offset", new DefaultValuePipe(0), ParseIntPipe) offset: number,
    @Query("limit", new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    if (offset < 0 || limit < 1) {
      throw new BadRequestException(
        "offset must be >= 0 and limit must be >= 1",
      );
    }
    return this.libraryService.getUnmatchedFiles(offset, limit);
  }

  @Get("files/:id")
  getFile(@Param("id", ParseIntPipe) id: number) {
    const result = this.libraryService.getFile(id);
    if (!result) {
      throw new NotFoundException(`File with id ${id} not found`);
    }
    return result;
  }

  @Post("files/:id/match")
  async manualMatch(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: { tmdbId: number },
  ) {
    if (!body?.tmdbId || !Number.isInteger(body.tmdbId) || body.tmdbId <= 0) {
      throw new BadRequestException("tmdbId must be a positive integer");
    }

    try {
      return await this.libraryService.manualMatch(id, body.tmdbId);
    } catch (err: any) {
      if (err.message === "FILE_NOT_FOUND") {
        throw new NotFoundException(`File with id ${id} not found`);
      }
      if (err.message === "FILE_ALREADY_MATCHED") {
        throw new ConflictException(`File with id ${id} is already matched`);
      }
      if (err.message === "FILE_NOT_ELIGIBLE") {
        throw new UnprocessableEntityException(
          `File with id ${id} is not eligible for manual match`,
        );
      }
      if (err.message === "SOURCE_NOT_FOUND") {
        throw new NotFoundException(
          `Media source for file with id ${id} not found`,
        );
      }
      if (err instanceof TmdbUnavailableError) {
        throw new ServiceUnavailableException(err.message);
      }
      if (err instanceof TmdbClientError) {
        if (err.message.includes("404")) {
          throw new BadRequestException(
            `TMDB ID not found: no movie or show with that ID exists`,
          );
        }
        throw new BadGatewayException(err.message);
      }
      throw err;
    }
  }

  @Get("watcher/status")
  getWatcherStatus() {
    return this.watcherService.getStatus();
  }
}
