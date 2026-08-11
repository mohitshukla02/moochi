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
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [renaming, setRenaming] = useState(false);
  // Until the stored name has been read we cannot tell a first-time visitor
  // from a returning one, and guessing would flash the wrong control. `ready`
  // holds the header in a neutral state for that one render.
  const [ready, setReady] = useState(false);

  // The page is server-rendered, so localStorage cannot be read during render
  // or in a lazy useState initializer without causing a hydration mismatch
  // (server emits an empty field, client would emit the stored name). Reading
  // it in a mount effect is the correct trade-off here.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    const stored = localStorage.getItem("moochi-name") ?? "";
    setName(stored);
    setDraftName(stored);
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  function submitName(event: React.FormEvent) {
    event.preventDefault();
    const value = draftName.trim().slice(0, 40);
    if (!value) return;
    setName(value);
    localStorage.setItem("moochi-name", value);
    setRenaming(false);
    setError(null);
  }

  const askingName = ready && (!name || renaming);

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

  async function remove(movie: Movie) {
    // No undo — the row is gone from Redis. This confirm is the only guard.
    if (!window.confirm(`Remove ${movie.title}?`)) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/movies/${movie.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not remove that one.");
      }
      setMovies((current) => current.filter((m) => m.id !== movie.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove that one.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl p-4">
      <div className="sticky top-0 z-10 space-y-2 bg-neutral-950 pb-3 pt-2">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-2xl">MOOCHI</h1>
          {ready && name && !renaming && (
            <button
              type="button"
              onClick={() => {
                setDraftName(name);
                setRenaming(true);
              }}
              aria-label={`Signed in as ${name}. Change name.`}
              className="min-w-0 truncate rounded-lg border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300"
            >
              {name}
            </button>
          )}
        </div>

        {/* One control, not two: the name is asked for once and then lives in
            the header, which buys back a whole row of vertical space. The
            fixed-height shell keeps the layout from jumping on first paint,
            before the stored name has been read. */}
        <div className="min-h-[50px]">
          {askingName ? (
            <form onSubmit={submitName} className="flex gap-2">
              <input
                className="min-w-0 flex-1 rounded-lg border border-neutral-700 bg-neutral-900 p-3"
                placeholder="Your name"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                autoFocus
              />
              <button
                type="submit"
                className="rounded-lg bg-neutral-100 px-4 font-medium text-neutral-900"
              >
                Save
              </button>
            </form>
          ) : ready ? (
            <form onSubmit={search} className="flex gap-2">
              <input
                className="min-w-0 flex-1 rounded-lg border border-neutral-700 bg-neutral-900 p-3"
                placeholder="Find movie"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-neutral-100 px-4 font-medium text-neutral-900 disabled:opacity-50"
              >
                Go
              </button>
            </form>
          ) : null}
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>

      {results.length > 0 && (
        <ul className="mb-6 space-y-2">
          {results.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => add(r)}
                disabled={busy}
                className="flex w-full items-center gap-3 rounded-lg border border-neutral-800 p-2 text-left disabled:opacity-50"
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
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setEditing(!editing)}
            aria-label="Edit mode"
            aria-pressed={editing}
            className={`rounded-lg border p-2.5 ${
              editing
                ? "border-neutral-100 bg-neutral-100 text-neutral-900"
                : "border-neutral-700 text-neutral-400"
            }`}
          >
            <PencilIcon />
          </button>

          <div className="flex overflow-hidden rounded-lg border border-neutral-700">
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
      </div>

      {view === "list" ? (
        <ul className="space-y-3">
          {movies.map((m) => (
            <li key={m.id} className="flex gap-3 border-t border-neutral-800 pt-3">
              <Poster src={m.poster} title={m.title} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {m.title} <span className="text-neutral-500">({m.year})</span>
                </p>
                <p className="text-sm text-neutral-500">
                  {[m.runtime, m.director].filter(Boolean).join(" · ")}
                </p>
                <p className="mt-1 text-xs text-neutral-400">
                  <RatingBadges ratings={m.ratings} />
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  added by{" "}
                  <span className="text-neutral-200">
                    {m.addedBy}
                  </span>
                </p>
              </div>
              {editing && (
                <button
                  type="button"
                  onClick={() => remove(m)}
                  disabled={busy}
                  aria-label={`Remove ${m.title}`}
                  className="h-9 w-9 shrink-0 self-center rounded-lg border border-red-900 text-red-400 disabled:opacity-50"
                >
                  <CrossIcon />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        // 3 across is the cap — more makes posters unrecognisable on a phone.
        // Below 360px a third column leaves ~88px cells, which fit but read as
        // cramped, so narrow phones drop to 2 columns with a wider gutter.
        <ul className="grid grid-cols-2 gap-4 min-[360px]:grid-cols-3 min-[360px]:gap-3">
          {movies.map((m) => (
            <li key={m.id} className="min-w-0">
              <div className="relative">
                <Poster src={m.poster} title={m.title} variant="grid" />
                {editing && (
                  <button
                    type="button"
                    onClick={() => remove(m)}
                    disabled={busy}
                    aria-label={`Remove ${m.title}`}
                    className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-950/85 text-red-400 disabled:opacity-50"
                  >
                    <CrossIcon />
                  </button>
                )}
              </div>
              <p className="mt-1.5 truncate text-sm font-medium">{m.title}</p>
              {/* Sat next to the year rather than pushed to the far edge —
                  justify-between left a distracting gap in a narrow cell. */}
              <p className="flex items-baseline gap-2 text-xs text-neutral-500">
                <span>{m.year}</span>
                {m.runtime && <span className="shrink-0">{m.runtime}</span>}
              </p>
              {/* Two fixed slots, IMDb left and Rotten Tomatoes right, with a
                  min height so the row still occupies a line when a score is
                  missing. That is what keeps every cell the same height —
                  the earlier free-flowing version made the rows ragged. */}
              <p className="mt-0.5 flex min-h-[1.5em] items-center justify-between gap-1 text-xs text-neutral-400">
                <GridScore
                  src="/icon-imdb.png"
                  alt="IMDb"
                  size="h-[1.65em]"
                  value={m.ratings.imdb?.replace("/10", "")}
                />
                <GridScore
                  src="/icon-rottentomatoes.webp"
                  alt="Rotten Tomatoes"
                  size="h-[0.95em]"
                  value={m.ratings.rt}
                />
              </p>
              <p className="truncate text-xs text-neutral-500">
                added by <span className="text-neutral-200">{m.addedBy}</span>
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

function PencilIcon() {
  return (
    <svg {...iconProps}>
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg {...iconProps} className="mx-auto">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

// Height is per-source, not shared: the IMDb mark is a wide, short rectangle
// while the tomato is roughly square, so equal heights make IMDb read far
// smaller. These are literal class strings so Tailwind picks them up.
/**
 * One score slot in a grid cell. Renders nothing but still holds its place in
 * the flex row when the score is absent, so the two slots stay pinned left and
 * right and the cell height never changes.
 */
function GridScore({
  src,
  alt,
  size,
  value,
}: {
  src: string;
  alt: string;
  size: string;
  value: string | null | undefined;
}) {
  if (!value) return <span aria-hidden />;
  return (
    <span className="inline-flex items-center gap-1">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        title={alt}
        className={`${size} w-auto shrink-0 object-contain`}
      />
      {value}
    </span>
  );
}

type Badge = { src: string; alt: string; value: string; size: string };

/**
 * IMDb and Rotten Tomatoes only. Metacritic is still captured and stored by
 * the normalizer, it is simply not shown — deliberate, so re-enabling it is a
 * display change rather than a backfill.
 *
 * Either score can be missing: Rotten Tomatoes especially, on series and
 * older films. Icons are sized in `em` so they track the caller's font size.
 */
function RatingBadges({ ratings }: { ratings: Movie["ratings"] }) {
  const badges: Badge[] = [];
  if (ratings.imdb)
    badges.push({
      src: "/icon-imdb.png",
      alt: "IMDb",
      value: ratings.imdb,
      size: "h-[1.65em]",
    });
  if (ratings.rt)
    badges.push({
      src: "/icon-rottentomatoes.webp",
      alt: "Rotten Tomatoes",
      value: ratings.rt,
      size: "h-[0.95em]",
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
            className={`${b.size} w-auto shrink-0 object-contain`}
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
        className={`${box} flex items-center justify-center rounded-lg bg-neutral-800 p-1 text-center text-[9px] text-neutral-500`}
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
      className={`${box} rounded-lg object-cover`}
    />
  );
}
