import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import { DatabaseService } from "../database/database.service";
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
}
