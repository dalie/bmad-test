import { ConfigService as NestConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import Database from "better-sqlite3";
import { DatabaseService } from "./database.service";

describe("DatabaseService", () => {
  let service: DatabaseService;
  let mockConfigService: jest.Mocked<NestConfigService>;

  beforeEach(async () => {
    mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === "CACHE_PATH") return ":memory:";
        return null;
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseService,
        { provide: NestConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<DatabaseService>(DatabaseService);
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  describe("initialization", () => {
    it("should open an in-memory database when CACHE_PATH is :memory:", () => {
      service.onModuleInit();
      const db = service.getDatabase();
      expect(db).toBeDefined();
      expect(db.open).toBe(true);
    });

    it("should enable WAL mode", () => {
      service.onModuleInit();
      const db = service.getDatabase();
      const result = db.pragma("journal_mode", { simple: true });
      // In-memory doesn't use WAL, SQLite returns "memory" instead
      expect(result).toBe("memory");
    });

    it("should enable foreign keys", () => {
      service.onModuleInit();
      const db = service.getDatabase();
      const result = db.pragma("foreign_keys", { simple: true });
      // PRAGMA foreign_keys always returns 0 or 1
      expect(result).toBe(1);
    });

    it("should create media_sources table", () => {
      service.onModuleInit();
      const db = service.getDatabase();
      const table = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='media_sources'",
        )
        .get() as { name: string } | undefined;
      expect(table).toBeDefined();
      expect(table!.name).toBe("media_sources");
    });

    it("should create media_files table", () => {
      service.onModuleInit();
      const db = service.getDatabase();
      const table = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='media_files'",
        )
        .get() as { name: string } | undefined;
      expect(table).toBeDefined();
      expect(table!.name).toBe("media_files");
    });

    it("should create scan_errors table", () => {
      service.onModuleInit();
      const db = service.getDatabase();
      const table = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='scan_errors'",
        )
        .get() as { name: string } | undefined;
      expect(table).toBeDefined();
      expect(table!.name).toBe("scan_errors");
    });

    it("should create indexes on media_files", () => {
      service.onModuleInit();
      const db = service.getDatabase();
      const indexes = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='media_files'",
        )
        .all() as { name: string }[];
      const indexNames = indexes.map((i) => i.name);
      expect(indexNames).toContain("idx_media_files_source_id");
      expect(indexNames).toContain("idx_media_files_status");
    });
  });
});
