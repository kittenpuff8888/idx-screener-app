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
        variant === "primary" && "primary-action",
        variant === "secondary" && "secondary-button",
        variant === "ghost" && "text-button",
        variant === "danger" && "secondary-button danger-button",
        className,
      )}
      {...props}
    />
  );
}
