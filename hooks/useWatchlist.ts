"use client";

import { useApp } from "@/components/providers/AppProvider";

export function useWatchlist() {
  const { watchlist, toggleWatchlist, isWatched } = useApp();
  return { watchlist, toggleWatchlist, isWatched };
}
