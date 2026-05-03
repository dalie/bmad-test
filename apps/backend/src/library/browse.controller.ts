import {
  Controller,
  Get,
  Param,
  Query,
  NotFoundException,
  ParseIntPipe,
  DefaultValuePipe,
} from "@nestjs/common";
import {
  BrowseService,
  MovieListItem,
  ShowListItem,
  MovieDetail,
  ShowDetail,
  RecentItem,
} from "./browse.service";

@Controller("library")
export class BrowseController {
  constructor(private readonly browseService: BrowseService) {}

  @Get("movies")
  getMovies(): MovieListItem[] {
    return this.browseService.getMovies();
  }

  @Get("shows")
  getShows(): ShowListItem[] {
    return this.browseService.getShows();
  }

  @Get("recent")
  getRecent(
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ): RecentItem[] {
    return this.browseService.getRecent(limit);
  }

  @Get("search")
  search(@Query("q") q: string = ""): RecentItem[] {
    return this.browseService.search(q ?? "");
  }

  @Get("movies/:id")
  getMovie(@Param("id", ParseIntPipe) id: number): MovieDetail {
    const result = this.browseService.getMovieById(id);
    if (!result) throw new NotFoundException(`Movie with id ${id} not found`);
    return result;
  }

  @Get("shows/:id")
  getShow(@Param("id", ParseIntPipe) id: number): ShowDetail {
    const result = this.browseService.getShowById(id);
    if (!result)
      throw new NotFoundException(`Show not found`);
    return result;
  }
}
