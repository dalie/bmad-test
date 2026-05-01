import { Test, TestingModule } from "@nestjs/testing";
import { ProbeService, ProbeResult } from "./probe.service";
import * as child_process from "child_process";
import { promisify } from "util";

jest.mock("child_process");

const mockedExecFile = child_process.execFile as unknown as jest.Mock;

describe("ProbeService", () => {
  let service: ProbeService;

  beforeEach(async () => {
    jest.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ProbeService],
    }).compile();

    service = module.get<ProbeService>(ProbeService);
  });

  const sampleMkvOutput = JSON.stringify({
    streams: [
      {
        index: 0,
        codec_type: "video",
        codec_name: "h264",
        width: 1920,
        height: 1080,
        profile: "High",
      },
      {
        index: 1,
        codec_type: "audio",
        codec_name: "ac3",
        channels: 6,
        tags: { language: "eng" },
      },
      {
        index: 2,
        codec_type: "audio",
        codec_name: "aac",
        channels: 2,
        tags: { language: "fre" },
      },
      {
        index: 3,
        codec_type: "subtitle",
        codec_name: "subrip",
        tags: { language: "eng" },
      },
      {
        index: 4,
        codec_type: "subtitle",
        codec_name: "ass",
        tags: { language: "fre" },
      },
    ],
    format: {
      format_name: "matroska,webm",
      duration: "7200.123",
      bit_rate: "5000000",
    },
  });

  const sampleMp4Output = JSON.stringify({
    streams: [
      {
        index: 0,
        codec_type: "video",
        codec_name: "hevc",
        width: 3840,
        height: 2160,
        profile: "Main 10",
      },
      {
        index: 1,
        codec_type: "audio",
        codec_name: "aac",
        channels: 2,
        tags: { language: "eng" },
      },
    ],
    format: {
      format_name: "mov,mp4,m4a,3gp,3g2,mj2",
      duration: "5400.000",
      bit_rate: "12000000",
    },
  });

  describe("probeFile", () => {
    it("should parse MKV file with multiple streams correctly", async () => {
      mockedExecFile.mockImplementation(
        (_cmd: string, _args: string[], callback: Function) => {
          callback(null, { stdout: sampleMkvOutput, stderr: "" });
        },
      );

      const result = await service.probeFile("/media/movie.mkv");

      expect(result.format.container).toBe("matroska,webm");
      expect(result.format.duration).toBeCloseTo(7200.123);
      expect(result.format.bitrate).toBe(5000000);
      expect(result.video).not.toBeNull();
      expect(result.video!.codec).toBe("h264");
      expect(result.video!.width).toBe(1920);
      expect(result.video!.height).toBe(1080);
      expect(result.video!.profile).toBe("High");
      expect(result.audioTracks).toHaveLength(2);
      expect(result.audioTracks[0].codec).toBe("ac3");
      expect(result.audioTracks[0].channels).toBe(6);
      expect(result.audioTracks[0].language).toBe("eng");
      expect(result.audioTracks[1].codec).toBe("aac");
      expect(result.subtitleTracks).toHaveLength(2);
      expect(result.subtitleTracks[0].codec).toBe("subrip");
      expect(result.subtitleTracks[0].language).toBe("eng");
      expect(result.subtitleTracks[1].codec).toBe("ass");
    });

    it("should parse MP4 file with single audio track", async () => {
      mockedExecFile.mockImplementation(
        (_cmd: string, _args: string[], callback: Function) => {
          callback(null, { stdout: sampleMp4Output, stderr: "" });
        },
      );

      const result = await service.probeFile("/media/movie.mp4");

      expect(result.format.container).toBe("mov,mp4,m4a,3gp,3g2,mj2");
      expect(result.format.duration).toBeCloseTo(5400.0);
      expect(result.video!.codec).toBe("hevc");
      expect(result.video!.width).toBe(3840);
      expect(result.video!.height).toBe(2160);
      expect(result.audioTracks).toHaveLength(1);
      expect(result.subtitleTracks).toHaveLength(0);
    });

    it("should handle file with no video stream", async () => {
      const audioOnlyOutput = JSON.stringify({
        streams: [
          {
            index: 0,
            codec_type: "audio",
            codec_name: "mp3",
            channels: 2,
          },
        ],
        format: {
          format_name: "mp3",
          duration: "180.5",
          bit_rate: "320000",
        },
      });

      mockedExecFile.mockImplementation(
        (_cmd: string, _args: string[], callback: Function) => {
          callback(null, { stdout: audioOnlyOutput, stderr: "" });
        },
      );

      const result = await service.probeFile("/media/audio.mp3");

      expect(result.video).toBeNull();
      expect(result.audioTracks).toHaveLength(1);
    });

    it("should throw when ffprobe fails (non-zero exit code)", async () => {
      const error = new Error("Command failed: ffprobe");
      (error as any).code = 1;

      mockedExecFile.mockImplementation(
        (_cmd: string, _args: string[], callback: Function) => {
          callback(error, { stdout: "", stderr: "Invalid data found" });
        },
      );

      await expect(service.probeFile("/media/corrupt.mkv")).rejects.toThrow(
        "Command failed: ffprobe",
      );
    });

    it("should throw when ffprobe returns invalid JSON", async () => {
      mockedExecFile.mockImplementation(
        (_cmd: string, _args: string[], callback: Function) => {
          callback(null, { stdout: "not json", stderr: "" });
        },
      );

      await expect(service.probeFile("/media/bad.mkv")).rejects.toThrow();
    });

    it("should call ffprobe with correct arguments", async () => {
      mockedExecFile.mockImplementation(
        (_cmd: string, _args: string[], callback: Function) => {
          callback(null, { stdout: sampleMkvOutput, stderr: "" });
        },
      );

      await service.probeFile("/media/test file.mkv");

      expect(mockedExecFile).toHaveBeenCalledWith(
        "ffprobe",
        [
          "-v",
          "quiet",
          "-print_format",
          "json",
          "-show_format",
          "-show_streams",
          "/media/test file.mkv",
        ],
        expect.any(Function),
      );
    });

    it("should handle streams with missing tags", async () => {
      const noTagsOutput = JSON.stringify({
        streams: [
          {
            index: 0,
            codec_type: "video",
            codec_name: "vp9",
            width: 1280,
            height: 720,
          },
          {
            index: 1,
            codec_type: "audio",
            codec_name: "opus",
            channels: 2,
          },
        ],
        format: {
          format_name: "webm",
          duration: "300.0",
          bit_rate: "2000000",
        },
      });

      mockedExecFile.mockImplementation(
        (_cmd: string, _args: string[], callback: Function) => {
          callback(null, { stdout: noTagsOutput, stderr: "" });
        },
      );

      const result = await service.probeFile("/media/video.webm");

      expect(result.audioTracks[0].language).toBeUndefined();
      expect(result.video!.profile).toBeUndefined();
    });
  });
});
