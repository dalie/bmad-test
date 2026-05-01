import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { DatabaseService } from "../database/database.service";
import { ProbeService, ProbeResult } from "./probe.service";
import { ScannerService, ScannedFile } from "./scanner.service";

export interface ScanRecord {
  id: string;
  status: "in_progress" | "completed" | "failed";
  startedAt: string;
  completedAt: string | null;
  discovered: number;
  processed: number;
  failed: number;
  errors: string[];
}

@Injectable()
export class LibraryService {
  private readonly logger = new Logger(LibraryService.name);
  private readonly scans = new Map<string, ScanRecord>();

  constructor(
    private readonly db: DatabaseService,
    private readonly scanner: ScannerService,
    private readonly probeService: ProbeService,
  ) {}

  startScan(full?: boolean): string {
    const scanId = randomUUID();
    const record: ScanRecord = {
      id: scanId,
      status: "in_progress",
      startedAt: new Date().toISOString(),
      completedAt: null,
      discovered: 0,
      processed: 0,
      failed: 0,
      errors: [],
    };
    this.scans.set(scanId, record);

    // Run scan asynchronously
    this.executeScan(scanId).catch((err) => {
      this.logger.error(`Scan ${scanId} failed: ${err.message}`);
      const rec = this.scans.get(scanId);
      if (rec) {
        rec.status = "failed";
        rec.completedAt = new Date().toISOString();
        rec.errors.push(err.message);
      }
    });

    return scanId;
  }

  getScanStatus(scanId: string): ScanRecord | undefined {
    return this.scans.get(scanId);
  }

  getFiles(
    offset: number,
    limit: number,
  ): { items: any[]; total: number; offset: number; limit: number } {
    const db = this.db.getDatabase();
    const countStmt = db.prepare("SELECT COUNT(*) as total FROM media_files");
    const { total } = countStmt.get() as { total: number };
    const filesStmt = db.prepare(
      "SELECT * FROM media_files ORDER BY id LIMIT ? OFFSET ?",
    );
    const items = filesStmt.all(limit, offset);
    return { items, total, offset, limit };
  }

  private async executeScan(scanId: string): Promise<void> {
    const db = this.db.getDatabase();
    const record = this.scans.get(scanId)!;

    const sourcesStmt = db.prepare("SELECT * FROM media_sources");
    const sources = sourcesStmt.all() as any[];

    for (const source of sources) {
      try {
        const files = await this.scanner.scanDirectory(source.path);
        record.discovered += files.length;
        this.syncFiles(source.id, files);
        record.processed += files.length;
      } catch (err: any) {
        record.failed++;
        record.errors.push(`Source ${source.path}: ${err.message}`);
      }
    }

    record.status = "completed";
    record.completedAt = new Date().toISOString();

    // Trigger probing of discovered files after scan completes
    this.executeProbing().catch((err) => {
      this.logger.error(`Probing failed: ${err.message}`);
    });
  }

  syncFiles(sourceId: number, scannedFiles: ScannedFile[]) {
    const db = this.db.getDatabase();

    const tx = db.transaction(() => {
      const getFilesStmt = db.prepare(
        "SELECT * FROM media_files WHERE source_id = ?",
      );
      const existingFiles = getFilesStmt.all(sourceId) as any[];
      const existingFileMap = new Map(existingFiles.map((f) => [f.path, f]));

      const insertStmt = db.prepare(`
                INSERT OR IGNORE INTO media_files (path, filename, source_id, status, size, mtime)
                VALUES (?, ?, ?, 'discovered', ?, ?)
            `);

      const flagModifiedStmt = db.prepare(`
                UPDATE media_files
                SET status = 'discovered', size = ?, mtime = ?, updated_at = datetime('now')
                WHERE id = ?
            `);

      const markMissingStmt = db.prepare(`
                UPDATE media_files
                SET status = 'missing', updated_at = datetime('now')
                WHERE id = ? AND status != 'missing'
            `);

      for (const scanned of scannedFiles) {
        const existing = existingFileMap.get(scanned.path);
        if (existing) {
          existingFileMap.delete(scanned.path);

          // Check if file was modified (size or mtime changed)
          const newSize = scanned.stats.size;
          const newMtime = scanned.stats.mtimeMs;
          if (existing.size !== newSize || existing.mtime !== newMtime) {
            flagModifiedStmt.run(newSize, newMtime, existing.id);
          }
        } else {
          insertStmt.run(
            scanned.path,
            scanned.filename,
            sourceId,
            scanned.stats.size,
            scanned.stats.mtimeMs,
          );
        }
      }

      // Any file left in existingFileMap was not seen on disk
      for (const [_, model] of existingFileMap) {
        if (model.status !== "missing") {
          markMissingStmt.run(model.id);
        }
      }
    });

    tx();
  }

