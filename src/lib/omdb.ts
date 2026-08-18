import { normalizeRatings, nullIfNA } from "./ratings";
import type { OmdbMovie, OmdbSearchResponse, SearchResult } from "./types";

const BASE = "https://www.omdbapi.com/";

function apiKey(): string {
  const key = process.env.OMDB_API_KEY;
  if (!key) throw new Error("OMDB_API_KEY is not set");
  return key;
}

/**
 * All OMDb traffic goes through here. Errors deliberately never include the
 * request URL, because the URL carries the API key and these messages end up
 * in server logs.
 */
async function get<T>(params: Record<string, string>): Promise<T> {
  const url = new URL(BASE);
  url.searchParams.set("apikey", apiKey());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`OMDb returned HTTP ${res.status}`);
  return (await res.json()) as T;
}

/**
 * Thin search results. Carries no ratings — OMDb's search endpoint does not
 * return them, which is why selecting a result triggers fetchMovie.
 *
 * OMDb refuses queries that match too much with "Too many results" rather than
 * returning a truncated list, which is how a real film like "42" or "9" came
 * back empty. When that happens we retry against the exact-title endpoint,
 * which resolves those to the obvious film.
 */
export async function searchTitles(query: string): Promise<SearchResult[]> {
  const data = await get<OmdbSearchResponse>({ s: query, type: "movie" });

  if (data.Response !== "True" || !data.Search) {
    if (isTooBroad(data.Error)) return exactTitle(query);
    return [];
  }

  return data.Search.map((r) => ({
    id: r.imdbID,
    title: r.Title,
    year: r.Year,
    poster: nullIfNA(r.Poster),
  }));
}

/** OMDb's way of saying the query matched too much to list. */
function isTooBroad(error: string | undefined): boolean {
  return (error ?? "").toLowerCase().includes("too many results");
}

/**
 * Exact-title lookup, used only as a fallback. Returns at most one result, or
 * an empty array if even the exact title finds nothing.
 */
async function exactTitle(query: string): Promise<SearchResult[]> {
  const data = await get<OmdbMovie>({ t: query, type: "movie" });
  if (data.Response !== "True") return [];

  return [
    {
      id: data.imdbID,
      title: data.Title,
      year: data.Year,
      poster: nullIfNA(data.Poster),
    },
  ];
}

/** Full record for one title, with ratings normalized. */
export async function fetchMovie(imdbId: string) {
  const data = await get<OmdbMovie>({ i: imdbId, plot: "short" });
  if (data.Response !== "True") {
    throw new Error(data.Error ?? "OMDb lookup failed");
  }

  return {
    id: data.imdbID,
    title: data.Title,
    year: data.Year,
    poster: nullIfNA(data.Poster),
    runtime: nullIfNA(data.Runtime),
    director: nullIfNA(data.Director),
    plot: nullIfNA(data.Plot),
    ratings: normalizeRatings(data.Ratings),
    genre: nullIfNA(data.Genre),
    actors: nullIfNA(data.Actors),
    writer: nullIfNA(data.Writer),
    rated: nullIfNA(data.Rated),
    released: nullIfNA(data.Released),
    awards: nullIfNA(data.Awards),
    boxOffice: nullIfNA(data.BoxOffice),
    country: nullIfNA(data.Country),
    language: nullIfNA(data.Language),
  };
}
