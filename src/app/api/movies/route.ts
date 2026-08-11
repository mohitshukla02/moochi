import { NextResponse } from "next/server";
import { fetchMovie } from "@/lib/omdb";
import { addMovie, hasMovie, listMovies } from "@/lib/store";

export async function GET() {
  try {
    return NextResponse.json({ movies: await listMovies() });
  } catch (error) {
    console.error("list failed", error);
    return NextResponse.json(
      { error: "Could not load the list." },
      { status: 502 }
    );
  }
}

export async function POST(request: Request) {
  let body: { id?: string; addedBy?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const id = body.id?.trim();
  const addedBy = body.addedBy?.trim().slice(0, 40);

  if (!id) return NextResponse.json({ error: "Missing movie." }, { status: 400 });
  if (!addedBy)
    return NextResponse.json({ error: "Enter your name first." }, { status: 400 });

  try {
    const existing = await hasMovie(id);
    if (existing) {
      return NextResponse.json(
        { error: `${existing.addedBy} already added this.` },
        { status: 409 }
      );
    }

    const details = await fetchMovie(id);
    const movie = {
      ...details,
      addedBy,
      addedAt: new Date().toISOString(),
      watchedBy: [],
    };
    await addMovie(movie);

    return NextResponse.json({ movie }, { status: 201 });
  } catch (error) {
    console.error("add failed", error);
    return NextResponse.json(
      { error: "Could not add that one. Try again." },
      { status: 502 }
    );
  }
}
