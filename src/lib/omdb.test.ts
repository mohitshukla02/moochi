import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchMovie, searchTitles } from "./omdb";

function mockFetch(payload: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => payload,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("fetchMovie", () => {
  it("maps an OMDb record onto a Movie with normalized ratings", async () => {
    vi.stubEnv("OMDB_API_KEY", "testkey");
    vi.stubGlobal(
      "fetch",
      mockFetch({
        Response: "True",
        imdbID: "tt0468569",
        Title: "The Dark Knight",
        Year: "2008",
        Poster: "https://example.com/p.jpg",
        Runtime: "152 min",
        Director: "Christopher Nolan",
        Plot: "When the menace known as the Joker...",
        Ratings: [
          { Source: "Internet Movie Database", Value: "9.0/10" },
          { Source: "Rotten Tomatoes", Value: "94%" },
        ],
      })
    );

    const movie = await fetchMovie("tt0468569");

    expect(movie).toEqual({
      id: "tt0468569",
      title: "The Dark Knight",
      year: "2008",
      poster: "https://example.com/p.jpg",
      runtime: "152 min",
      director: "Christopher Nolan",
      plot: "When the menace known as the Joker...",
      ratings: { imdb: "9.0/10", rt: "94%", metacritic: null },
      // Absent from this payload, so they normalize to null rather than
      // undefined — the modal treats both as "omit", but null is what actually
      // gets written to storage.
      genre: null,
      actors: null,
      writer: null,
      rated: null,
      released: null,
      awards: null,
      boxOffice: null,
      country: null,
      language: null,
    });
  });

  it("maps the extra detail fields when present", async () => {
    vi.stubEnv("OMDB_API_KEY", "testkey");
    vi.stubGlobal(
      "fetch",
      mockFetch({
        Response: "True",
        imdbID: "tt0468569",
        Title: "The Dark Knight",
        Year: "2008",
        Poster: "N/A",
        Runtime: "152 min",
        Director: "Christopher Nolan",
        Plot: "N/A",
        Genre: "Action, Crime, Drama",
        Actors: "Christian Bale, Heath Ledger, Aaron Eckhart",
        Writer: "Jonathan Nolan, Christopher Nolan",
        Rated: "PG-13",
        Released: "18 Jul 2008",
        Awards: "Won 2 Oscars. 163 wins & 165 nominations total",
        BoxOffice: "$534,987,076",
        Country: "United States, United Kingdom",
        Language: "N/A",
      })
    );

    const movie = await fetchMovie("tt0468569");

    expect(movie.genre).toBe("Action, Crime, Drama");
    expect(movie.actors).toBe("Christian Bale, Heath Ledger, Aaron Eckhart");
    expect(movie.rated).toBe("PG-13");
    expect(movie.boxOffice).toBe("$534,987,076");
    // "N/A" is OMDb's way of omitting a field.
    expect(movie.language).toBeNull();
  });

  it("converts N/A fields to null", async () => {
    vi.stubEnv("OMDB_API_KEY", "testkey");
    vi.stubGlobal(
      "fetch",
      mockFetch({
        Response: "True",
        imdbID: "tt1",
        Title: "Obscure",
        Year: "1970",
        Poster: "N/A",
        Runtime: "N/A",
        Director: "N/A",
        Plot: "N/A",
      })
    );

    const movie = await fetchMovie("tt1");

    expect(movie.poster).toBeNull();
    expect(movie.runtime).toBeNull();
    expect(movie.director).toBeNull();
    expect(movie.ratings).toEqual({ imdb: null, rt: null, metacritic: null });
  });

  it("throws when OMDb reports an error", async () => {
    vi.stubEnv("OMDB_API_KEY", "testkey");
    vi.stubGlobal(
      "fetch",
      mockFetch({ Response: "False", Error: "Incorrect IMDb ID." })
    );

    await expect(fetchMovie("nope")).rejects.toThrow("Incorrect IMDb ID.");
  });

  it("throws when the API key is missing", async () => {
    vi.stubEnv("OMDB_API_KEY", "");
    vi.stubGlobal("fetch", mockFetch({ Response: "True" }));

    await expect(fetchMovie("tt1")).rejects.toThrow("OMDB_API_KEY");
  });

  it("throws on a non-ok HTTP response", async () => {
    vi.stubEnv("OMDB_API_KEY", "testkey");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) })
    );

    await expect(fetchMovie("tt1")).rejects.toThrow("503");
  });

  it("never puts the api key in the thrown message", async () => {
    vi.stubEnv("OMDB_API_KEY", "supersecret");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    );

    await expect(fetchMovie("tt1")).rejects.toThrow(
      expect.not.stringContaining("supersecret")
    );
  });
});

describe("searchTitles", () => {
  it("returns thin results", async () => {
    vi.stubEnv("OMDB_API_KEY", "testkey");
    vi.stubGlobal(
      "fetch",
      mockFetch({
        Response: "True",
        Search: [
          {
            imdbID: "tt0372784",
            Title: "Batman Begins",
            Year: "2005",
            Poster: "https://example.com/b.jpg",
          },
          {
            imdbID: "tt0096895",
            Title: "Batman",
            Year: "1989",
            Poster: "N/A",
          },
        ],
      })
    );

    expect(await searchTitles("batman")).toEqual([
      {
        id: "tt0372784",
        title: "Batman Begins",
        year: "2005",
        poster: "https://example.com/b.jpg",
      },
      { id: "tt0096895", title: "Batman", year: "1989", poster: null },
    ]);
  });

  it("returns an empty array when OMDb finds nothing", async () => {
    vi.stubEnv("OMDB_API_KEY", "testkey");
    vi.stubGlobal(
      "fetch",
      mockFetch({ Response: "False", Error: "Movie not found!" })
    );

    expect(await searchTitles("zzzzqqq")).toEqual([]);
  });

  it("requests only movies", async () => {
    vi.stubEnv("OMDB_API_KEY", "testkey");
    const spy = mockFetch({ Response: "True", Search: [] });
    vi.stubGlobal("fetch", spy);

    await searchTitles("batman");

    const url = String(spy.mock.calls[0][0]);
    expect(url).toContain("type=movie");
    expect(url).toContain("s=batman");
  });
});
