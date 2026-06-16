"use client";

import { useApp } from "@/components/providers/AppProvider";

export function useKsei() {
  const { ksei } = useApp();
  return ksei;
}
