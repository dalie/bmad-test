import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import * as path from "path";
import { DatabaseService } from "../database/database.service";

export interface MediaFileInfo {
  id: number;
  path: string;
  tier: number;
  contentType: string;
}

export interface SubtitleInfo {
  id: number;
  mediaFileId: number;
  webvttPath: string;
}

const MIME_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mkv": "video/x-matroska",
  ".webm": "video/webm",
  ".avi": "video/x-msvideo",
  ".m4a": "audio/aac",
  ".aac": "audio/aac",
  ".vtt": "text/vtt",
};

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(private readonly database: DatabaseService) {}

  getFileInfo(fileId: number): MediaFileInfo {
    const db = this.database.getDatabase();
    const row = db
      .prepare(
        `SELECT mf.id, mf.path, mf.status, mf.tier,
                tj.output_path AS transcode_output_path, tj.status AS transcode_status
         FROM media_files mf
         LEFT JOIN transcode_jobs tj ON tj.file_id = mf.id
         WHERE mf.id = ?`,
      )
      .get(fileId) as any;

    if (!row) {
      throw new NotFoundException(`Media file not found`);
    }

    const tier = row.tier ?? 1;
    let filePath: string;

    if (tier === 3) {
      if (row.transcode_status !== "completed" || !row.transcode_output_path) {
        throw new NotFoundException(`Media file not ready`);
      }
      filePath = row.transcode_output_path;
    } else if (tier === 2) {
      if (row.status !== "ready") {
        throw new NotFoundException(`Media file not ready`);
      }
      filePath = row.path;
    } else {
      if (row.status !== "ready") {
        throw new NotFoundException(`Media file not ready`);
      }
      filePath = row.path;
    }

    this.validatePath(filePath);

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    return { id: row.id, path: filePath, tier, contentType };
  }

  getAudioSidecarPath(fileId: number): string {
    const db = this.database.getDatabase();
    const row = db
      .prepare(
        `SELECT mf.tier, tj.output_path, tj.status AS transcode_status
         FROM media_files mf
         LEFT JOIN transcode_jobs tj ON tj.file_id = mf.id
         WHERE mf.id = ?`,
      )
      .get(fileId) as any;

    if (!row) {
      throw new NotFoundException(`Media file not found`);
    }

    if (row.tier !== 2) {
      throw new NotFoundException(
        `Audio sidecar only available for Tier 2 files`,
      );
    }

    if (row.transcode_status !== "completed" || !row.output_path) {
      throw new NotFoundException(`Audio sidecar not ready`);
    }

    this.validatePath(row.output_path);
    return row.output_path;
  }

  getSubtitleInfo(subtitleId: number): SubtitleInfo {
    const db = this.database.getDatabase();
    const row = db
      .prepare(
        `SELECT id, media_file_id, webvtt_path
         FROM subtitles
         WHERE id = ? AND webvtt_path IS NOT NULL`,
      )
      .get(subtitleId) as any;

    if (!row) {
      throw new NotFoundException(`Subtitle not found`);
    }

    this.validatePath(row.webvtt_path);

    return {
      id: row.id,
      mediaFileId: row.media_file_id,
      webvttPath: row.webvtt_path,
    };
  }

  getSubtitlesForFile(
    fileId: number,
  ): Array<{ id: number; language: string | null }> {
    const db = this.database.getDatabase();
    const rows = db
      .prepare(
        `SELECT id, language
         FROM subtitles
         WHERE media_file_id = ? AND webvtt_path IS NOT NULL
         ORDER BY id ASC`,
      )
      .all(fileId) as Array<{ id: number; language: string | null }>;
    return rows;
  }

  private validatePath(filePath: string): void {
    if (filePath.includes("..")) {
      throw new NotFoundException(`Media file not found`);
    }
    const resolved = path.resolve(filePath);
    if (resolved !== path.normalize(filePath)) {
      throw new NotFoundException(`Media file not found`);
    }
  }
}
