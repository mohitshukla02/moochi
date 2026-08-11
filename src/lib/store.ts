import { Redis } from "@upstash/redis";
import type { Movie } from "./types";

const MOVIES_KEY = "movies";

// --- Backend abstraction ------------------------------------------------
//
// Chooses Upstash when configured, in-memory otherwise.
// The in-memory store is per-process and dies on restart — it exists so the
// app is runnable before the Upstash integration is installed. It must never
// be mistaken for real persistence.

interface StoreBackend {
  rpush(key: string, value: string): Promise<unknown>;
  lrange(key: string, start: number, stop: number): Promise<unknown[]>;
  lrem(key: string, count: number, value: string): Promise<number>;
  lset(key: string, index: number, value: string): Promise<unknown>;
}

class InMemoryBackend implements StoreBackend {
  private lists = new Map<string, string[]>();

  async rpush(key: string, value: string): Promise<unknown> {
    const list = this.lists.get(key) ?? [];
    list.push(value);
    this.lists.set(key, list);
    return list.length;
  }

  async lrange(key: string): Promise<unknown[]> {
    return [...(this.lists.get(key) ?? [])];
  }

  async lrem(key: string, count: number, value: string): Promise<number> {
    const list = this.lists.get(key) ?? [];
    const index = list.indexOf(value);
    if (index === -1) return 0;
    list.splice(index, 1);
    this.lists.set(key, list);
    return 1;
  }

  async lset(key: string, index: number, value: string): Promise<unknown> {
    const list = this.lists.get(key) ?? [];
    if (index < 0 || index >= list.length) {
      throw new Error("index out of range");
    }
    list[index] = value;
    this.lists.set(key, list);
    return "OK";
  }
}

class UpstashBackend implements StoreBackend {
  private client: Redis;

  constructor(url: string, token: string) {
    this.client = new Redis({ url, token });
  }

  async rpush(key: string, value: string): Promise<unknown> {
    return this.client.rpush(key, value);
  }

  async lrange(key: string, start: number, stop: number): Promise<unknown[]> {
    return this.client.lrange(key, start, stop);
  }

  async lrem(key: string, count: number, value: string): Promise<number> {
    return this.client.lrem(key, count, value);
  }

  async lset(key: string, index: number, value: string): Promise<unknown> {
    return this.client.lset(key, index, value);
  }
}

let backend: StoreBackend | null = null;

function getBackend(): StoreBackend {
  if (backend) return backend;

  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  const url = upstashUrl || kvUrl;
  const token = upstashToken || kvToken;

  if (url && token) {
    backend = new UpstashBackend(url, token);
  } else {
    console.warn(
      "[moochi] No Upstash credentials found — using in-memory store. Data will be lost on restart."
    );
    backend = new InMemoryBackend();
  }

  return backend;
}

// --- Public API ----------------------------------------------------------

// Returns list entries in RAW storage order (oldest first — the order they
// were RPUSHed in). listMovies() reverses this for display (newest first);
// deleteMovie() needs the raw order because LSET/LREM operate on indices
// into the underlying Redis list, not the reversed, display-facing order.
// Mixing the two orderings up would delete the wrong movie.
async function listRaw(): Promise<{ movie: Movie; raw: string }[]> {
  const entries = await getBackend().lrange(MOVIES_KEY, 0, -1);
  return entries.map((entry) => {
    // @upstash/redis auto-deserializes JSON on read depending on version, so
    // lrange may hand back objects OR strings. Handle both.
    const movie = (
      typeof entry === "string" ? JSON.parse(entry) : entry
    ) as Movie;
    const raw = typeof entry === "string" ? entry : JSON.stringify(entry);

    // watchedBy was added after the first records were written. Filling it in
    // here means no backfill and no undefined checks anywhere downstream.
    return { movie: { ...movie, watchedBy: movie.watchedBy ?? [] }, raw };
  });
}

export async function listMovies(): Promise<Movie[]> {
  const entries = await listRaw();
  return entries.map((e) => e.movie).reverse();
}

export async function addMovie(movie: Movie): Promise<Movie> {
  await getBackend().rpush(MOVIES_KEY, JSON.stringify(movie));
  return movie;
}

export async function hasMovie(id: string): Promise<Movie | null> {
  const movies = await listMovies();
  return movies.find((m) => m.id === id) ?? null;
}

/**
 * Adds or removes `name` from a movie's watchedBy list and returns the updated
 * movie, or null if the movie is gone. Names are compared case-insensitively,
 * so "mohit" and "Mohit" are the same person, but the casing the person typed
 * is what gets stored.
 *
 * Read-modify-write: if two people toggle the same movie in the same instant
 * one update can be lost. At five users that is not worth a lock.
 */
export async function toggleWatched(
  id: string,
  name: string
): Promise<Movie | null> {
  const entries = await listRaw();
  const index = entries.findIndex((e) => e.movie.id === id);
  if (index === -1) return null;

  const movie = entries[index].movie;
  const already = movie.watchedBy.some(
    (n) => n.toLowerCase() === name.toLowerCase()
  );
  const watchedBy = already
    ? movie.watchedBy.filter((n) => n.toLowerCase() !== name.toLowerCase())
    : [...movie.watchedBy, name];

  const updated = { ...movie, watchedBy };
  // Index is into the RAW list, which is what LSET expects.
  await getBackend().lset(MOVIES_KEY, index, JSON.stringify(updated));
  return updated;
}

const DELETE_SENTINEL = "__moochi_deleted__";

export async function deleteMovie(id: string): Promise<boolean> {
  const entries = await listRaw();
  const index = entries.findIndex((e) => e.movie.id === id);
  if (index === -1) return false;

  // Index-based deletion avoids relying on a byte-for-byte match between a
  // re-serialized object and what's actually stored in Redis (which may not
  // match, e.g. due to key ordering or auto-deserialization). We overwrite
  // the target slot with a sentinel value, then LREM that unique sentinel.
  await getBackend().lset(MOVIES_KEY, index, DELETE_SENTINEL);
  const removed = await getBackend().lrem(MOVIES_KEY, 1, DELETE_SENTINEL);
  return removed > 0;
}
