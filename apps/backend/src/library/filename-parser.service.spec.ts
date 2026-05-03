import { FilenameParserService } from "./filename-parser.service";

describe("FilenameParserService", () => {
  let service: FilenameParserService;

  beforeEach(() => {
    service = new FilenameParserService();
  });

  describe("Movie filenames", () => {
    it("should parse torrent-style movie filename with dots and quality tags", () => {
      const result = service.parseFilename(
        "Dust.Bunny.2025.REPACK.720p.WEB.H264-SLOT.mkv",
        "movies",
      );
      expect(result.title).toBe("Dust Bunny");
      expect(result.year).toBe(2025);
      expect(result.season).toBeUndefined();
      expect(result.episode).toBeUndefined();
    });

    it("should parse movie with parenthesized year", () => {
      const result = service.parseFilename("Movie Name (2023).mkv", "movies");
      expect(result.title).toBe("Movie Name");
      expect(result.year).toBe(2023);
    });

    it("should parse movie with complex codecs", () => {
      const result = service.parseFilename(
        "Movie.Name.2023.2160p.WEB-DL.DDP5.1.H.265-GROUP.mkv",
        "movies",
      );
      expect(result.title).toBe("Movie Name");
      expect(result.year).toBe(2023);
    });

    it("should handle filename with no year", () => {
      const result = service.parseFilename(
        "Some.Movie.720p.WEB.H264-GROUP.mkv",
        "movies",
      );
      expect(result.title).toBe("Some Movie");
      expect(result.year).toBeUndefined();
    });

    it("should handle year-like number in title (e.g., 2012.2009.720p.mkv)", () => {
      const result = service.parseFilename("2012.2009.720p.mkv", "movies");
      expect(result.title).toBe("2012");
      expect(result.year).toBe(2009);
    });
  });

  describe("TV filenames", () => {
    it("should parse S##E## pattern", () => {
      const result = service.parseFilename(
        "Show.Name.S03E05.Episode.Title.720p.WEB.H264-GROUP.mkv",
        "tv",
      );
      expect(result.title).toBe("Show Name");
      expect(result.season).toBe(3);
      expect(result.episode).toBe(5);
    });

    it("should parse lowercase s##e## pattern", () => {
      const result = service.parseFilename(
        "Show.Name.s01e01.720p.mkv",
        "tv",
      );
      expect(result.title).toBe("Show Name");
      expect(result.season).toBe(1);
      expect(result.episode).toBe(1);
    });

    it("should parse #x## pattern", () => {
      const result = service.parseFilename(
        "Show Name - 1x05 - Episode Title.mkv",
        "tv",
      );
      expect(result.title).toBe("Show Name");
      expect(result.season).toBe(1);
      expect(result.episode).toBe(5);
    });

    it("should parse Season.#.Episode.# pattern", () => {
      const result = service.parseFilename(
        "Show.Name.Season.2.Episode.10.mkv",
        "tv",
      );
      expect(result.title).toBe("Show Name");
      expect(result.season).toBe(2);
      expect(result.episode).toBe(10);
    });
  });
});
