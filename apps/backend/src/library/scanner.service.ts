import { Injectable, Logger } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import * as fs from "fs";
import * as path from "path";

export interface ScannedFile {
  path: string;
  filename: string;
  stats: fs.Stats;
}

const MAX_RECURSION_DEPTH = 50;

@Injectable()
export class ScannerService {
  private readonly logger = new Logger(ScannerService.name);
  private readonly videoExtensions = new Set([
    ".mkv",
    ".mp4",
    ".avi",
    ".webm",
    ".mov",
    ".wmv",
    ".flv",
  ]);

  constructor(private readonly databaseService: DatabaseService) {}

  private logError(filePath: string, errorType: string, errorMessage: string) {
    try {
      const db = this.databaseService.getDatabase();
      const stmt = db.prepare(
        "INSERT INTO scan_errors (file_path, error_type, error_message) VALUES (?, ?, ?)",
      );
      stmt.run(filePath, errorType, errorMessage);
    } catch (e) {
      this.logger.error(`Failed to log error to database: ${e}`);
    }
  }

  async scanDirectory(dirPath: string, depth = 0): Promise<ScannedFile[]> {
    const results: ScannedFile[] = [];

    if (depth > MAX_RECURSION_DEPTH) {
      this.logger.warn(`Max recursion depth reached at ${dirPath}`);
      this.logError(
        dirPath,
        "MAX_DEPTH",
        `Recursion depth exceeded ${MAX_RECURSION_DEPTH}`,
      );
      return results;
    }

    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    } catch (error: any) {
      this.logger.error(
        `Failed to read directory ${dirPath}: ${error.message}`,
      );
      this.logError(dirPath, "READDIR_ERROR", error.message);
      return results;
    }

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        const subResults = await this.scanDirectory(fullPath, depth + 1);
        for (const item of subResults) {
          results.push(item);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (this.videoExtensions.has(ext)) {
          const isStable = await this.checkFileStability(fullPath);
          if (isStable) {
            try {
              const stats = await fs.promises.stat(fullPath);
              results.push({
                path: fullPath,
                filename: entry.name,
                stats,
              });
            } catch (error: any) {
              this.logError(fullPath, "STAT_ERROR", error.message);
            }
          }
        }
      }
    }

    return results;
  }

  private async checkFileStability(filePath: string): Promise<boolean> {
    try {
      // First we try to open it read-only to ensure we don't violate NFR9
      let fd;
      try {
        fd = await fs.promises.open(filePath, "r");
      } catch (error: any) {
        this.logError(filePath, "ACCESS_ERROR", error.message);
        return false;
      }
      await fd.close();

      const stat1 = await fs.promises.stat(filePath);

      // Wait ~2 seconds to check if file is being written to (NFR16)
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const stat2 = await fs.promises.stat(filePath);

      return stat1.size === stat2.size && stat1.mtimeMs === stat2.mtimeMs;
    } catch (error: any) {
      this.logError(filePath, "STABILITY_CHECK_ERROR", error.message);
      return false;
    }
  }
}
