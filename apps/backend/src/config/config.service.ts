import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService as NestConfigService } from "@nestjs/config";
import { DatabaseService } from "../database/database.service";

export interface MediaSource {
  path: string;
  type: "movies" | "tv";
}

@Injectable()
export class ConfigService implements OnModuleInit {
  private readonly logger = new Logger(ConfigService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly config: NestConfigService,
  ) {}

  onModuleInit() {
    this.seedMediaSources();
  }

  getSources(): MediaSource[] {
    try {
      const db = this.databaseService.getDatabase();
      const stmt = db.prepare("SELECT path, type FROM media_sources");
      return stmt.all() as MediaSource[];
    } catch (e) {
      this.logger.error("Error retrieving media sources", e);
      return [];
    }
  }

  private seedMediaSources() {
    const moviesPath = this.config.get<string>("MEDIA_MOVIES_PATH")?.trim();
    const tvPath = this.config.get<string>("MEDIA_TV_PATH")?.trim();

    if (!moviesPath) {
      this.logger.warn("MEDIA_MOVIES_PATH not set — skipping movies source");
    }
    if (!tvPath) {
      this.logger.warn("MEDIA_TV_PATH not set — skipping tv source");
    }

    try {
      const db = this.databaseService.getDatabase();
      const upsert = db.prepare(`
        INSERT INTO media_sources (path, type)
        VALUES (?, ?)
        ON CONFLICT(path) DO UPDATE SET type = excluded.type
      `);

      const insertSources = db.transaction((sources: MediaSource[]) => {
        for (const source of sources) {
          upsert.run(source.path, source.type);
        }
      });

      const sources: MediaSource[] = [];
      if (moviesPath) sources.push({ path: moviesPath, type: "movies" });
      if (tvPath) sources.push({ path: tvPath, type: "tv" });

      if (sources.length > 0) {
        insertSources(sources);
        this.logger.log(`Seeded ${sources.length} media source(s)`);
      }
    } catch (e) {
      this.logger.error("Failed to seed media sources", e);
    }
  }
}
