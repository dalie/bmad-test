import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { DatabaseService } from '../database/database.service';

const execFileAsync = promisify(execFile);

interface SubtitleRow {
  id: number;
  media_file_id: number;
  track_index: number | null;
  type: 'embedded' | 'sidecar';
  language: string | null;
  codec: string | null;
  sidecar_path: string | null;
  file_path: string;
}

@Injectable()
export class SubtitleService {
  private readonly logger = new Logger(SubtitleService.name);
  private converting = false;

  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  async executeSubtitleConversionQueue(): Promise<void> {
    if (this.converting) {
      this.logger.log('Subtitle conversion already in progress, skipping');
      return;
    }
    this.converting = true;
    try {
      const db = this.database.getDatabase();
      const subtitles = db
        .prepare(
          `SELECT s.id, s.media_file_id, s.track_index, s.type, s.language,
                  s.codec, s.sidecar_path, mf.path as file_path
           FROM subtitles s
           JOIN media_files mf ON mf.id = s.media_file_id
           WHERE s.webvtt_path IS NULL
           ORDER BY s.media_file_id ASC, s.id ASC`,
        )
        .all() as SubtitleRow[];

      this.logger.log(`Processing ${subtitles.length} subtitles pending WebVTT conversion`);

      for (const subtitle of subtitles) {
        try {
          await this.processSubtitleConversion(subtitle);
        } catch (err: unknown) {
          this.logger.error(
            `Subtitle conversion queue error for subtitle_id ${subtitle.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    } finally {
      this.converting = false;
    }
  }

  async processSubtitleConversion(subtitle: SubtitleRow): Promise<void> {
    const cachePath = this.config.get<string>('CACHE_PATH') || '/mnt/cache';
    const outputDir = path.join(cachePath, 'subtitles');
    const outputPath = path.join(outputDir, `${subtitle.id}.vtt`);

    const db = this.database.getDatabase();

    try {
      fs.mkdirSync(outputDir, { recursive: true });
      await this.runFfmpegSubtitleConvert(subtitle, outputPath);

      db.prepare(
        'UPDATE subtitles SET webvtt_path = ? WHERE id = ?',
      ).run(outputPath, subtitle.id);

      this.logger.log(
        `WebVTT conversion completed for subtitle_id ${subtitle.id} (${subtitle.type}, media_file_id=${subtitle.media_file_id}): ${outputPath}`,
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `WebVTT conversion failed for subtitle_id ${subtitle.id}: ${errorMessage}`,
      );
      throw err;
    }
  }

  private async runFfmpegSubtitleConvert(
    subtitle: SubtitleRow,
    outputPath: string,
  ): Promise<void> {
    if (subtitle.type === 'embedded') {
      if (subtitle.track_index === null) {
        throw new Error(`track_index is null for embedded subtitle_id ${subtitle.id}`);
      }
      await execFileAsync('ffmpeg', [
        '-v', 'warning',
        '-i', subtitle.file_path,
        '-map', `0:${subtitle.track_index}`,
        '-c:s', 'webvtt',
        '-y',
        outputPath,
      ]);
    } else {
      if (!subtitle.sidecar_path) {
        throw new Error(`sidecar_path is null for subtitle_id ${subtitle.id}`);
      }
      await execFileAsync('ffmpeg', [
        '-v', 'warning',
        '-i', subtitle.sidecar_path,
        '-c:s', 'webvtt',
        '-y',
        outputPath,
      ]);
    }
  }
}
