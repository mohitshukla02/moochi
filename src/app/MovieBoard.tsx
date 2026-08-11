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
  const [view, setView] = useState<"list" | "grid">("list");

  // The page is server-rendered, so localStorage cannot be read during render
  // or in a lazy useState initializer without causing a hydration mismatch
  // (server emits an empty field, client would emit the stored name). Reading
  // it in a mount effect is the correct trade-off here: one extra render on
  // load, and the field fills in immediately.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
        <h1 className="flex items-center gap-2 font-display text-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/moochi-icon.png" alt="" className="h-7 w-7 shrink-0" />
          Moochi
        </h1>

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

      <div className="mb-3 flex items-end justify-between gap-3 border-b border-neutral-800 pb-2">
        <div>
          <h2 className="font-tight text-lg font-semibold">Must watch</h2>
          <p className="text-xs text-neutral-500">
            {movies.length} {movies.length === 1 ? "title" : "titles"}
          </p>
        </div>
        <div className="flex shrink-0 overflow-hidden rounded border border-neutral-700">
          <ViewButton
            active={view === "list"}
            onClick={() => setView("list")}
            label="List view"
          >
            <ListIcon />
          </ViewButton>
          <ViewButton
            active={view === "grid"}
            onClick={() => setView("grid")}
            label="Grid view"
          >
            <GridIcon />
          </ViewButton>
        </div>
      </div>

      {view === "list" ? (
        <ul className="space-y-3">
          {movies.map((m) => (
            <li key={m.id} className="flex gap-3 border-t border-neutral-800 pt-3">
              <Poster src={m.poster} title={m.title} />
              <div className="min-w-0">
                <p className="font-medium">
                  {m.title} <span className="text-neutral-500">({m.year})</span>
                </p>
                <p className="text-sm text-neutral-400">
                  <RatingBadges ratings={m.ratings} />
                </p>
                <p className="text-xs text-neutral-500">
                  {[m.runtime, m.director].filter(Boolean).join(" · ")}
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  added by{" "}
                  <span className="text-neutral-200">
                    {m.addedBy}
                  </span>
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        // Capped at 3 across at every width — more than that makes posters
        // too small to recognise on a phone.
        <ul className="grid grid-cols-3 gap-3">
          {movies.map((m) => (
            <li key={m.id} className="min-w-0">
              <Poster src={m.poster} title={m.title} variant="grid" />
              <p className="mt-1.5 truncate text-sm font-medium">{m.title}</p>
              <p className="text-xs text-neutral-500">{m.year}</p>
              <p className="mt-0.5 text-xs text-neutral-400">
                <RatingBadges ratings={m.ratings} />
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                added by{" "}
                <span className="text-neutral-200">
                  {m.addedBy}
                </span>
              </p>
            </li>
          ))}
        </ul>
      )}

      {movies.length === 0 && (
        <p className="text-neutral-500">Nothing on the list yet.</p>
      )}
    </main>
  );
}

function ViewButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      // p-2.5 keeps the tap target around 40px, which is the floor for thumbs.
      className={`p-2.5 ${
        active
          ? "bg-neutral-100 text-neutral-900"
          : "bg-transparent text-neutral-400"
      }`}
    >
      {children}
    </button>
  );
}

const iconProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function ListIcon() {
  return (
    <svg {...iconProps}>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg {...iconProps}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

type Badge = { src: string; alt: string; value: string };

/**
 * Whichever of the three ratings exist, each with its source's logo. Any of
 * them can be missing — Rotten Tomatoes especially, on series and older films.
 * Icons are sized in `em` so they track whatever font size the caller sets.
 */
function RatingBadges({ ratings }: { ratings: Movie["ratings"] }) {
  const badges: Badge[] = [];
  if (ratings.imdb)
    badges.push({ src: "/icon-imdb.png", alt: "IMDb", value: ratings.imdb });
  if (ratings.rt)
    badges.push({
      src: "/icon-rottentomatoes.png",
      alt: "Rotten Tomatoes",
      value: ratings.rt,
    });
  if (ratings.metacritic)
    badges.push({
      src: "/icon-metacritic.png",
      alt: "Metacritic",
      value: ratings.metacritic,
    });

  if (badges.length === 0) {
    return <span className="text-neutral-500">No ratings</span>;
  }

  return (
    <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      {badges.map((b) => (
        <span key={b.alt} className="inline-flex items-center gap-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={b.src}
            alt={b.alt}
            title={b.alt}
            className="h-[1.1em] w-auto shrink-0 object-contain"
          />
          {b.value}
        </span>
      ))}
    </span>
  );
}

function Poster({
  src,
  title,
  variant = "row",
}: {
  src: string | null;
  title: string;
  variant?: "row" | "grid";
}) {
  // Row: a fixed thumbnail beside text. Grid: fills its cell at poster ratio.
  const box =
    variant === "grid"
      ? "w-full aspect-[2/3]"
      : "h-[81px] w-[54px] shrink-0";

  if (!src) {
    return (
      <div
        className={`${box} flex items-center justify-center rounded bg-neutral-800 p-1 text-center text-[9px] text-neutral-500`}
      >
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
      className={`${box} rounded object-cover`}
    />
  );
}
