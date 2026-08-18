import { NextResponse } from "next/server";
import { searchTitles } from "@/lib/omdb";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = params.get("q")?.trim();
  // Anything that is not explicitly "series" searches films.
  const kind = params.get("kind") === "series" ? "series" : "movie";

  if (!query) return NextResponse.json({ results: [] });

  try {
    return NextResponse.json({ results: await searchTitles(query, kind) });
  } catch (error) {
    console.error("search failed", error);
    return NextResponse.json(
      { error: "Search is unavailable right now." },
      { status: 502 }
    );
  }
}
