import { NextResponse } from "next/server";
import { deleteMovie } from "@/lib/store";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.headers.get("x-admin-token");
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return NextResponse.json({ error: "Nope." }, { status: 401 });
  }

  const { id } = await params;
  const removed = await deleteMovie(id);
  if (!removed) return NextResponse.json({ error: "Not found." }, { status: 404 });

  return NextResponse.json({ ok: true });
}
