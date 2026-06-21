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
    <div className="ticker-drawer-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <aside className={cn("ticker-drawer", wide && "wide")}>
        <header className="ticker-drawer-header">
          <div>
            <span className="panel-kicker">Ticker Research</span>
            <h2>{title}</h2>
          </div>
          <Button variant="ghost" onClick={onClose} aria-label="Close drawer">Close</Button>
        </header>
        <div className="ticker-drawer-body">
          {children}
        </div>
      </aside>
    </div>
  );
}
