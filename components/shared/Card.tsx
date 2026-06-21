import { cn } from "@/lib/utils/classNames";

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cn("panel", className)}>{children}</section>;
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
    <div className="panel-head">
      <div>
        {kicker ? <span className="panel-kicker">{kicker}</span> : null}
        <h3>{title}</h3>
      </div>
      {children}
    </div>
  );
}
