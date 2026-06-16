"use client";

import { useApp } from "@/components/providers/AppProvider";

export function useTickerDrawer() {
  const { selectedTicker, openTicker, closeTicker } = useApp();
  return { selectedTicker, openTicker, closeTicker };
}
