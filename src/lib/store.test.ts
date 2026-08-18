import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Movie } from "./types";

function movie(id: string, title: string, addedBy = "Mohit"): Movie {
  return {
    id,
    title,
    year: "2008",
    poster: null,
    runtime: null,
    director: null,
    plot: null,
    ratings: { imdb: null, rt: null, metacritic: null },
    addedBy,
    addedAt: new Date().toISOString(),
    watchedBy: [],
    kind: "movie",
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  vi.stubEnv("KV_REST_API_URL", "");
  vi.stubEnv("KV_REST_API_TOKEN", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("store (in-memory fallback)", () => {
  it("addMovie then listMovies returns that movie", async () => {
    const { addMovie, listMovies } = await import("./store");
    const m = movie("tt1", "The Dark Knight");

    await addMovie(m);
    const all = await listMovies();

    expect(all).toEqual([m]);
  });

  it("listMovies returns newest first after adding two movies", async () => {
    const { addMovie, listMovies } = await import("./store");
    const first = movie("tt1", "First");
    const second = movie("tt2", "Second");

    await addMovie(first);
    await addMovie(second);
    const all = await listMovies();

    expect(all.map((m) => m.id)).toEqual(["tt2", "tt1"]);
  });

  it("hasMovie finds an added movie by id and returns null for an unknown id", async () => {
    const { addMovie, hasMovie } = await import("./store");
    const m = movie("tt1", "The Dark Knight");
    await addMovie(m);

    expect(await hasMovie("tt1")).toEqual(m);
    expect(await hasMovie("nope")).toBeNull();
  });

  it("deleteMovie removes an existing movie and returns true; movie is gone from listMovies", async () => {
    const { addMovie, deleteMovie, listMovies } = await import("./store");
    const m = movie("tt1", "The Dark Knight");
    await addMovie(m);

    const result = await deleteMovie("tt1");
    const all = await listMovies();

    expect(result).toBe(true);
    expect(all).toEqual([]);
  });

  it("deleteMovie returns false for an unknown id", async () => {
    const { deleteMovie } = await import("./store");

    expect(await deleteMovie("nope")).toBe(false);
  });

  it("listMovies returns [] when nothing has been added", async () => {
    const { listMovies } = await import("./store");

    expect(await listMovies()).toEqual([]);
  });

  it("deleteMovie removes only the target middle movie, leaving the others intact and in order", async () => {
    // Uses FOUR movies (not three) so the target's raw storage index differs
    // from its reversed/display index. With three movies the middle element
    // sits at the same index in both orderings, so a bug that fed the
    // display-order index straight into LSET (instead of converting back to
    // raw order) would coincidentally still delete the right entry and this
    // test would pass even though the code is broken. With four movies,
    // "tt2" is at raw index 1 but display index 2 -- if the implementation
    // used the wrong ordering, it would delete "tt3" instead, which this
    // test's exact-order assertion catches.
    const { addMovie, deleteMovie, listMovies } = await import("./store");
    const first = movie("tt1", "First");
    const second = movie("tt2", "Second");
    const third = movie("tt3", "Third");
    const fourth = movie("tt4", "Fourth");

    await addMovie(first);
    await addMovie(second);
    await addMovie(third);
    await addMovie(fourth);

    const result = await deleteMovie("tt2");
    const all = await listMovies();

    expect(result).toBe(true);
    expect(all.map((m) => m.id)).toEqual(["tt4", "tt3", "tt1"]);
  });

  it("deleteMovie removes the newest movie (last one added) correctly", async () => {
    const { addMovie, deleteMovie, listMovies } = await import("./store");
    const first = movie("tt1", "First");
    const second = movie("tt2", "Second");
    const third = movie("tt3", "Third");

    await addMovie(first);
    await addMovie(second);
    await addMovie(third);

    const result = await deleteMovie("tt3");
    const all = await listMovies();

    expect(result).toBe(true);
    expect(all.map((m) => m.id)).toEqual(["tt2", "tt1"]);
  });

  it("deleteMovie removes the oldest movie (first one added) correctly", async () => {
    const { addMovie, deleteMovie, listMovies } = await import("./store");
    const first = movie("tt1", "First");
    const second = movie("tt2", "Second");
    const third = movie("tt3", "Third");

    await addMovie(first);
    await addMovie(second);
    await addMovie(third);

    const result = await deleteMovie("tt1");
    const all = await listMovies();

    expect(result).toBe(true);
    expect(all.map((m) => m.id)).toEqual(["tt3", "tt2"]);
  });
});

describe("toggleWatched (in-memory fallback)", () => {
  it("adds the name on first toggle", async () => {
    const { addMovie, toggleWatched } = await import("./store");
    await addMovie(movie("tt1", "Heat"));

    const updated = await toggleWatched("tt1", "Priya");

    expect(updated?.watchedBy).toEqual(["Priya"]);
  });

  it("removes the name on second toggle", async () => {
    const { addMovie, toggleWatched } = await import("./store");
    await addMovie(movie("tt1", "Heat"));

    await toggleWatched("tt1", "Priya");
    const updated = await toggleWatched("tt1", "Priya");

    expect(updated?.watchedBy).toEqual([]);
  });

  it("treats differing case as the same person", async () => {
    const { addMovie, toggleWatched } = await import("./store");
    await addMovie(movie("tt1", "Heat"));

    await toggleWatched("tt1", "Priya");
    const updated = await toggleWatched("tt1", "pRIYA");

    expect(updated?.watchedBy).toEqual([]);
  });

  it("stores the casing the person actually typed", async () => {
    const { addMovie, toggleWatched } = await import("./store");
    await addMovie(movie("tt1", "Heat"));

    const updated = await toggleWatched("tt1", "pRIYA");

    expect(updated?.watchedBy).toEqual(["pRIYA"]);
  });

  it("keeps separate people independent", async () => {
    const { addMovie, toggleWatched } = await import("./store");
    await addMovie(movie("tt1", "Heat"));

    await toggleWatched("tt1", "Priya");
    await toggleWatched("tt1", "Mohit");
    const updated = await toggleWatched("tt1", "Priya");

    expect(updated?.watchedBy).toEqual(["Mohit"]);
  });

  it("persists to the list and leaves other movies untouched", async () => {
    const { addMovie, toggleWatched, listMovies } = await import("./store");
    await addMovie(movie("tt1", "Heat"));
    await addMovie(movie("tt2", "Collateral"));

    await toggleWatched("tt2", "Ada");
    const all = await listMovies();

    expect(all.find((m) => m.id === "tt2")?.watchedBy).toEqual(["Ada"]);
    expect(all.find((m) => m.id === "tt1")?.watchedBy).toEqual([]);
  });

  it("returns null for an unknown movie", async () => {
    const { toggleWatched } = await import("./store");
    expect(await toggleWatched("nope", "Priya")).toBeNull();
  });

  it("defaults watchedBy for records written before the field existed", async () => {
    const { addMovie, listMovies, toggleWatched } = await import("./store");
    // Simulate a legacy record by stripping the field before it is stored.
    const legacy = movie("tt9", "Legacy") as Partial<Movie>;
    delete legacy.watchedBy;
    await addMovie(legacy as Movie);

    const all = await listMovies();
    expect(all[0].watchedBy).toEqual([]);

    const updated = await toggleWatched("tt9", "Priya");
    expect(updated?.watchedBy).toEqual(["Priya"]);
  });
});


describe("kind defaulting", () => {
  it("treats records written before shows existed as films", async () => {
    const { addMovie, listMovies } = await import("./store");
    const legacy = movie("tt9", "Legacy") as Partial<Movie>;
    delete legacy.kind;

    await addMovie(legacy as Movie);
    const all = await listMovies();

    expect(all[0].kind).toBe("movie");
  });

  it("preserves an explicit series kind", async () => {
    const { addMovie, listMovies } = await import("./store");
    await addMovie({ ...movie("tt8", "Breaking Bad"), kind: "series" });

    const all = await listMovies();

    expect(all[0].kind).toBe("series");
  });
});
