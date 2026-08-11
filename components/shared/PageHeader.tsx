import type { ReactNode } from "react";

/** The page header row (DESIGN_SPEC §2): title 26/800 at -0.02em with a neutral
    descriptor pill beside it. One component so every route renders it
    identically — the acceptance checklist asks for exactly that. */
export function PageHeader({
  title,
  pill,
  children,
  meta,
}: {
  title: string;
  /** Short uppercase descriptor shown in the neutral pill. */
  pill?: string;
  /** Optional trailing content on the same row (counts, source notes). */
  children?: ReactNode;
  /** Optional line beneath the title. */
  meta?: ReactNode;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: "-.02em" }}>{title}</h1>
        {pill ? (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: ".1em",
              color: "var(--muted)",
              background: "var(--soft)",
              border: "1px solid var(--border)",
              borderRadius: 999,
              padding: "3px 9px",
              whiteSpace: "nowrap",
            }}
          >
            {pill}
          </span>
        ) : null}
        {children}
      </div>
      {meta ? <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 13.5, lineHeight: 1.5 }}>{meta}</div> : null}
    </div>
  );
}
