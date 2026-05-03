import { Injectable } from "@nestjs/common";

export interface ParsedFilename {
  title: string;
  year?: number;
  season?: number;
  episode?: number;
}

@Injectable()
export class FilenameParserService {
  parseFilename(
    filename: string,
    sourceType: "movies" | "tv",
  ): ParsedFilename {
    // Remove file extension
    const withoutExt = filename.replace(/\.[a-z0-9]{2,4}$/i, "");

    const result: ParsedFilename = { title: "" };

    if (sourceType === "tv") {
      this.parseTv(withoutExt, result);
    } else {
      this.parseMovie(withoutExt, result);
    }

    return result;
  }

  private parseTv(input: string, result: ParsedFilename): void {
    // Try S##E## or s##e## pattern
    const sPattern = /[.\s-]?[Ss](\d{1,2})[Ee](\d{1,2})/;
    // Try #x## pattern
    const xPattern = /[.\s-](\d{1,2})x(\d{2,3})/;
    // Try Season.#.Episode.# pattern
    const seasonEpPattern =
      /[.\s]Season[.\s](\d{1,2})[.\s]Episode[.\s](\d{1,3})/i;

    let titleCandidate: string;

    const sMatch = input.match(sPattern);
    if (sMatch) {
      result.season = parseInt(sMatch[1], 10);
      result.episode = parseInt(sMatch[2], 10);
      titleCandidate = input.substring(0, sMatch.index!);
    } else {
      const xMatch = input.match(xPattern);
      if (xMatch) {
        result.season = parseInt(xMatch[1], 10);
        result.episode = parseInt(xMatch[2], 10);
        titleCandidate = input.substring(0, xMatch.index!);
      } else {
        const seMatch = input.match(seasonEpPattern);
        if (seMatch) {
          result.season = parseInt(seMatch[1], 10);
          result.episode = parseInt(seMatch[2], 10);
          titleCandidate = input.substring(0, seMatch.index!);
        } else {
          // No TV pattern found, treat like movie
          titleCandidate = input;
        }
      }
    }

    result.title = this.cleanTitle(titleCandidate);
  }

  private parseMovie(input: string, result: ParsedFilename): void {
    // Check for parenthesized year: "Movie Name (2023)"
    const parenYearMatch = input.match(/\(?(19|20)\d{2}\)?/g);

    // Find year: last occurrence of 4-digit year before quality tags
    const yearPattern = /[.\s(]?((?:19|20)\d{2})[.\s)]/g;
    let yearMatch: RegExpExecArray | null;
    let lastYear: RegExpExecArray | null = null;

    while ((yearMatch = yearPattern.exec(input)) !== null) {
      lastYear = yearMatch;
    }

    if (lastYear) {
      result.year = parseInt(lastYear[1], 10);
      // Title is everything before the year
      const titleCandidate = input.substring(0, lastYear.index!);
      result.title = this.cleanTitle(titleCandidate);
    } else {
      // No year found, strip quality tags and use as title
      result.title = this.cleanTitle(this.stripQualityTags(input));
    }
  }

  private stripQualityTags(input: string): string {
    const qualityPattern =
      /[.\s-](720p|1080p|2160p|4K|WEB|WEB-DL|WEBRip|BluRay|BDRip|DVDRip|HDTV|REPACK|PROPER|x264|x265|H264|H\.264|H265|H\.265|HEVC|AAC|AC3|DTS|DDP5\.1|DD5\.1|FLAC|REMUX)(?=[.\s-]|$)/i;
    const match = input.match(qualityPattern);
    if (match) {
      return input.substring(0, match.index!);
    }
    return input;
  }

  private cleanTitle(input: string): string {
    return (
      input
        // Replace dots and underscores with spaces
        .replace(/[._]/g, " ")
        // Remove leading/trailing hyphens and spaces
        .replace(/^[\s-]+|[\s-]+$/g, "")
        // Collapse multiple spaces
        .replace(/\s+/g, " ")
        .trim()
    );
  }
}