  async executeProbing(): Promise<void> {
    const db = this.db.getDatabase();
    const stmt = db.prepare(
      "SELECT * FROM media_files WHERE status = 'discovered'",
    );
    const files = stmt.all() as any[];

    this.logger.log(`Probing ${files.length} discovered files`);

    for (const file of files) {
      await this.probeAndStore(file);
    }
  }

  private async probeAndStore(file: any): Promise<void> {
    const db = this.db.getDatabase();

    try {
      const result = await this.probeService.probeFile(file.path);

      const updateStmt = db.prepare(
        "UPDATE media_files SET probe_data = ?, status = 'probed', updated_at = datetime('now') WHERE id = ?",
      );
      updateStmt.run(JSON.stringify(result), file.id);

      // Catalog embedded subtitles
      this.insertEmbeddedSubtitles(file.id, result.subtitleTracks);

      // Detect and catalog sidecar subtitles
      await this.detectSidecarSubtitles(file.id, file.path);

      this.logger.log(`Probed successfully: ${file.filename}`);
    } catch (err: any) {
      const updateStmt = db.prepare(
        "UPDATE media_files SET status = 'probe_failed', updated_at = datetime('now') WHERE id = ?",
      );
      updateStmt.run(file.id);

      const errorStmt = db.prepare(
        "INSERT INTO scan_errors (file_path, error_type, error_message) VALUES (?, ?, ?)",
      );
      errorStmt.run(file.path, "PROBE_FAILED", err.message);

      this.logger.error(`Probe failed for ${file.filename}: ${err.message}`);
    }
  }

  private insertEmbeddedSubtitles(
    mediaFileId: number,
    subtitleTracks: ProbeResult["subtitleTracks"],
  ): void {
    const db = this.db.getDatabase();
    const insertStmt = db.prepare(
      "INSERT INTO subtitles (media_file_id, track_index, type, language, codec) VALUES (?, ?, 'embedded', ?, ?)",
    );

    for (const track of subtitleTracks) {
      insertStmt.run(
        mediaFileId,
        track.index,
        track.language || null,
        track.codec || null,
      );
    }
  }

  async detectSidecarSubtitles(
    mediaFileId: number,
    filePath: string,
  ): Promise<void> {
    const db = this.db.getDatabase();
    const dir = path.dirname(filePath);
    const baseName = path.basename(filePath, path.extname(filePath));
    const subtitleExtensions = new Set([".srt", ".ass", ".sub"]);

    let entries: string[];
    try {
      entries = await fs.promises.readdir(dir);
    } catch {
      return;
    }

    const insertStmt = db.prepare(
      "INSERT INTO subtitles (media_file_id, track_index, type, language, codec, sidecar_path) VALUES (?, NULL, 'sidecar', ?, ?, ?)",
    );

    for (const entry of entries) {
      const ext = path.extname(entry).toLowerCase();
      if (!subtitleExtensions.has(ext)) continue;
      if (!entry.startsWith(baseName)) continue;
      // Skip if it's an exact match without any extension difference
      if (entry === path.basename(filePath)) continue;

      const fullSubPath = path.join(dir, entry);
      const language = this.extractLanguageFromFilename(entry, baseName, ext);
      const codec = ext.slice(1); // "srt", "ass", "sub"

      insertStmt.run(language || null, codec, fullSubPath);
    }
  }

  private extractLanguageFromFilename(
    filename: string,
    baseName: string,
    ext: string,
  ): string | undefined {
    // Pattern: "Movie.Name.2024.en.srt" → language = "en"
    const withoutExt = filename.slice(0, -ext.length);
    const suffix = withoutExt.slice(baseName.length);
    // suffix would be ".en" or empty
    if (suffix.startsWith(".") && suffix.length > 1) {
      return suffix.slice(1);
    }
    return undefined;
  }

  getFile(id: number): { file: any; subtitles: any[] } | null {
    const db = this.db.getDatabase();
    const fileStmt = db.prepare("SELECT * FROM media_files WHERE id = ?");
    const file = fileStmt.get(id) as any;
    if (!file) return null;

    const subtitlesStmt = db.prepare(
      "SELECT * FROM subtitles WHERE media_file_id = ?",
    );
    const subtitles = subtitlesStmt.all(id) as any[];
    return { file, subtitles };
  }
}
