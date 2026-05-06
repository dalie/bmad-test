import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import { DatabaseService } from "../database/database.service";
import { LibraryService } from "./library.service";
import { ScannedFile } from "./scanner.service";

@Injectable()
export class WatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WatcherService.name);
  private watchers: fs.FSWatcher[] = [];
  private errors: string[] = [];
  private watching = false;
  private pendingFiles: Map<number, ScannedFile[]> = new Map();
  private debounceTimers: Map<number, NodeJS.Timeout> = new Map();
  private stabilityChecks: Map<string, number> = new Map();

  private readonly videoExtensions = new Set([
    ".mkv",
    ".mp4",
    ".avi",
    ".webm",
    ".mov",
    ".wmv",
    ".flv",
  ]);
  private readonly DEBOUNCE_MS = 3000;
  private readonly STABILITY_INTERVAL_MS = 2000;
  private readonly MAX_STABILITY_RETRIES = 30;

  private sources: { id: number; path: string; type: string }[] = [];

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly libraryService: LibraryService,
  ) {}

  onModuleInit() {
    this.startWatching();
  }

  onModuleDestroy() {
    this.stopWatching();
  }

  startWatching() {
    try {
      this.loadSources();
    } catch (err: any) {
      const msg = `Failed to load media sources: ${err.message}`;
      this.logger.error(msg);
      this.errors.push(msg);
      return;
    }

    for (const source of this.sources) {
      try {
        const watcher = fs.watch(
          source.path,
          { recursive: true },
          (eventType, filename) => {
            if (eventType === "rename" && filename) {
              this.handleRenameEvent(source, filename);
            }
          },
        );

        watcher.on("error", (err) => {
          const msg = `Watcher error on ${source.path}: ${err.message}`;
          this.logger.error(msg);
          if (this.errors.length >= 100) this.errors.shift();
          this.errors.push(msg);
        });

        this.watchers.push(watcher);
        this.logger.log(`Watching: ${source.path}`);
      } catch (err: any) {
        const msg = `Failed to watch ${source.path}: ${err.message}`;
        this.logger.error(msg);
        if (this.errors.length >= 100) this.errors.shift();
        this.errors.push(msg);
      }
    }

    this.watching = this.watchers.length > 0;
  }

  stopWatching() {
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];
    this.watching = false;

    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.pendingFiles.clear();
    this.stabilityChecks.clear();
  }

  getStatus(): { watching: boolean; paths: string[]; errors: string[] } {
    return {
      watching: this.watching,
      paths: this.sources.map((s) => s.path),
      errors: [...this.errors],
    };
  }

  private loadSources() {
    const db = this.databaseService.getDatabase();
    this.sources = db
      .prepare("SELECT id, path, type FROM media_sources")
      .all() as { id: number; path: string; type: string }[];
  }

  private handleRenameEvent(
    source: { id: number; path: string; type: string },
    filename: string,
  ) {
    const ext = path.extname(filename).toLowerCase();
    if (!this.videoExtensions.has(ext)) {
      return;
    }

    const fullPath = path.join(source.path, filename);

    // Prevent duplicate stability checks from rapid events
    if (this.stabilityChecks.has(fullPath)) {
      return;
    }

    // Confirm file exists (rename fires for both creates and deletes)
    fs.promises
      .stat(fullPath)
      .then(() => {
        if (!this.watching) return;
        this.stabilityChecks.set(fullPath, 0);
        this.checkStabilityAndQueue(fullPath, source.id);
      })
      .catch(() => {
        // File was deleted, not created — ignore
      });
  }

  private async checkStabilityAndQueue(
    filePath: string,
    sourceId: number,
  ): Promise<void> {
    if (!this.watching) {
      this.stabilityChecks.delete(filePath);
      return;
    }

    const retries = this.stabilityChecks.get(filePath) || 0;

    try {
      const stat1 = await fs.promises.stat(filePath);
      await new Promise((resolve) =>
        setTimeout(resolve, this.STABILITY_INTERVAL_MS),
      );
      if (!this.watching) {
        this.stabilityChecks.delete(filePath);
        return;
      }
      const stat2 = await fs.promises.stat(filePath);

      if (stat1.size === stat2.size && stat1.mtimeMs === stat2.mtimeMs) {
        // File is stable
        this.stabilityChecks.delete(filePath);
        this.queueStableFile(filePath, stat2, sourceId);
      } else if (retries < this.MAX_STABILITY_RETRIES) {
        // Still being written — retry
        this.stabilityChecks.set(filePath, retries + 1);
        await this.checkStabilityAndQueue(filePath, sourceId);
      } else {
        this.stabilityChecks.delete(filePath);
        this.logger.warn(
          `File never stabilized after ${this.MAX_STABILITY_RETRIES} retries: ${filePath}`,
        );
      }
    } catch (err: any) {
      this.stabilityChecks.delete(filePath);
      this.logger.error(
        `Stability check failed for ${filePath}: ${err.message}`,
      );
    }
  }

  private queueStableFile(filePath: string, stats: fs.Stats, sourceId: number) {
    const pending = this.pendingFiles.get(sourceId) || [];
    pending.push({ path: filePath, filename: path.basename(filePath), stats });
    this.pendingFiles.set(sourceId, pending);

    // Reset debounce timer for this source
    const existing = this.debounceTimers.get(sourceId);
    if (existing) clearTimeout(existing);

    this.debounceTimers.set(
      sourceId,
      setTimeout(() => {
        this.flushPending(sourceId);
      }, this.DEBOUNCE_MS),
    );
  }

  private flushPending(sourceId: number) {
    const files = this.pendingFiles.get(sourceId);
    if (!files || files.length === 0) return;

    this.pendingFiles.delete(sourceId);
    this.debounceTimers.delete(sourceId);

    try {
      this.logger.log(
        `Processing ${files.length} new file(s) from source ${sourceId}`,
      );
      this.libraryService.insertNewFiles(sourceId, files);
      this.libraryService.executeProbing().catch((err) => {
        this.logger.error(`Probing after watch event failed: ${err.message}`);
      });
    } catch (err: any) {
      this.logger.error(
        `Failed to process files from source ${sourceId}: ${err.message}`,
      );
    }
  }
}
