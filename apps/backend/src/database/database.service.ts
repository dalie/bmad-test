import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService as NestConfigService } from "@nestjs/config";
import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private db!: Database.Database;
  private readonly logger = new Logger(DatabaseService.name);

  constructor(private readonly config: NestConfigService) {}

  onModuleInit() {
    const cachePath = this.config.get<string>("CACHE_PATH") || "/mnt/cache";
    let dbPath: string;
    if (cachePath === ":memory:") {
      dbPath = ":memory:";
    } else {
      const resolved = path.isAbsolute(cachePath)
        ? cachePath
        : path.resolve(__dirname, "..", "..", "..", "..", cachePath);
      dbPath = path.join(resolved, "cineplex.db");
    }

    if (dbPath !== ":memory:") {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    }

    this.logger.log(`Opening database at ${dbPath}`);
    this.db = new Database(dbPath);

    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");

    this.runMigrations();
    this.logger.log("Database initialized successfully");
  }

  onModuleDestroy() {
    try {
      this.db?.close();
      this.logger.log("Database connection closed");
    } catch (e) {
      this.logger.error("Error closing database connection", e);
    }
  }

  getDatabase(): Database.Database {
    return this.db;
  }

  private runMigrations() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS media_sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL CHECK (type IN ('movies', 'tv')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS media_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL UNIQUE,
        filename TEXT NOT NULL,
        source_id INTEGER NOT NULL REFERENCES media_sources(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'discovered',
        size INTEGER,
        mtime REAL,
        probe_data TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_media_files_source_id ON media_files(source_id);
      CREATE INDEX IF NOT EXISTS idx_media_files_status ON media_files(status);

      CREATE TABLE IF NOT EXISTS scan_errors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT NOT NULL,
        error_type TEXT NOT NULL,
        error_message TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS subtitles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        media_file_id INTEGER NOT NULL REFERENCES media_files(id) ON DELETE CASCADE,
        track_index INTEGER,
        type TEXT NOT NULL CHECK (type IN ('embedded', 'sidecar')),
        language TEXT,
        codec TEXT,
        sidecar_path TEXT,
        webvtt_path TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_subtitles_media_file_id ON subtitles(media_file_id);

      CREATE TABLE IF NOT EXISTS tmdb_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        image_base_url TEXT NOT NULL,
        last_fetched TEXT NOT NULL DEFAULT (datetime('now'))
      );

    `);
  }
}
