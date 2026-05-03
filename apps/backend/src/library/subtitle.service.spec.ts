import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import Database from 'better-sqlite3';
import { SubtitleService } from './subtitle.service';
import { DatabaseService } from '../database/database.service';

// Mock child_process.execFile so execFileAsync can be controlled in tests
jest.mock('child_process', () => ({ execFile: jest.fn() }));

const TEST_CACHE_PATH = ':memory:';
const SUBTITLE_DIR = path.join(TEST_CACHE_PATH, 'subtitles');

describe('SubtitleService', () => {
  let service: SubtitleService;
  let dbService: DatabaseService;
  let db: Database.Database;

  const mockExecFile = execFile as unknown as jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();
    sourceCounter = 0;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubtitleService,
        DatabaseService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'CACHE_PATH') return TEST_CACHE_PATH;
              return undefined;
            },
          },
        },
      ],
    }).compile();

    dbService = module.get<DatabaseService>(DatabaseService);
    dbService.onModuleInit();
    db = dbService.getDatabase();

    service = module.get<SubtitleService>(SubtitleService);
  });

  afterEach(() => {
    dbService.onModuleDestroy();
    if (fs.existsSync(SUBTITLE_DIR)) {
      fs.rmSync(SUBTITLE_DIR, { recursive: true, force: true });
    }
  });

  // ── Helpers ──────────────────────────────────────────────────────────────

  let sourceCounter = 0;

  function insertSource(): number {
    sourceCounter++;
    return db
      .prepare('INSERT INTO media_sources (path, type) VALUES (?, ?)')
      .run(`/media/movies-${sourceCounter}`, 'movies').lastInsertRowid as number;
  }

  function insertMediaFile(sourceId: number, filename: string, status = 'classified'): number {
    return db
      .prepare(
        "INSERT INTO media_files (path, filename, source_id, status) VALUES (?, ?, ?, ?)",
      )
      .run(`/media/${filename}`, filename, sourceId, status).lastInsertRowid as number;
  }

  function insertSubtitle(
    mediaFileId: number,
    type: 'embedded' | 'sidecar',
    trackIndex: number | null = null,
    sidecarPath: string | null = null,
    language: string | null = null,
    codec: string | null = null,
  ): number {
    return db
      .prepare(
        `INSERT INTO subtitles (media_file_id, track_index, type, language, codec, sidecar_path)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(mediaFileId, trackIndex, type, language, codec, sidecarPath)
      .lastInsertRowid as number;
  }

  function getSubtitle(id: number): any {
    return db.prepare('SELECT * FROM subtitles WHERE id = ?').get(id) as any;
  }

  function getMediaFile(id: number): any {
    return db.prepare('SELECT * FROM media_files WHERE id = ?').get(id) as any;
  }

  function mockFfmpegSuccess() {
    mockExecFile.mockImplementation((...args: any[]) => {
      const callback = args[args.length - 1];
      callback(null, '', '');
    });
  }

  function mockFfmpegFailure(message = 'FFmpeg error') {
    mockExecFile.mockImplementation((...args: any[]) => {
      const callback = args[args.length - 1];
      callback(new Error(message), '', '');
    });
  }

  // ── Tests ─────────────────────────────────────────────────────────────────

  // 5.2 — Embedded subtitle conversion
  it('should convert embedded subtitle and set webvtt_path', async () => {
    mockFfmpegSuccess();
    const sourceId = insertSource();
    const fileId = insertMediaFile(sourceId, 'Movie.mkv');
    const subtitleId = insertSubtitle(fileId, 'embedded', 2);

    await service.executeSubtitleConversionQueue();

    const row = getSubtitle(subtitleId);
    const expectedPath = path.join(SUBTITLE_DIR, `${subtitleId}.vtt`);
    expect(row.webvtt_path).toBe(expectedPath);

    const calls = mockExecFile.mock.calls;
    expect(calls).toHaveLength(1);
    const ffmpegArgs: string[] = calls[0][1];
    expect(ffmpegArgs).toContain('-map');
    expect(ffmpegArgs).toContain('0:2');
    expect(ffmpegArgs).toContain('-i');
    // -i arg is the video file path
    const iIdx = ffmpegArgs.indexOf('-i');
    expect(ffmpegArgs[iIdx + 1]).toBe('/media/Movie.mkv');
    expect(ffmpegArgs[ffmpegArgs.length - 1]).toMatch(/\.vtt$/);
  });

  // 5.3 — Sidecar subtitle conversion
  it('should convert sidecar subtitle using sidecar_path as input', async () => {
    mockFfmpegSuccess();
    const sourceId = insertSource();
    const fileId = insertMediaFile(sourceId, 'Movie.mkv');
    const sidecarPath = '/media/Movie.en.srt';
    const subtitleId = insertSubtitle(fileId, 'sidecar', null, sidecarPath, 'eng', 'subrip');

    await service.executeSubtitleConversionQueue();

    const row = getSubtitle(subtitleId);
    const expectedPath = path.join(SUBTITLE_DIR, `${subtitleId}.vtt`);
    expect(row.webvtt_path).toBe(expectedPath);

    const calls = mockExecFile.mock.calls;
    expect(calls).toHaveLength(1);
    const ffmpegArgs: string[] = calls[0][1];
    // -i arg must be the sidecar file, NOT the video file
    const iIdx = ffmpegArgs.indexOf('-i');
    expect(ffmpegArgs[iIdx + 1]).toBe(sidecarPath);
    // No -map flag for sidecar
    expect(ffmpegArgs).not.toContain('-map');
  });

  // 5.4 — FFmpeg failure for one subtitle does not block others (NFR13)
  it('should continue processing remaining subtitles after one failure', async () => {
    let callCount = 0;
    mockExecFile.mockImplementation((...args: any[]) => {
      const callback = args[args.length - 1];
      callCount++;
      if (callCount === 1) {
        callback(new Error('FFmpeg failed'), '', '');
      } else {
        callback(null, '', '');
      }
    });

    const sourceId = insertSource();
    const fileId = insertMediaFile(sourceId, 'Movie.mkv');
    const subtitleId1 = insertSubtitle(fileId, 'embedded', 2);
    const subtitleId2 = insertSubtitle(fileId, 'embedded', 3);

    await service.executeSubtitleConversionQueue();

    const row1 = getSubtitle(subtitleId1);
    const row2 = getSubtitle(subtitleId2);
    expect(row1.webvtt_path).toBeNull();
    expect(row2.webvtt_path).toBe(path.join(SUBTITLE_DIR, `${subtitleId2}.vtt`));
  });

  // 5.5 — Mutex guard
  it('should skip queue when already converting', async () => {
    (service as any).converting = true;
    const logSpy = jest.spyOn((service as any).logger, 'log');

    await service.executeSubtitleConversionQueue();

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('already in progress'));
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  // 5.6 — Idempotency: rows with webvtt_path already set are skipped
  it('should skip subtitles that already have webvtt_path set', async () => {
    const sourceId = insertSource();
    const fileId = insertMediaFile(sourceId, 'Movie.mkv');
    const subtitleId = insertSubtitle(fileId, 'embedded', 2);
    db.prepare('UPDATE subtitles SET webvtt_path = ? WHERE id = ?').run('/some/path.vtt', subtitleId);

    await service.executeSubtitleConversionQueue();

    expect(mockExecFile).not.toHaveBeenCalled();
  });

  // 5.7 — Empty queue
  it('should handle empty subtitle queue gracefully', async () => {
    await service.executeSubtitleConversionQueue();
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  // 5.8 — Output path construction
  it('should construct output path as CACHE_PATH/subtitles/{id}.vtt', async () => {
    mockFfmpegSuccess();
    const sourceId = insertSource();
    const fileId = insertMediaFile(sourceId, 'Movie.mkv');
    const subtitleId = insertSubtitle(fileId, 'embedded', 0);

    await service.executeSubtitleConversionQueue();

    const row = getSubtitle(subtitleId);
    expect(row.webvtt_path).toBe(path.join(':memory:', 'subtitles', `${subtitleId}.vtt`));
  });

  // 5.9 — No media_files.status change on FFmpeg failure
  it('should not modify media_files.status when subtitle conversion fails', async () => {
    mockFfmpegFailure('FFmpeg subtitle error');
    const sourceId = insertSource();
    const fileId = insertMediaFile(sourceId, 'Movie.mkv', 'ready');
    insertSubtitle(fileId, 'embedded', 2);

    await service.executeSubtitleConversionQueue();

    const file = getMediaFile(fileId);
    expect(file.status).toBe('ready');
  });

  // 5.10 — Mutex reset after completion
  it('should reset converting flag after queue completes', async () => {
    mockFfmpegSuccess();
    const sourceId = insertSource();
    const fileId = insertMediaFile(sourceId, 'Movie.mkv');
    insertSubtitle(fileId, 'embedded', 2);

    await service.executeSubtitleConversionQueue();

    expect((service as any).converting).toBe(false);
  });

  // Mutex reset after failure
  it('should reset converting flag even when queue throws', async () => {
    mockFfmpegFailure();
    const sourceId = insertSource();
    const fileId = insertMediaFile(sourceId, 'Movie.mkv');
    insertSubtitle(fileId, 'embedded', 2);

    await service.executeSubtitleConversionQueue();

    expect((service as any).converting).toBe(false);
  });
});
