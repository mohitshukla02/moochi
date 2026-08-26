# moochi

A shared watchlist for films and TV shows. Search, add, and everyone sees the
same list — with no sign-up step in the way.

## How it works

There are no accounts. The name you type into the header *is* your identity,
matched case-insensitively. That name is what gets recorded when you mark
something watched, and what the "unwatched only" filter checks against — so
"unwatched" means unwatched *by you*, not by nobody.

Films and shows share one list, split by a tab. Search hits the OMDb API;
adding a title stores its poster, runtime, director, plot, genre, cast, and
IMDb / Rotten Tomatoes / Metacritic scores alongside it.

- Sort by recently added, year, or IMDb rating — titles with no score always
  sort last rather than leading in one direction.
- Switch between list and grid views.
- Tap a title for the full detail modal.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Vitest

Storage is Upstash Redis when configured. Without it the app falls back to a
per-process in-memory store so it runs before the integration is installed —
that fallback is explicitly not persistence and dies on restart.

## Running locally

```sh
npm install
cp .env.local.example .env.local   # then fill in the values
npm run dev
```

| Variable | Purpose |
|---|---|
| `OMDB_API_KEY` | Title search and metadata |
| `UPSTASH_REDIS_REST_URL` | Persistence (optional in dev) |
| `UPSTASH_REDIS_REST_TOKEN` | Persistence (optional in dev) |
| `ADMIN_TOKEN` | Guards the backfill route |

```sh
npm test    # vitest
npm run build
```

## Layout

| Path | Role |
|---|---|
| `src/app/page.tsx` | Server component; loads the list |
| `src/app/MovieBoard.tsx` | The whole client UI |
| `src/app/api/search` | OMDb title search |
| `src/app/api/movies` | List, add, and update entries |
| `src/app/api/admin/backfill` | Fills in fields added after a record was written |
| `src/lib/store.ts` | Redis / in-memory backend |
| `src/lib/omdb.ts` | OMDb client |
| `src/lib/ratings.ts` | Normalizes OMDb's ratings array |

Records written before a field existed simply lack it — the store fills in
defaults on read, so new fields never require a migration.

## License

Copyright © 2026 Mohit Shukla. All rights reserved.

This repository is made publicly viewable for portfolio and demonstration
purposes only. No license is granted to use, copy, modify, merge, publish,
distribute, sublicense, or sell copies of moochi or any part of
it, in whole or in part, without prior written permission from the
copyright holder.
