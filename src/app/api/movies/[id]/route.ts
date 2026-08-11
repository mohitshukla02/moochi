import { NextResponse } from "next/server";
import { deleteMovie } from "@/lib/store";

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
