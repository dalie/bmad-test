import { Injectable, Logger } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { ProbeResult } from "./probe.service";

const WEB_COMPATIBLE_VIDEO_CODECS = new Set([
  "h264",
  "h265",
  "hevc",
  "vp8",
  "vp9",
  "av1",
  "theora",
]);
const WEB_COMPATIBLE_AUDIO_CODECS = new Set(["aac", "opus", "mp3", "vorbis"]);

@Injectable()
export class ClassificationService {
  private readonly logger = new Logger(ClassificationService.name);
  private classifying = false;

  constructor(private readonly database: DatabaseService) {}

  async executeClassification(): Promise<void> {
    if (this.classifying) {
      this.logger.log("Classification already in progress, skipping");
      return;
    }
    this.classifying = true;
    try {
      const db = this.database.getDatabase();
      const files = db
        .prepare(
          "SELECT id, filename, probe_data FROM media_files WHERE status = 'matched'",
        )
        .all() as { id: number; filename: string; probe_data: string | null }[];
      this.logger.log(`Classifying ${files.length} matched files`);
      for (const file of files) {
        try {
          this.classifyFile(file);
        } catch (err: any) {
          this.logger.error(
            `Classification failed for ${file.filename}: ${err.message}`,
          );
        }
      }
    } finally {
      this.classifying = false;
    }
  }

  classifyFile(file: {
    id: number;
    filename: string;
    probe_data: string | null;
  }): void {
    if (!file.probe_data) {
      this.logger.warn(
        `No probe_data for file ${file.filename}, skipping classification`,
      );
      return;
    }

    let probe: ProbeResult;
    try {
      probe = JSON.parse(file.probe_data) as ProbeResult;
    } catch (err: any) {
      this.logger.error(
        `Failed to parse probe_data for ${file.filename}: ${err.message}`,
      );
      return;
    }

    const tier = this.determineTier(probe);
    const db = this.database.getDatabase();

    const classifyTx = db.transaction(() => {
      db.prepare(
        "UPDATE media_files SET tier = ?, status = 'classified', updated_at = datetime('now') WHERE id = ?",
      ).run(tier, file.id);

      if (tier === 2 || tier === 3) {
        db.prepare(
          "INSERT OR IGNORE INTO transcode_jobs (file_id, tier, status) VALUES (?, ?, 'queued')",
        ).run(file.id, tier);
      }
    });

    classifyTx();
    this.logger.log(`Classified ${file.filename} → Tier ${tier}`);
  }

  private determineTier(probe: ProbeResult): 1 | 2 | 3 {
    if (!probe.video) return 3;
    if (!probe.video.codec) return 3;

    if (!WEB_COMPATIBLE_VIDEO_CODECS.has(probe.video.codec.toLowerCase()))
      return 3;

    if (!probe.audioTracks) return 3;

    const allAudioCompatible = probe.audioTracks.every((track) =>
      WEB_COMPATIBLE_AUDIO_CODECS.has((track.codec ?? "").toLowerCase()),
    );

    return allAudioCompatible ? 1 : 2;
  }
}
