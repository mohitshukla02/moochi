"use client";

import { useEffect, useState } from "react";
import type { Movie, SearchResult } from "@/lib/types";

export default function MovieBoard({ initial }: { initial: Movie[] }) {
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [movies, setMovies] = useState<Movie[]>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(localStorage.getItem("moochi-name") ?? "");
  }, []);

  function saveName(value: string) {
    setName(value);
    localStorage.setItem("moochi-name", value);
  }

  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResults(data.results);
      if (data.results.length === 0) {
        setError("Nothing found. Try adding the year.");
      }
    } catch {
      setError("Search is unavailable right now.");
    } finally {
      setBusy(false);
    }
  }

  async function add(result: SearchResult) {
    if (!name.trim()) {
      setError("Enter your name first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/movies", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: result.id, addedBy: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMovies([data.movie, ...movies]);
      setResults([]);
      setQuery("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add that one.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl p-4">
      <div className="sticky top-0 z-10 space-y-2 bg-neutral-950 pb-3 pt-2">
        <h1 className="text-xl font-bold">Moochi</h1>

        <input
          className="w-full rounded border border-neutral-700 bg-neutral-900 p-3"
          placeholder="Your name"
          value={name}
          onChange={(e) => saveName(e.target.value)}
        />

        <form onSubmit={search} className="flex gap-2">
          <input
            className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-900 p-3"
            placeholder="Search a movie"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-neutral-100 px-4 font-medium text-neutral-900 disabled:opacity-50"
          >
            Go
          </button>
        </form>

        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>

      {results.length > 0 && (
        <ul className="mb-6 space-y-2">
          {results.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => add(r)}
                disabled={busy}
                className="flex w-full items-center gap-3 rounded border border-neutral-800 p-2 text-left disabled:opacity-50"
              >
                <Poster src={r.poster} title={r.title} />
                <span>
                  {r.title} <span className="text-neutral-500">({r.year})</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <ul className="space-y-3">
        {movies.map((m) => (
          <li key={m.id} className="flex gap-3 border-t border-neutral-800 pt-3">
            <Poster src={m.poster} title={m.title} />
            <div className="min-w-0">
              <p className="font-medium">
                {m.title} <span className="text-neutral-500">({m.year})</span>
              </p>
              <p className="text-sm text-neutral-400">
                {[
                  m.ratings.imdb && `IMDb ${m.ratings.imdb}`,
                  m.ratings.rt && `RT ${m.ratings.rt}`,
                  m.ratings.metacritic && `MC ${m.ratings.metacritic}`,
                ]
                  .filter(Boolean)
                  .join("  ·  ") || "No ratings"}
              </p>
              <p className="text-xs text-neutral-500">
                {[m.runtime, m.director].filter(Boolean).join(" · ")}
              </p>
              <p className="mt-1 text-xs text-neutral-600">added by {m.addedBy}</p>
            </div>
          </li>
        ))}
      </ul>

      {movies.length === 0 && (
        <p className="text-neutral-500">Nothing on the list yet.</p>
      )}
    </main>
  );
}

function Poster({ src, title }: { src: string | null; title: string }) {
  if (!src) {
    return (
      <div className="flex h-[81px] w-[54px] shrink-0 items-center justify-center rounded bg-neutral-800 p-1 text-center text-[9px] text-neutral-500">
        {title}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      className="h-[81px] w-[54px] shrink-0 rounded object-cover"
    />
  );
}
