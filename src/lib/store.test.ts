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
});
