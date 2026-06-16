import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils/classNames";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  className,
  variant = "secondary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={cn(
        "inline-flex min-h-10 items-center justify-center rounded-md px-4 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-accent text-slate-950 hover:bg-accent-hover",
        variant === "secondary" && "border border-white/10 bg-white/5 text-text hover:border-accent/40 hover:bg-accent/10",
        variant === "ghost" && "text-muted hover:bg-white/5 hover:text-text",
        variant === "danger" && "border border-negative/30 bg-negative/10 text-negative hover:bg-negative/15",
        className,
      )}
      {...props}
    />
  );
}
