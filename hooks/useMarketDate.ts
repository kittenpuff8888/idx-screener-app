"use client";

import { useApp } from "@/components/providers/AppProvider";

export function useMarketDate() {
  const { manifest, marketDate, setMarketDate, notice } = useApp();
  return { manifest, marketDate, setMarketDate, notice };
}
