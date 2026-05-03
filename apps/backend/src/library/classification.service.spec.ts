import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import Database from "better-sqlite3";
import { ClassificationService } from "./classification.service";
import { DatabaseService } from "../database/database.service";
import { TranscodeService } from './transcode.service';
import { SubtitleService } from './subtitle.service';

describe("ClassificationService", () => {
  let service: ClassificationService;
  let dbService: DatabaseService;
  let db: Database.Database;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClassificationService,
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
        {
          provide: TranscodeService,
          useValue: {
            executeAudioSidecarQueue: jest.fn().mockResolvedValue(undefined),
            executeVideoTranscodeQueue: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: SubtitleService,
          useValue: {
            executeSubtitleConversionQueue: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    dbService = module.get<DatabaseService>(DatabaseService);
    dbService.onModuleInit();
    db = dbService.getDatabase();

    service = module.get<ClassificationService>(ClassificationService);
  });

  afterEach(() => {
    dbService.onModuleDestroy();
  });

  function insertSource(type: "movies" | "tv"): number {
    return db
      .prepare("INSERT INTO media_sources (path, type) VALUES (?, ?)")
      .run(`/media/${type}`, type).lastInsertRowid as number;
  }

  function insertMatchedFile(
    sourceId: number,
    filename: string,
    probeData: object | null,
  ): number {
    return db
      .prepare(
        "INSERT INTO media_files (path, filename, source_id, status, probe_data) VALUES (?, ?, ?, 'matched', ?)",
      )
      .run(
        `/media/${filename}`,
        filename,
        sourceId,
        probeData ? JSON.stringify(probeData) : null,
      ).lastInsertRowid as number;
  }

  function getFile(fileId: number): any {
    return db
      .prepare("SELECT * FROM media_files WHERE id = ?")
      .get(fileId) as any;
  }

  function getTranscodeJobs(fileId: number): any[] {
    return db
      .prepare("SELECT * FROM transcode_jobs WHERE file_id = ?")
      .all(fileId) as any[];
  }

  // 4.2: Tier 1 — web-compatible video + web-compatible audio
  describe("Tier 1: web-compatible video + web-compatible audio", () => {
    it("should assign tier 1 and NOT insert a transcode_jobs row", () => {
      const sourceId = insertSource("movies");
      const fileId = insertMatchedFile(sourceId, "movie.mkv", {
        format: { container: "matroska", duration: 7200, bitrate: 5000000 },
        video: { codec: "h264", width: 1920, height: 1080 },
        audioTracks: [{ index: 0, codec: "aac", channels: 2 }],
        subtitleTracks: [],
      });

      service.classifyFile({
        id: fileId,
        filename: "movie.mkv",
        probe_data: JSON.stringify({
          format: { container: "matroska", duration: 7200, bitrate: 5000000 },
          video: { codec: "h264", width: 1920, height: 1080 },
          audioTracks: [{ index: 0, codec: "aac", channels: 2 }],
          subtitleTracks: [],
        }),
      });

      const file = getFile(fileId);
      expect(file.tier).toBe(1);
      expect(file.status).toBe("ready");

      const jobs = getTranscodeJobs(fileId);
      expect(jobs).toHaveLength(0);
    });
  });

  // 4.3: Tier 2 — web-compatible video (h264) + incompatible audio (ac3)
  describe("Tier 2: web-compatible video + incompatible audio", () => {
    it("should assign tier 2 and insert a transcode_jobs row with status queued", () => {
      const sourceId = insertSource("movies");
      const fileId = insertMatchedFile(sourceId, "bluray.mkv", {
        format: { container: "matroska", duration: 7200, bitrate: 20000000 },
        video: { codec: "h264", width: 1920, height: 1080 },
        audioTracks: [{ index: 0, codec: "ac3", channels: 6 }],
        subtitleTracks: [],
      });

      service.classifyFile({
        id: fileId,
        filename: "bluray.mkv",
        probe_data: JSON.stringify({
          format: { container: "matroska", duration: 7200, bitrate: 20000000 },
          video: { codec: "h264", width: 1920, height: 1080 },
          audioTracks: [{ index: 0, codec: "ac3", channels: 6 }],
          subtitleTracks: [],
        }),
      });

      const file = getFile(fileId);
      expect(file.tier).toBe(2);
      expect(file.status).toBe("classified");

      const jobs = getTranscodeJobs(fileId);
      expect(jobs).toHaveLength(1);
      expect(jobs[0].tier).toBe(2);
      expect(jobs[0].status).toBe("queued");
    });
  });

  // 4.4: Tier 3 — non-web-compatible video (hevc)
  describe("Tier 3: non-web-compatible video codec", () => {
    it("should assign tier 3 and insert a transcode_jobs row with status queued", () => {
      const sourceId = insertSource("movies");
      const fileId = insertMatchedFile(sourceId, "4k.mkv", {
        format: { container: "matroska", duration: 7200, bitrate: 50000000 },
        video: { codec: "hevc", width: 3840, height: 2160 },
        audioTracks: [{ index: 0, codec: "eac3", channels: 8 }],
        subtitleTracks: [],
      });

      service.classifyFile({
        id: fileId,
        filename: "4k.mkv",
        probe_data: JSON.stringify({
          format: { container: "matroska", duration: 7200, bitrate: 50000000 },
          video: { codec: "hevc", width: 3840, height: 2160 },
          audioTracks: [{ index: 0, codec: "eac3", channels: 8 }],
          subtitleTracks: [],
        }),
      });

      const file = getFile(fileId);
      expect(file.tier).toBe(3);
      expect(file.status).toBe("classified");

      const jobs = getTranscodeJobs(fileId);
      expect(jobs).toHaveLength(1);
      expect(jobs[0].tier).toBe(3);
      expect(jobs[0].status).toBe("queued");
    });
  });

  // 4.5: Tier 3 — null video stream
  describe("Tier 3: null video stream", () => {
    it("should assign tier 3 when video stream is null", () => {
      const sourceId = insertSource("movies");
      const fileId = insertMatchedFile(sourceId, "audioonly.mp4", {
        format: { container: "mp4", duration: 3600, bitrate: 192000 },
        video: null,
        audioTracks: [{ index: 0, codec: "aac", channels: 2 }],
        subtitleTracks: [],
      });

      service.classifyFile({
        id: fileId,
        filename: "audioonly.mp4",
        probe_data: JSON.stringify({
          format: { container: "mp4", duration: 3600, bitrate: 192000 },
          video: null,
          audioTracks: [{ index: 0, codec: "aac", channels: 2 }],
          subtitleTracks: [],
        }),
      });

      const file = getFile(fileId);
      expect(file.tier).toBe(3);
      expect(file.status).toBe("classified");

      const jobs = getTranscodeJobs(fileId);
      expect(jobs).toHaveLength(1);
      expect(jobs[0].tier).toBe(3);
    });
  });

  // 4.6: Tier 1 — web-compatible video + no audio tracks
  describe("Tier 1: web-compatible video + no audio tracks", () => {
    it("should assign tier 1 when there are no audio tracks", () => {
      const sourceId = insertSource("movies");
      const fileId = insertMatchedFile(sourceId, "silent.mp4", {
        format: { container: "mp4", duration: 120, bitrate: 1000000 },
        video: { codec: "vp9", width: 1280, height: 720 },
        audioTracks: [],
        subtitleTracks: [],
      });

      service.classifyFile({
        id: fileId,
        filename: "silent.mp4",
        probe_data: JSON.stringify({
          format: { container: "mp4", duration: 120, bitrate: 1000000 },
          video: { codec: "vp9", width: 1280, height: 720 },
          audioTracks: [],
          subtitleTracks: [],
        }),
      });

      const file = getFile(fileId);
      expect(file.tier).toBe(1);
      expect(file.status).toBe("ready");

      const jobs = getTranscodeJobs(fileId);
      expect(jobs).toHaveLength(0);
    });
  });

  // 4.7: null probe_data — logs warning, no DB update, no crash
  describe("null probe_data handling", () => {
    it("should log a warning and not update the DB when probe_data is null", () => {
      const sourceId = insertSource("movies");
      const fileId = insertMatchedFile(sourceId, "noprobe.mkv", null);

      const warnSpy = jest.spyOn(service["logger"], "warn");

      service.classifyFile({ id: fileId, filename: "noprobe.mkv", probe_data: null });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("noprobe.mkv"),
      );

      const file = getFile(fileId);
      expect(file.tier).toBeNull();
      expect(file.status).toBe("matched");
    });
  });

  // 4.8: malformed probe_data JSON — logs error, no crash
  describe("malformed probe_data handling", () => {
    it("should log an error and not crash when probe_data is invalid JSON", () => {
      const sourceId = insertSource("movies");
      const fileId = insertMatchedFile(sourceId, "badprobe.mkv", null);

      // Manually set invalid JSON via raw insert override
      db.prepare("UPDATE media_files SET probe_data = ? WHERE id = ?").run(
        "{not valid json",
        fileId,
      );

      const errorSpy = jest.spyOn(service["logger"], "error");

      service.classifyFile({
        id: fileId,
        filename: "badprobe.mkv",
        probe_data: "{not valid json",
      });

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("badprobe.mkv"),
      );

      const file = getFile(fileId);
      expect(file.tier).toBeNull();
      expect(file.status).toBe("matched");
    });
  });

  // 4.9: executeClassification() mutex — second concurrent call is a no-op
  describe("executeClassification mutex", () => {
    it("should skip concurrent runs when classification is already in progress", async () => {
      // Manually set the private flag to simulate in-progress state
      (service as any).classifying = true;

      const logSpy = jest.spyOn(service["logger"], "log");

      await service.executeClassification();

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("already in progress"),
      );

      // Reset
      (service as any).classifying = false;
    });
  });

  // 4.10: executeClassification() error isolation
  describe("executeClassification error isolation", () => {
    it("should process remaining files when one file throws an error", async () => {
      const sourceId = insertSource("movies");

      const file1Id = insertMatchedFile(sourceId, "good.mkv", {
        format: { container: "matroska", duration: 7200, bitrate: 5000000 },
        video: { codec: "h264", width: 1920, height: 1080 },
        audioTracks: [{ index: 0, codec: "aac", channels: 2 }],
        subtitleTracks: [],
      });

      const file2Id = insertMatchedFile(sourceId, "bad.mkv", null);
      // Set invalid JSON so classifyFile will throw an error during parse
      db.prepare("UPDATE media_files SET probe_data = ? WHERE id = ?").run(
        "INVALID JSON",
        file2Id,
      );

      const file3Id = insertMatchedFile(sourceId, "also-good.mkv", {
        format: { container: "matroska", duration: 3600, bitrate: 5000000 },
        video: { codec: "vp9", width: 1280, height: 720 },
        audioTracks: [{ index: 0, codec: "opus", channels: 2 }],
        subtitleTracks: [],
      });

      await service.executeClassification();

      // file1 and file3 should be classified
      const f1 = getFile(file1Id);
      expect(f1.status).toBe("ready");
      expect(f1.tier).toBe(1);

      // file2 should remain unclassified (parse error)
      const f2 = getFile(file2Id);
      expect(f2.status).toBe("matched");
      expect(f2.tier).toBeNull();

      const f3 = getFile(file3Id);
      expect(f3.status).toBe("ready");
      expect(f3.tier).toBe(1);
    });
  });

  // 4.11: executeClassification processes all matched files
  describe("executeClassification integration", () => {
    it("should classify all matched files and create transcode_jobs for tier 2 and 3", async () => {
      const sourceId = insertSource("movies");

      const tier1Id = insertMatchedFile(sourceId, "tier1.mp4", {
        format: { container: "mp4", duration: 5400, bitrate: 8000000 },
        video: { codec: "h264", width: 1920, height: 1080 },
        audioTracks: [{ index: 0, codec: "aac", channels: 2 }],
        subtitleTracks: [],
      });

      const tier2Id = insertMatchedFile(sourceId, "tier2.mkv", {
        format: { container: "matroska", duration: 7200, bitrate: 20000000 },
        video: { codec: "h264", width: 1920, height: 1080 },
        audioTracks: [{ index: 0, codec: "dts", channels: 6 }],
        subtitleTracks: [],
      });

      const tier3Id = insertMatchedFile(sourceId, "tier3.mkv", {
        format: { container: "matroska", duration: 7200, bitrate: 50000000 },
        video: { codec: "hevc", width: 3840, height: 2160 },
        audioTracks: [{ index: 0, codec: "truehd", channels: 8 }],
        subtitleTracks: [],
      });

      await service.executeClassification();

      const f1 = getFile(tier1Id);
      expect(f1.tier).toBe(1);
      expect(f1.status).toBe("ready");
      expect(getTranscodeJobs(tier1Id)).toHaveLength(0);

      const f2 = getFile(tier2Id);
      expect(f2.tier).toBe(2);
      expect(f2.status).toBe("classified");
      const jobs2 = getTranscodeJobs(tier2Id);
      expect(jobs2).toHaveLength(1);
      expect(jobs2[0].status).toBe("queued");

      const f3 = getFile(tier3Id);
      expect(f3.tier).toBe(3);
      expect(f3.status).toBe("classified");
      const jobs3 = getTranscodeJobs(tier3Id);
      expect(jobs3).toHaveLength(1);
      expect(jobs3[0].status).toBe("queued");
    });

    it("should only query files with status=matched (not classified/probed/etc)", async () => {
      const sourceId = insertSource("movies");

      // Insert a file with status=classified (should be skipped)
      db.prepare(
        "INSERT INTO media_files (path, filename, source_id, status, tier) VALUES (?, ?, ?, 'classified', 1)",
      ).run("/media/already.mkv", "already.mkv", sourceId);

      // Insert a file with status=probed (should be skipped too)
      db.prepare(
        "INSERT INTO media_files (path, filename, source_id, status) VALUES (?, ?, ?, 'probed')",
      ).run("/media/probed.mkv", "probed.mkv", sourceId);

      const logSpy = jest.spyOn(service["logger"], "log");

      await service.executeClassification();

      // Should log "Classifying 0 matched files"
      expect(logSpy).toHaveBeenCalledWith("Classifying 0 matched files");
    });
  });

  // Codec case-insensitivity tests
  describe("codec case-insensitivity", () => {
    it("should handle uppercase codec names (e.g. H264, AAC)", () => {
      const sourceId = insertSource("movies");
      const fileId = insertMatchedFile(sourceId, "uppercase.mkv", null);

      service.classifyFile({
        id: fileId,
        filename: "uppercase.mkv",
        probe_data: JSON.stringify({
          format: { container: "matroska", duration: 100, bitrate: 5000000 },
          video: { codec: "H264", width: 1920, height: 1080 },
          audioTracks: [{ index: 0, codec: "AAC", channels: 2 }],
          subtitleTracks: [],
        }),
      });

      const file = getFile(fileId);
      expect(file.tier).toBe(1);
      expect(file.status).toBe("ready");
    });
  });
});
