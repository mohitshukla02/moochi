import { NextResponse } from "next/server";
import { deleteMovie, toggleWatched } from "@/lib/store";

/** Toggles whether the given name has watched this movie. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let body: { name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const name = body.name?.trim().slice(0, 40);
  if (!name) {
    return NextResponse.json({ error: "Enter your name first." }, { status: 400 });
  }

  const { id } = await params;

  try {
    const movie = await toggleWatched(id, name);
    if (!movie) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    return NextResponse.json({ movie });
  } catch (error) {
    console.error("toggle watched failed", error);
    return NextResponse.json(
      { error: "Could not update that one." },
      { status: 502 }
    );
  }
}

/**
 * Deliberately unauthenticated: the link only lives in a private group chat,
 * and gating deletes behind a token made one person the bottleneck for every
 * wrong-Batman correction. The confirm step lives in the UI. There is no undo,
 * so if this ever leaks beyond the group, put the token check back.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const removed = await deleteMovie(id);
    if (!removed) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("delete failed", error);
    return NextResponse.json(
      { error: "Could not remove that one." },
      { status: 502 }
    );
  }
}
