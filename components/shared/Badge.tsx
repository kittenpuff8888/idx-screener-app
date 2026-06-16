import { cn } from "@/lib/utils/classNames";

type BadgeTone = "accent" | "positive" | "negative" | "warning" | "neutral";

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold tracking-wide",
        tone === "accent" && "border-accent/40 bg-accent/10 text-accent",
        tone === "positive" && "border-positive/35 bg-positive/10 text-positive",
        tone === "negative" && "border-negative/35 bg-negative/10 text-negative",
        tone === "warning" && "border-warning/35 bg-warning/10 text-warning",
        tone === "neutral" && "border-white/10 bg-white/5 text-muted",
      )}
    >
      {children}
    </span>
  );
}
