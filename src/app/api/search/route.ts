import { NextResponse } from "next/server";
import { searchTitles } from "@/lib/omdb";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim();
  if (!query) return NextResponse.json({ results: [] });

  try {
    return NextResponse.json({ results: await searchTitles(query) });
  } catch (error) {
    console.error("search failed", error);
    return NextResponse.json(
      { error: "Search is unavailable right now." },
      { status: 502 }
    );
  }
}
