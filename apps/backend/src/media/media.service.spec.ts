import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { NotFoundException } from "@nestjs/common";
import Database from "better-sqlite3";
import { MediaService } from "./media.service";
import { DatabaseService } from "../database/database.service";

describe("MediaService", () => {
  let service: MediaService;
  let dbService: DatabaseService;
  let db: Database.Database;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaService,
        DatabaseService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === "CACHE_PATH") return ":memory:";
              return undefined;
            },
          },
        },
      ],
    }).compile();

    dbService = module.get<DatabaseService>(DatabaseService);
    dbService.onModuleInit();
    db = dbService.getDatabase();

    service = module.get<MediaService>(MediaService);
  });

  afterEach(() => {
    dbService.onModuleDestroy();
  });

  // ── Helpers ──────────────────────────────────────────────────────────────

  function insertSource(type: "movies" | "tv" = "movies"): number {
    return db
      .prepare("INSERT INTO media_sources (path, type) VALUES (?, ?)")
      .run(`/media/${type}`, type).lastInsertRowid as number;
  }

  function insertMediaFile(
    sourceId: number,
    filePath: string,
    status = "ready",
    tier: number | null = 1,
  ): number {
    const filename = filePath.split("/").pop()!;
    return db
      .prepare(
        "INSERT INTO media_files (path, filename, source_id, status, tier) VALUES (?, ?, ?, ?, ?)",
      )
      .run(filePath, filename, sourceId, status, tier)
      .lastInsertRowid as number;
  }

  function insertTranscodeJob(
    fileId: number,
    tier: number,
    status = "completed",
    outputPath: string | null = "/mnt/cache/transcoded/output.mp4",
  ): void {
    db.prepare(
      "INSERT INTO transcode_jobs (file_id, tier, status, output_path) VALUES (?, ?, ?, ?)",
    ).run(fileId, tier, status, outputPath);
  }

  function insertSubtitle(
    mediaFileId: number,
    webvttPath: string | null = "/mnt/cache/subtitles/sub.vtt",
    language: string = "eng",
  ): number {
    return db
      .prepare(
        "INSERT INTO subtitles (media_file_id, type, language, webvtt_path) VALUES (?, 'embedded', ?, ?)",
      )
      .run(mediaFileId, language, webvttPath).lastInsertRowid as number;
  }

  // ── getFileInfo ──────────────────────────────────────────────────────────

  describe("getFileInfo", () => {
    it("should resolve Tier 1 file from media_files.path", () => {
      const sourceId = insertSource();
      const fileId = insertMediaFile(
        sourceId,
        "/media/movies/movie.mp4",
        "ready",
        1,
      );

      const result = service.getFileInfo(fileId);

      expect(result.id).toBe(fileId);
      expect(result.path).toBe("/media/movies/movie.mp4");
      expect(result.tier).toBe(1);
      expect(result.contentType).toBe("video/mp4");
    });

    it("should resolve Tier 2 file from media_files.path (video)", () => {
      const sourceId = insertSource();
      const fileId = insertMediaFile(
        sourceId,
        "/media/movies/movie.mkv",
        "ready",
        2,
      );
      insertTranscodeJob(
        fileId,
        2,
        "completed",
        "/mnt/cache/sidecars/audio.aac",
      );

      const result = service.getFileInfo(fileId);

      expect(result.id).toBe(fileId);
      expect(result.path).toBe("/media/movies/movie.mkv");
      expect(result.tier).toBe(2);
      expect(result.contentType).toBe("video/x-matroska");
    });

    it("should resolve Tier 3 file from transcode_jobs.output_path", () => {
      const sourceId = insertSource();
      const fileId = insertMediaFile(
        sourceId,
        "/media/movies/old.avi",
        "ready",
        3,
      );
      insertTranscodeJob(
        fileId,
        3,
        "completed",
        "/mnt/cache/transcoded/old.mp4",
      );

      const result = service.getFileInfo(fileId);

      expect(result.id).toBe(fileId);
      expect(result.path).toBe("/mnt/cache/transcoded/old.mp4");
      expect(result.tier).toBe(3);
      expect(result.contentType).toBe("video/mp4");
    });

    it("should throw NotFoundException for non-existent file", () => {
      expect(() => service.getFileInfo(999)).toThrow(NotFoundException);
    });

    it("should throw NotFoundException for non-ready Tier 1 file", () => {
      const sourceId = insertSource();
      const fileId = insertMediaFile(
        sourceId,
        "/media/movies/movie.mp4",
        "discovered",
        1,
      );

      expect(() => service.getFileInfo(fileId)).toThrow(NotFoundException);
    });

    it("should throw NotFoundException for Tier 3 with incomplete transcode", () => {
      const sourceId = insertSource();
      const fileId = insertMediaFile(
        sourceId,
        "/media/movies/old.avi",
        "ready",
        3,
      );
      insertTranscodeJob(fileId, 3, "processing", null);

      expect(() => service.getFileInfo(fileId)).toThrow(NotFoundException);
    });

    it("should reject paths with directory traversal", () => {
      const sourceId = insertSource();
      // Manually insert a file with a malicious path to test path validation
      const fileId = db
        .prepare(
          "INSERT INTO media_files (path, filename, source_id, status, tier) VALUES (?, ?, ?, ?, ?)",
        )
        .run("/media/movies/../../etc/passwd", "passwd", sourceId, "ready", 1)
        .lastInsertRowid as number;

      expect(() => service.getFileInfo(fileId)).toThrow(NotFoundException);
    });
  });

  // ── getAudioSidecarPath ─────────────────────────────────────────────────

  describe("getAudioSidecarPath", () => {
    it("should return sidecar path for Tier 2 file", () => {
      const sourceId = insertSource();
      const fileId = insertMediaFile(
        sourceId,
        "/media/movies/movie.mkv",
        "ready",
        2,
      );
      insertTranscodeJob(
        fileId,
        2,
        "completed",
        "/mnt/cache/sidecars/audio.aac",
      );

      const result = service.getAudioSidecarPath(fileId);

      expect(result).toBe("/mnt/cache/sidecars/audio.aac");
    });

    it("should throw NotFoundException for non-Tier-2 file", () => {
      const sourceId = insertSource();
      const fileId = insertMediaFile(
        sourceId,
        "/media/movies/movie.mp4",
        "ready",
        1,
      );

      expect(() => service.getAudioSidecarPath(fileId)).toThrow(
        NotFoundException,
      );
    });

    it("should throw NotFoundException for non-existent file", () => {
      expect(() => service.getAudioSidecarPath(999)).toThrow(NotFoundException);
    });

    it("should throw NotFoundException when sidecar transcode not completed", () => {
      const sourceId = insertSource();
      const fileId = insertMediaFile(
        sourceId,
        "/media/movies/movie.mkv",
        "ready",
        2,
      );
      insertTranscodeJob(fileId, 2, "processing", null);

      expect(() => service.getAudioSidecarPath(fileId)).toThrow(
        NotFoundException,
      );
    });
  });

  // ── getSubtitleInfo ─────────────────────────────────────────────────────

  describe("getSubtitleInfo", () => {
    it("should return subtitle info for valid subtitle", () => {
      const sourceId = insertSource();
      const fileId = insertMediaFile(
        sourceId,
        "/media/movies/movie.mp4",
        "ready",
        1,
      );
      const subId = insertSubtitle(fileId, "/mnt/cache/subtitles/en.vtt");

      const result = service.getSubtitleInfo(subId);

      expect(result.id).toBe(subId);
      expect(result.mediaFileId).toBe(fileId);
      expect(result.webvttPath).toBe("/mnt/cache/subtitles/en.vtt");
    });

    it("should throw NotFoundException for non-existent subtitle", () => {
      expect(() => service.getSubtitleInfo(999)).toThrow(NotFoundException);
    });

    it("should throw NotFoundException when webvtt_path is null", () => {
      const sourceId = insertSource();
      const fileId = insertMediaFile(
        sourceId,
        "/media/movies/movie.mp4",
        "ready",
        1,
      );
      insertSubtitle(fileId, null);

      // The null webvtt_path means the query's WHERE clause excludes it
      expect(() => service.getSubtitleInfo(1)).toThrow(NotFoundException);
    });
  });

  // ── getSubtitlesForFile ─────────────────────────────────────────────────

  describe("getSubtitlesForFile", () => {
    it("should return available subtitles for a file", () => {
      const sourceId = insertSource();
      const fileId = insertMediaFile(
        sourceId,
        "/media/movies/movie.mp4",
        "ready",
        1,
      );
      insertSubtitle(fileId, "/mnt/cache/subtitles/en.vtt", "eng");
      insertSubtitle(fileId, "/mnt/cache/subtitles/fr.vtt", "fra");

      const result = service.getSubtitlesForFile(fileId);

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty("id");
      expect(result[0]).toHaveProperty("language", "eng");
      expect(result[1]).toHaveProperty("language", "fra");
    });

    it("should return empty array when no subtitles exist", () => {
      const sourceId = insertSource();
      const fileId = insertMediaFile(
        sourceId,
        "/media/movies/movie.mp4",
        "ready",
        1,
      );

      const result = service.getSubtitlesForFile(fileId);

      expect(result).toEqual([]);
    });

    it("should exclude subtitles where webvtt_path is NULL", () => {
      const sourceId = insertSource();
      const fileId = insertMediaFile(
        sourceId,
        "/media/movies/movie.mp4",
        "ready",
        1,
      );
      insertSubtitle(fileId, null); // not ready
      insertSubtitle(fileId, "/mnt/cache/subtitles/en.vtt"); // ready

      const result = service.getSubtitlesForFile(fileId);

      expect(result).toHaveLength(1);
    });

    it("should return empty array for non-existent fileId", () => {
      const result = service.getSubtitlesForFile(999);

      expect(result).toEqual([]);
    });
  });
});
