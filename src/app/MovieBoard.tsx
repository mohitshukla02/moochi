"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Movie, SearchResult } from "@/lib/types";

type Sort = "added" | "year-desc" | "year-asc" | "rating-desc";

const SORT_LABELS: Record<Sort, string> = {
  added: "Recently added",
  "year-desc": "Newest first",
  "year-asc": "Oldest first",
  "rating-desc": "Highest rated",
};

/** IMDb score as a number. Null/unparseable becomes NaN so it can sort last. */
function imdbScore(m: Movie): number {
  return m.ratings.imdb ? parseFloat(m.ratings.imdb) : NaN;
}

function yearOf(m: Movie): number {
  return parseInt(m.year, 10);
}

/**
 * Sorts descending or ascending on a numeric key, always pushing entries with
 * no value to the bottom rather than letting them pile up at one end. A film
 * with no IMDb score should not lead "highest rated" in either direction.
 */
function by(key: (m: Movie) => number, direction: "asc" | "desc") {
  return (a: Movie, b: Movie) => {
    const x = key(a);
    const y = key(b);
    const xMissing = Number.isNaN(x);
    const yMissing = Number.isNaN(y);
    if (xMissing && yMissing) return 0;
    if (xMissing) return 1;
    if (yMissing) return -1;
    return direction === "desc" ? y - x : x - y;
  };
}

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
  const [sort, setSort] = useState<Sort>("added");
  const [detail, setDetail] = useState<Movie | null>(null);

  // "added" is the server's own order (newest first), so it needs no sorting.
  // Sort on a copy — reversing state in place would mutate it.
  const sorted = useMemo(() => {
    switch (sort) {
      case "year-desc":
        return [...movies].sort(by(yearOf, "desc"));
      case "year-asc":
        return [...movies].sort(by(yearOf, "asc"));
      case "rating-desc":
        return [...movies].sort(by(imdbScore, "desc"));
      default:
        return movies;
    }
  }, [movies, sort]);

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

  /** True if the person currently using this browser has watched `movie`. */
  function haveWatched(movie: Movie): boolean {
    return movie.watchedBy.some(
      (n) => n.toLowerCase() === name.trim().toLowerCase()
    );
  }

  async function toggleWatched(movie: Movie) {
    if (!name.trim()) {
      setError("Enter your name first.");
      return;
    }
    setError(null);

    // Optimistic: flip it locally so the tap feels instant, then reconcile
    // with whatever the server actually stored.
    const optimistic = haveWatched(movie)
      ? movie.watchedBy.filter(
          (n) => n.toLowerCase() !== name.trim().toLowerCase()
        )
      : [...movie.watchedBy, name.trim()];
    setMovies((current) =>
      current.map((m) =>
        m.id === movie.id ? { ...m, watchedBy: optimistic } : m
      )
    );

    try {
      const res = await fetch(`/api/movies/${movie.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMovies((current) =>
        current.map((m) => (m.id === movie.id ? data.movie : m))
      );
    } catch (err) {
      // Put it back the way it was.
      setMovies((current) =>
        current.map((m) =>
          m.id === movie.id ? { ...m, watchedBy: movie.watchedBy } : m
        )
      );
      setError(err instanceof Error ? err.message : "Could not update that one.");
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
      <div className="sticky top-0 z-20 space-y-2 bg-neutral-950 pb-3 pt-2">
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
            before the stored name has been read. `relative` anchors the search
            results overlay below it. */}
        <div className="relative min-h-[50px]">
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
                onKeyDown={(e) => e.key === "Escape" && setResults([])}
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

          {/* Results float over the page rather than pushing it down — the
              list underneath is the thing you are adding to, so shoving it
              off screen to show candidates is backwards. */}
          {results.length > 0 && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setResults([])}
                aria-hidden
              />
              <ul className="absolute left-0 right-0 top-full z-40 mt-2 max-h-[60vh] space-y-2 overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-950 p-2 shadow-2xl">
                {results.map((r) => (
                  <li key={r.id}>
                    <button
                      onClick={() => add(r)}
                      disabled={busy}
                      className="flex w-full items-center gap-3 rounded-lg border border-neutral-800 p-2 text-left disabled:opacity-50"
                    >
                      <Poster src={r.poster} title={r.title} />
                      <span className="min-w-0">
                        {r.title}{" "}
                        <span className="text-neutral-500">({r.year})</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>

      <div className="mb-3 flex items-end justify-between gap-3 border-b border-neutral-800 pb-2">
        <div>
          <h2 className="font-tight text-lg font-semibold">Must watch</h2>
          {/* Sort sits on the count line rather than in its own row, to keep
              the header from growing back the space it just gave up. */}
          <p className="flex items-center gap-1.5 text-xs text-neutral-500">
            <span className="shrink-0">
              {movies.length} {movies.length === 1 ? "title" : "titles"}
            </span>
            <span aria-hidden>·</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              aria-label="Sort movies"
              className="min-w-0 cursor-pointer rounded-lg bg-transparent text-neutral-300"
            >
              {(Object.keys(SORT_LABELS) as Sort[]).map((key) => (
                <option key={key} value={key} className="bg-neutral-900">
                  {SORT_LABELS[key]}
                </option>
              ))}
            </select>
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
          {sorted.map((m) => (
            <li key={m.id} className="flex gap-3 border-t border-neutral-800 pt-3">
              <button
                type="button"
                onClick={() => setDetail(m)}
                aria-label={`Details for ${m.title}`}
                className="shrink-0"
              >
                <Poster src={m.poster} title={m.title} />
              </button>
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  <button
                    type="button"
                    onClick={() => setDetail(m)}
                    className="text-left underline-offset-2 hover:underline"
                  >
                    {m.title}
                  </button>{" "}
                  <span className="text-neutral-500">({m.year})</span>
                </p>
                <p className="text-sm text-neutral-500">
                  {[m.runtime, m.director].filter(Boolean).join(" · ")}
                </p>
                <p className="mt-1 text-xs text-neutral-400">
                  <RatingBadges ratings={m.ratings} />
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  added by{" "}
                  <span className="text-neutral-200">{m.addedBy}</span>
                  {m.watchedBy.length > 0 && (
                    <>
                      {" · watched by "}
                      <span className="text-neutral-200">
                        {m.watchedBy.join(", ")}
                      </span>
                    </>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 self-center">
                <WatchedButton
                  watched={haveWatched(m)}
                  title={m.title}
                  onClick={() => toggleWatched(m)}
                />
                {editing && (
                  <button
                    type="button"
                    onClick={() => remove(m)}
                    disabled={busy}
                    aria-label={`Remove ${m.title}`}
                    className="h-9 w-9 rounded-lg border border-red-900 text-red-400 disabled:opacity-50"
                  >
                    <CrossIcon />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        // 3 across is the cap — more makes posters unrecognisable on a phone.
        // Below 360px a third column leaves ~88px cells, which fit but read as
        // cramped, so narrow phones drop to 2 columns with a wider gutter.
        <ul className="grid grid-cols-2 gap-4 min-[360px]:grid-cols-3 min-[360px]:gap-3">
          {sorted.map((m) => (
            <li key={m.id} className="min-w-0">
              <div className="relative">
                {/* The overlay buttons are siblings, not children, so tapping
                    them does not also open the modal. */}
                <button
                  type="button"
                  onClick={() => setDetail(m)}
                  aria-label={`Details for ${m.title}`}
                  className="block w-full"
                >
                  <Poster src={m.poster} title={m.title} variant="grid" />
                </button>
                {/* Overlaid on the poster rather than added as another text
                    row, so marking watched cannot change the cell height. */}
                <button
                  type="button"
                  onClick={() => toggleWatched(m)}
                  aria-label={`${haveWatched(m) ? "Unmark" : "Mark"} ${m.title} watched`}
                  aria-pressed={haveWatched(m)}
                  className={`absolute bottom-1 left-1 flex h-8 w-8 items-center justify-center rounded-lg ${
                    haveWatched(m)
                      ? "bg-neutral-900/90 text-white"
                      : "bg-neutral-950/85 text-neutral-600"
                  }`}
                >
                  <CheckIcon />
                </button>
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
              <button
                type="button"
                onClick={() => setDetail(m)}
                className="mt-1.5 block w-full truncate text-left text-sm font-medium"
              >
                {m.title}
              </button>
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

      {detail && (
        // Keyed by id so reopening a different movie remounts and replays the
        // animation instead of swapping content inside a static panel.
        <MovieModal
          key={detail.id}
          movie={movies.find((m) => m.id === detail.id) ?? detail}
          onClose={() => setDetail(null)}
        />
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

function MovieModal({
  movie,
  onClose,
}: {
  movie: Movie;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);

    // Stop the list behind from scrolling under the modal.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const added = new Date(movie.addedAt);
  const addedLabel = Number.isNaN(added.getTime())
    ? null
    : added.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      });

  return (
    <div
      // Bottom sheet on phones, centred once there is room for it.
      className="animate-backdrop-in fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={movie.title}
        onClick={(e) => e.stopPropagation()}
        className="animate-panel-in relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-lg border border-neutral-800 bg-neutral-950 p-4"
      >
        {/* Absolute so it does not eat width from an already narrow column. */}
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 h-9 w-9 rounded-lg border border-neutral-700 bg-neutral-950/80 text-neutral-400"
        >
          <CrossIcon />
        </button>

        <div className="flex gap-4">
          {/* Half the panel width — the poster is the point of the sheet. */}
          <div className="w-1/2 shrink-0">
            <Poster src={movie.poster} title={movie.title} variant="grid" />
          </div>
          <div className="min-w-0 flex-1">
            {/* Only the title clears the close button; padding the whole
                column would cost width the ratings and credits need. */}
            <h3 className="font-tight pr-10 text-lg font-semibold leading-tight">
              {movie.title}
            </h3>
            <p className="text-sm text-neutral-500">{movie.year}</p>
            <p className="mt-2 text-sm leading-snug text-neutral-500">
              {[movie.runtime, movie.director].filter(Boolean).join(" · ") ||
                "No runtime or director listed"}
            </p>
          </div>
        </div>

        {/* Full width rather than in the narrow column, where the two scores
            were stacking one per line. */}
        <p className="mt-3 text-sm text-neutral-400">
          <RatingBadges ratings={movie.ratings} />
        </p>

        <p className="mt-4 text-sm leading-relaxed text-neutral-300">
          {movie.plot ?? "No synopsis available for this one."}
        </p>

        <dl className="mt-4 space-y-1 border-t border-neutral-800 pt-3 text-xs text-neutral-500">
          <div className="flex gap-2">
            <dt className="shrink-0">Added by</dt>
            <dd className="text-neutral-200">
              {movie.addedBy}
              {addedLabel && (
                <span className="text-neutral-500"> · {addedLabel}</span>
              )}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="shrink-0">Watched by</dt>
            <dd className="text-neutral-200">
              {movie.watchedBy.length > 0
                ? movie.watchedBy.join(", ")
                : "Nobody yet"}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

function WatchedButton({
  watched,
  title,
  onClick,
}: {
  watched: boolean;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${watched ? "Unmark" : "Mark"} ${title} watched`}
      aria-pressed={watched}
      className={`h-9 w-9 rounded-lg border ${
        watched
          ? "border-neutral-200 text-white"
          : "border-neutral-700 text-neutral-600"
      }`}
    >
      <CheckIcon />
    </button>
  );
}

function CheckIcon() {
  return (
    <svg {...iconProps} className="mx-auto">
      <path d="M20 6 9 17l-5-5" />
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
  // OMDb sometimes hands back a poster URL that 404s, especially on obscure
  // titles. Without this the browser paints its broken-image glyph, so treat a
  // load failure exactly like a missing poster.
  const [failed, setFailed] = useState(false);

  // Row: a fixed thumbnail beside text. Grid: fills its cell at poster ratio.
  const box =
    variant === "grid"
      ? "w-full aspect-[2/3]"
      : "h-[81px] w-[54px] shrink-0";

  if (!src || failed) {
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
      onError={() => setFailed(true)}
      className={`${box} rounded-lg object-cover`}
    />
  );
}
