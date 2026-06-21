import { cn } from "@/lib/utils/classNames";

type BadgeTone = "accent" | "positive" | "negative" | "warning" | "neutral";

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "status-badge",
        tone === "accent" && "info",
        tone === "positive" && "positive",
        tone === "negative" && "error",
        tone === "warning" && "warning",
        tone === "neutral" && "neutral",
      )}
    >
      {children}
    </span>
  );
}
