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

export async function listMovies(): Promise<Movie[]> {
  const entries = await getBackend().lrange(MOVIES_KEY, 0, -1);
  const movies = entries.map((entry) =>
    // @upstash/redis auto-deserializes JSON on read depending on version, so
    // lrange may hand back objects OR strings. Handle both.
    typeof entry === "string" ? (JSON.parse(entry) as Movie) : (entry as Movie)
  );
  return movies.reverse();
}

export async function addMovie(movie: Movie): Promise<Movie> {
  await getBackend().rpush(MOVIES_KEY, JSON.stringify(movie));
  return movie;
}

export async function hasMovie(id: string): Promise<Movie | null> {
  const movies = await listMovies();
  return movies.find((m) => m.id === id) ?? null;
}

export async function deleteMovie(id: string): Promise<boolean> {
  const movies = await listMovies();
  const target = movies.find((m) => m.id === id);
  if (!target) return false;

  const removed = await getBackend().lrem(MOVIES_KEY, 1, JSON.stringify(target));
  return removed > 0;
}
