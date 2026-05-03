import {
  Controller,
  Get,
  Query,
  BadRequestException,
  ServiceUnavailableException,
  BadGatewayException,
} from "@nestjs/common";
import {
  TmdbService,
  TmdbUnavailableError,
  TmdbClientError,
} from "./tmdb.service";

@Controller("tmdb")
export class TmdbController {
  constructor(private readonly tmdbService: TmdbService) {}

  @Get("search")
  async search(@Query("query") query: string, @Query("type") type: string) {
    if (!query?.trim()) {
      throw new BadRequestException("query parameter is required");
    }
    if (type !== "movie" && type !== "tv") {
      throw new BadRequestException('type must be "movie" or "tv"');
    }

    try {
      const trimmedQuery = query.trim();
      if (type === "movie") {
        return await this.tmdbService.searchMovie(trimmedQuery);
      } else {
        return await this.tmdbService.searchTv(trimmedQuery);
      }
    } catch (err) {
      if (err instanceof TmdbUnavailableError) {
        throw new ServiceUnavailableException(err.message);
      }
      if (err instanceof TmdbClientError) {
        throw new BadGatewayException(err.message);
      }
      throw err;
    }
  }
}
