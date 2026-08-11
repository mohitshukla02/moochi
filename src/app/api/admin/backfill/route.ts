import { NextResponse } from "next/server";
import { fetchMovie } from "@/lib/omdb";
import { listMovies, patchMovie } from "@/lib/store";

export const maxDuration = 300;

/**
 * One-off maintenance: fills in the detail fields (genre, cast, certificate,
 * and so on) for records saved before those were captured.
 *
 * Admin-gated, because it spends OMDb quota — one request per movie missing
 * the data. Safe to re-run: movies that already have `genre` are skipped, and
 * writes merge rather than replace, so addedBy/addedAt/watchedBy survive.
 */
export async function POST(request: Request) {
  const token = request.headers.get("x-admin-token");
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return NextResponse.json({ error: "Nope." }, { status: 401 });
  }

  try {
    const movies = await listMovies();
    const stale = movies.filter((m) => m.genre === undefined);

    const updated: string[] = [];
    const failed: { id: string; title: string; reason: string }[] = [];

    // Sequential on purpose: OMDb is rate-limited per key, and this runs once.
    for (const movie of stale) {
      try {
        const details = await fetchMovie(movie.id);
        await patchMovie(movie.id, {
          genre: details.genre,
          actors: details.actors,
          writer: details.writer,
          rated: details.rated,
          released: details.released,
          awards: details.awards,
          boxOffice: details.boxOffice,
          country: details.country,
          language: details.language,
        });
        updated.push(movie.title);
      } catch (error) {
        failed.push({
          id: movie.id,
          title: movie.title,
          reason: error instanceof Error ? error.message : "unknown",
        });
      }
    }

    return NextResponse.json({
      total: movies.length,
      alreadyDone: movies.length - stale.length,
      updated: updated.length,
      failed,
    });
  } catch (error) {
    console.error("backfill failed", error);
    return NextResponse.json({ error: "Backfill failed." }, { status: 502 });
  }
}
