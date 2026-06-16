import { cn } from "@/lib/utils/classNames";

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cn("rounded-lg border border-white/10 bg-surface/85 p-5 shadow-terminal", className)}>{children}</section>;
}

export function CardHeader({
  kicker,
  title,
  children,
}: {
  kicker?: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        {kicker ? <p className="mb-1 text-xs font-bold uppercase tracking-[0.22em] text-accent">{kicker}</p> : null}
        <h2 className="text-xl font-semibold text-text">{title}</h2>
      </div>
      {children}
    </div>
  );
}
