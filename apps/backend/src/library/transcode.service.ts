import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { execFile } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";
import { DatabaseService } from "../database/database.service";

const execFileAsync = promisify(execFile);

@Injectable()
export class TranscodeService {
  private readonly logger = new Logger(TranscodeService.name);
  private transcoding = false;

  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  async executeAudioSidecarQueue(): Promise<void> {
    if (this.transcoding) {
      this.logger.log("Transcode already in progress, skipping");
      return;
    }
    this.transcoding = true;
    try {
      const db = this.database.getDatabase();

      // Crash recovery: reset stuck 'processing' jobs back to 'queued'
      db.prepare(
        "UPDATE transcode_jobs SET status = 'queued', updated_at = datetime('now') WHERE status = 'processing'",
      ).run();

      const jobs = db
        .prepare(
          `SELECT tj.id, tj.file_id, mf.path as file_path
           FROM transcode_jobs tj
           JOIN media_files mf ON mf.id = tj.file_id
           WHERE tj.tier = 2 AND tj.status = 'queued'
           ORDER BY tj.created_at ASC`,
        )
        .all() as { id: number; file_id: number; file_path: string }[];

      this.logger.log(
        `Processing ${jobs.length} queued Tier 2 audio sidecar jobs`,
      );

      for (const job of jobs) {
        try {
          await this.processAudioSidecar(job);
        } catch (err: unknown) {
          this.logger.error(
            `Audio sidecar queue error for job ${job.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    } finally {
      this.transcoding = false;
    }
  }

  async processAudioSidecar(job: {
    id: number;
    file_id: number;
    file_path: string;
  }): Promise<void> {
    const cachePath = this.config.get<string>("CACHE_PATH") || "/mnt/cache";
    const outputDir = path.join(cachePath, "sidecars");
    const outputPath = path.join(outputDir, `${job.file_id}.m4a`);

    const db = this.database.getDatabase();
    db.prepare(
      "UPDATE transcode_jobs SET status = 'processing', updated_at = datetime('now') WHERE id = ?",
    ).run(job.id);

    try {
      fs.mkdirSync(outputDir, { recursive: true });
      await this.runFfmpegAudioExtract(job.file_path, outputPath);

      const completeTx = db.transaction(() => {
        db.prepare(
          "UPDATE transcode_jobs SET status = 'completed', output_path = ?, updated_at = datetime('now') WHERE id = ?",
        ).run(outputPath, job.id);
        db.prepare(
          "UPDATE media_files SET status = 'ready', updated_at = datetime('now') WHERE id = ?",
        ).run(job.file_id);
      });
      completeTx();

      this.logger.log(
        `Audio sidecar generated for file_id ${job.file_id}: ${outputPath}`,
      );
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : String(err);
      db.prepare(
        "UPDATE transcode_jobs SET status = 'failed', error_details = ?, updated_at = datetime('now') WHERE id = ?",
      ).run(errorMessage, job.id);
      this.logger.error(
        `Audio sidecar failed for file_id ${job.file_id}: ${errorMessage}`,
      );
      throw err; // rethrow so the outer loop can catch and continue to next job
    }
  }

  private async runFfmpegAudioExtract(
    inputPath: string,
    outputPath: string,
  ): Promise<void> {
    await execFileAsync("ffmpeg", [
      "-v",
      "warning", // show warnings so stream/encoding issues surface in logs
      "-i",
      inputPath,
      "-vn", // no video in output
      "-map",
      "0:a:0", // primary audio stream only
      "-c:a",
      "aac", // built-in FFmpeg AAC encoder (NOT libfdk_aac)
      "-b:a",
      "192k", // 192 kbps bitrate
      "-ac",
      "2", // downmix to stereo for universal browser support
      "-movflags",
      "+faststart", // write moov atom at file start — required for reliable playback
      "-y", // overwrite existing output (idempotent)
      outputPath,
    ]);
  }
}
