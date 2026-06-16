"use client";

import { useEffect } from "react";
import { Button } from "./Button";
import { cn } from "@/lib/utils/classNames";

export function Drawer({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/72 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-y-0 right-0 flex w-full justify-end">
        <div className={cn("h-full w-full overflow-y-auto border-l border-white/10 bg-bg p-5 shadow-terminal", wide ? "max-w-6xl" : "max-w-3xl")}>
          <div className="sticky top-0 z-10 mb-5 flex items-center justify-between gap-4 border-b border-white/10 bg-bg/95 pb-4 backdrop-blur">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-accent">Research Detail</p>
              <h2 className="text-2xl font-semibold text-text">{title}</h2>
            </div>
            <Button variant="ghost" onClick={onClose} aria-label="Close drawer">Close</Button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
