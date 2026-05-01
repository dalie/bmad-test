import { Injectable, Logger } from "@nestjs/common";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface ProbeResult {
  format: {
    container: string;
    duration: number;
    bitrate: number;
  };
  video: {
    codec: string;
    width: number;
    height: number;
    profile?: string;
  } | null;
  audioTracks: Array<{
    index: number;
    codec: string;
    channels: number;
    language?: string;
  }>;
  subtitleTracks: Array<{
    index: number;
    codec: string;
    language?: string;
  }>;
}

@Injectable()
export class ProbeService {
  private readonly logger = new Logger(ProbeService.name);

  async probeFile(filePath: string): Promise<ProbeResult> {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      filePath,
    ]);

    const data = JSON.parse(stdout);
    return this.parseProbeOutput(data);
  }

  private parseProbeOutput(data: any): ProbeResult {
    const streams: any[] = data.streams || [];
    const format = data.format || {};

    const videoStream = streams.find((s) => s.codec_type === "video");
    const audioStreams = streams.filter((s) => s.codec_type === "audio");
    const subtitleStreams = streams.filter((s) => s.codec_type === "subtitle");

    return {
      format: {
        container: format.format_name || "",
        duration: parseFloat(format.duration) || 0,
        bitrate: parseInt(format.bit_rate, 10) || 0,
      },
      video: videoStream
        ? {
            codec: videoStream.codec_name || "",
            width: videoStream.width || 0,
            height: videoStream.height || 0,
            profile: videoStream.profile || undefined,
          }
        : null,
      audioTracks: audioStreams.map((s) => ({
        index: s.index,
        codec: s.codec_name || "",
        channels: s.channels || 0,
        language: s.tags?.language || undefined,
      })),
      subtitleTracks: subtitleStreams.map((s) => ({
        index: s.index,
        codec: s.codec_name || "",
        language: s.tags?.language || undefined,
      })),
    };
  }
}
