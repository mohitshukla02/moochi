import MovieBoard from "./MovieBoard";
import { listMovies } from "@/lib/store";
import type { Movie } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Page() {
  let movies: Movie[] = [];
  try {
    movies = await listMovies();
  } catch (error) {
    console.error("initial load failed", error);
  }
  return <MovieBoard initial={movies} />;
}
