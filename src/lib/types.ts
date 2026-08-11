export type Ratings = {
  imdb: string | null;
  rt: string | null;
  metacritic: string | null;
};

export type Movie = {
  id: string;
  title: string;
  year: string;
  poster: string | null;
  runtime: string | null;
  director: string | null;
  plot: string | null;
  ratings: Ratings;
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
  Ratings?: OmdbRating[];
};

export type OmdbSearchResponse = {
  Response: string;
  Error?: string;
  Search?: { imdbID: string; Title: string; Year: string; Poster: string }[];
};
