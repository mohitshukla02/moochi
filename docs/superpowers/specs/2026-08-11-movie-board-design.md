# Movie Board — Design

**Date:** 2026-08-11
**Status:** Approved, ready for implementation planning

## Purpose

A single shared movie list for a small group of friends. Anyone visits the site,
types their name, searches a movie, picks it from results, and it lands on one
public list with real metadata — poster, IMDb / Rotten Tomatoes / Metacritic
ratings, year, director, runtime.

Think "List2Go, but for movies with proper metadata." Not a shippable product.
Roughly five users, expected ceiling around 200 movies.

## Non-goals

- No accounts, no login, no passwords. The name is a byline, not an identity.
- No per-user lists, no shareable sub-lists. One list, everyone.
- No ratings, reviews, or comments from users. Metadata comes from OMDb only.
- No watched/unwatched state, no sorting or filtering beyond newest-first.
- No native app. Mobile web only.

## Data source

**OMDb API** (`omdbapi.com`), free key, 1000 requests/day.

Chosen because it is the only free source that carries a **Rotten Tomatoes
Tomatometer**. TMDB has better artwork and search, but carries no RT data at
all. Direct IMDb and direct Rotten Tomatoes APIs are both closed to new
applicants and are not options.

Two endpoints are used:

| Endpoint | When | Returns |
|---|---|---|
| `?s=<query>` | user types in search box | array of thin matches: title, year, imdbID, poster |
| `?i=<imdbID>` | user picks a result | full record incl. ratings, director, runtime, plot |

**Unverified assumption — resolve first.** The design depends on the full lookup
returning a `Ratings` array shaped like:

```json
"Ratings": [
  { "Source": "Internet Movie Database", "Value": "8.8/10" },
  { "Source": "Rotten Tomatoes",         "Value": "87%"    },
  { "Source": "Metacritic",              "Value": "74/100" }
]
```

OMDb's public docs and swagger spec do not publish a response schema, so this
could not be confirmed ahead of time. **Step one of implementation is a single
live request with a real key to confirm the field name and shape.** If the array
is absent or differently named, the ratings portion of this design needs
revisiting before anything else is built.

Rotten Tomatoes coverage is known to be partial regardless — older films and
most TV titles have no Tomatometer. Only the critic score is available; the RT
audience score is not exposed by any free source.

## Architecture

Next.js 16 (App Router), deployed to Vercel. Upstash Redis via the Vercel
Marketplace. Three server routes; the OMDb key is server-side only and never
reaches the client.

```
Browser                    Server routes              External
───────                    ─────────────              ────────
type "batman" ──────────►  /api/search  ────────────► OMDb ?s=batman
                           (title, year, poster,
◄────────── 10 results ──── imdbID only)

click one ──────────────►  /api/movies POST ────────► OMDb ?i=tt0372784
  + your name              enrich, dedupe, RPUSH      (ratings, runtime,
◄────────── new row ──────                             director, plot)

page load ──────────────►  /api/movies GET
◄────────── full list ────  LRANGE movies 0 -1
```

Enrichment happens **once, at add time**, and the enriched record is what gets
stored. Page loads never touch OMDb. This keeps usage far below the 1k/day cap —
reads are free, and only searches and adds cost quota.

## Data model

A single Redis list at key `movies`. One JSON string per entry:

```json
{
  "id": "tt0468569",
  "title": "The Dark Knight",
  "year": "2008",
  "poster": "https://m.media-amazon.com/images/...",
  "runtime": "152 min",
  "director": "Christopher Nolan",
  "plot": "When the menace known as the Joker...",
  "ratings": { "imdb": "9.0/10", "rt": "94%", "metacritic": "84/100" },
  "addedBy": "Mohit",
  "addedAt": "2026-08-11T14:22:00Z"
}
```

`ratings` is normalized from OMDb's array at write time. **Each of the three
fields is independently nullable.** The card renders whichever are present and
does not reserve layout space for missing ones.

`RPUSH` is atomic, so simultaneous adds from two people cannot clobber each
other. This is the reason Redis was chosen over a single JSON blob in Vercel
Blob storage, which would have required a read-modify-write cycle and could
silently lose an entry.

Note that a JSON file committed to the repo is not viable at all: Vercel
functions have a read-only filesystem apart from ephemeral `/tmp`, so runtime
appends are impossible.

## UI

Single page, single column at every breakpoint. Desktop gets a max-width and
centers; there is no second layout.

**Mobile-first, since that is how the group will use it:**

- Search results render as a **vertical list of rows**, not a poster grid. At
  390px a 3-up grid makes thumbnails too small to distinguish two films with the
  same title, which defeats the purpose of search-then-pick.
- **No hover-dependent affordances.** Duplicate warnings, delete controls, and
  the "added by" byline are always visible or tap-triggered.
- **Name field and search box are sticky at the top**, list scrolls beneath.
  Adding a second movie does not require scrolling back up.
- **Posters lazy-loaded at reduced width** (~150px) via the size suffix on
  OMDb's Amazon-hosted poster URLs, not full-size art.

The name field persists to `localStorage` so it is typed once per device, not
once per movie. This is the only client-side state in the app.

**Duplicate handling:** if the `imdbID` already exists in the list, reject the
add and surface "Ada already added this" rather than creating a second row.

**List order:** newest first.

## Error handling

Four failure modes that will occur in practice:

1. **OMDb unreachable or key rejected** — show a retry affordance and preserve
   whatever the user typed. Never silently drop input.
2. **Search returns zero results** — empty state suggesting they add a year to
   disambiguate.
3. **Poster URL 404s** — render a fallback tile with the title, not a broken
   image icon.
4. **Redis unreachable** — the list renders empty with an error banner. The page
   must not crash.

## Abuse and operations

The write endpoint is public and unauthenticated, so:

- **Rate limit on `POST /api/movies`**, backed by the same Upstash instance.
- **Length cap on the name field.**
- **`DELETE /api/movies/:id` gated behind an admin token** held in an env var.
  This is the operator escape hatch for junk entries. No other user can delete.

## Testing

Vitest. Coverage targets the pure logic, which is where the real risk sits:

- OMDb `Ratings` array → normalized `ratings` object, **including the case where
  Rotten Tomatoes is absent** and the case where the array is missing entirely.
- Duplicate detection by `imdbID`.
- Route smoke tests against a mocked OMDb.

## Environment

```
OMDB_API_KEY          # server-only, never exposed to client
KV_REST_API_URL       # auto-wired by Vercel Marketplace
KV_REST_API_TOKEN     # auto-wired by Vercel Marketplace
ADMIN_TOKEN           # gates DELETE
```

## Open items for implementation

1. Confirm the OMDb `Ratings` array shape with a live request **before**
   building anything that depends on it.
2. Confirm the Amazon poster URL size-suffix behaviour still works; fall back to
   full-size images with lazy loading if not.
