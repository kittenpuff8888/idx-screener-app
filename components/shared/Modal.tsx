"use client";

import { useEffect } from "react";
import type { CSSProperties, ReactNode } from "react";

/**
 * Prototype-style modal: dim backdrop, centered rounded panel, closes on
 * backdrop click / ✕ / Escape; clicks inside the panel do not close it.
 */
export function Modal({ title, kicker, onClose, children, maxWidth = 760 }: {
  title: ReactNode;
  kicker?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: number;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const panel: CSSProperties = {
    background: "var(--panel)",
    border: "1px solid var(--border)",
    borderRadius: 18,
    boxShadow: "0 24px 60px rgba(0,0,0,.28)",
    width: "min(94vw, " + maxWidth + "px)",
    maxHeight: "86vh",
    overflowY: "auto",
    padding: "20px 22px",
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(10,14,20,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, animation: "fadein .18s ease-out" }}
    >
      <div onClick={(e) => e.stopPropagation()} style={panel}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <div>
            {kicker ? <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".08em", color: "var(--faint)", marginBottom: 3 }}>{kicker}</div> : null}
            <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-.01em" }}>{title}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--muted)", cursor: "pointer", fontSize: 14, lineHeight: 1 }}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
