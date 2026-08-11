import type { OmdbRating, Ratings } from "./types";

const SOURCE_MAP: Record<string, keyof Ratings> = {
  "Internet Movie Database": "imdb",
  "Rotten Tomatoes": "rt",
  Metacritic: "metacritic",
};

/**
 * OMDb's Ratings array -> a flat object with a stable shape.
 *
 * Every field is independently nullable: Rotten Tomatoes in particular is
 * missing on series and obscure titles. Unknown sources are ignored rather
 * than dropped into the object, so adding a source upstream cannot break
 * callers.
 *
 * The Source strings are matched literally and are verified against the live
 * API (see docs/omdb-sample.json). If OMDb ever renames one, every movie
 * silently loses that rating — that is why the tests pin the exact strings.
 */
export function normalizeRatings(ratings: OmdbRating[] | undefined): Ratings {
  const out: Ratings = { imdb: null, rt: null, metacritic: null };
  if (!ratings) return out;

  for (const { Source, Value } of ratings) {
    const key = Object.hasOwn(SOURCE_MAP, Source) ? SOURCE_MAP[Source] : undefined;
    if (!key) continue;
    if (!Value || Value === "N/A") continue;
    out[key] = Value;
  }

  return out;
}

/** OMDb writes "N/A" instead of omitting fields. Turn that into null. */
export function nullIfNA(value: string | undefined): string | null {
  if (!value || value === "N/A") return null;
  return value;
}
