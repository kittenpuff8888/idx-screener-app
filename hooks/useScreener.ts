"use client";

import { useApp } from "@/components/providers/AppProvider";

export function useScreener() {
  const { bundle } = useApp();
  return bundle?.screener || [];
}
