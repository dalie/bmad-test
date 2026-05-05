import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  ParseIntPipe,
  Query,
  Req,
  Res,
  StreamableFile,
  NotFoundException,
} from "@nestjs/common";
import { Request, Response } from "express";
import * as fs from "fs";
import { MediaService } from "./media.service";

@Controller("media")
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Get("stream/:fileId")
  streamVideo(
    @Param("fileId", ParseIntPipe) fileId: number,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): StreamableFile {
    const fileInfo = this.mediaService.getFileInfo(fileId);
    return this.streamFile(fileInfo.path, fileInfo.contentType, req, res);
  }

  @Get("stream/:fileId/audio")
  streamAudio(
    @Param("fileId", ParseIntPipe) fileId: number,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Query("trackIndex") trackIndexStr?: string,
  ): StreamableFile {
    const trackIndex =
      trackIndexStr !== undefined ? parseInt(trackIndexStr, 10) : 0;
    if (isNaN(trackIndex) || trackIndex < 0) {
      throw new HttpException("Invalid trackIndex", HttpStatus.BAD_REQUEST);
    }
    const sidecarPath = this.mediaService.getAudioSidecarPath(
      fileId,
      trackIndex,
    );
    return this.streamFile(sidecarPath, "audio/aac", req, res);
  }

  @Get("subtitles/:subtitleId")
  streamSubtitle(
    @Param("subtitleId", ParseIntPipe) subtitleId: number,
    @Res({ passthrough: true }) res: Response,
  ): StreamableFile {
    const subtitleInfo = this.mediaService.getSubtitleInfo(subtitleId);
    const stat = this.statFileOrThrow(subtitleInfo.webvttPath);
    res.set({
      "Content-Type": "text/vtt",
      "Content-Length": stat.size,
    });
    const stream = fs.createReadStream(subtitleInfo.webvttPath);
    return new StreamableFile(stream);
  }

  @Get(":fileId/subtitles")
  getSubtitlesForFile(
    @Param("fileId", ParseIntPipe) fileId: number,
  ): Array<{ id: number; language: string | null }> {
    return this.mediaService.getSubtitlesForFile(fileId);
  }

  @Get(":fileId/audio-tracks")
  getAudioTracksForFile(
    @Param("fileId", ParseIntPipe) fileId: number,
  ): Array<{ index: number; language: string | null; codec: string; channels: number }> {
    return this.mediaService.getAudioTracksForFile(fileId);
  }

  private streamFile(
    filePath: string,
    contentType: string,
    req: Request,
    res: Response,
  ): StreamableFile {
    const stat = this.statFileOrThrow(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (
        isNaN(start) ||
        isNaN(end) ||
        start >= fileSize ||
        end >= fileSize ||
        start > end ||
        start < 0
      ) {
        res.status(416).set({
          "Content-Range": `bytes */${fileSize}`,
        });
        throw new HttpException(
          "Range Not Satisfiable",
          HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE,
        );
      }

      const chunkSize = end - start + 1;
      res.status(206).set({
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": contentType,
      });

      const stream = fs.createReadStream(filePath, { start, end });
      return new StreamableFile(stream);
    }

    res.set({
      "Content-Length": fileSize,
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
    });

    const stream = fs.createReadStream(filePath);
    return new StreamableFile(stream);
  }

  private statFileOrThrow(filePath: string): fs.Stats {
    try {
      return fs.statSync(filePath);
    } catch {
      throw new NotFoundException("Media file not found");
    }
  }
}
