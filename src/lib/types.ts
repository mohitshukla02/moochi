export type Ratings = {
  imdb: string | null;
  rt: string | null;
  metacritic: string | null;
};

export type Kind = "movie" | "series";

export type Movie = {
  id: string;
  /**
   * Films and shows share one list, separated by a tab in the UI. Optional
   * because records written before shows existed lack it — the store defaults
   * them to "movie" on read, so no backfill is needed.
   */
  kind?: Kind;
  /** Series only. */
  totalSeasons?: string | null;
  title: string;
  year: string;
  poster: string | null;
  runtime: string | null;
  director: string | null;
  plot: string | null;
  ratings: Ratings;
  /**
   * Extra OMDb detail, shown in the movie modal. Optional because records
   * written before these were captured do not have them — the backfill route
   * fills them in, and the UI simply omits whatever is still missing.
   */
  genre?: string | null;
  actors?: string | null;
  writer?: string | null;
  rated?: string | null;
  released?: string | null;
  awards?: string | null;
  boxOffice?: string | null;
  country?: string | null;
  language?: string | null;
  addedBy: string;
  addedAt: string;
  /**
   * Names of people who have marked this watched. There are no accounts — the
   * name typed into the header IS the identity, matched case-insensitively.
   * Records written before this field existed lack it, so the store fills in
   * an empty array on read rather than requiring a backfill.
   */
  watchedBy: string[];
};

export type SearchResult = {
  id: string;
  title: string;
  year: string;
  poster: string | null;
};

export type OmdbRating = { Source: string; Value: string };

export type OmdbMovie = {
  Response: string;
  Error?: string;
  imdbID: string;
  Title: string;
  Year: string;
  Poster: string;
  Runtime: string;
  Director: string;
  Plot: string;
  Genre: string;
  Actors: string;
  Writer: string;
  Rated: string;
  Released: string;
  Awards: string;
  BoxOffice: string;
  Country: string;
  Language: string;
  Type?: string;
  totalSeasons?: string;
  Ratings?: OmdbRating[];
};

export type OmdbSearchResponse = {
  Response: string;
  Error?: string;
  Search?: { imdbID: string; Title: string; Year: string; Poster: string }[];
};
