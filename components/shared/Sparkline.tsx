import { cn } from "@/lib/utils/classNames";

export function Sparkline({
  values,
  className,
  positive = true,
}: {
  values: number[];
  className?: string;
  positive?: boolean;
}) {
  const points = values.filter(Number.isFinite).slice(-48);
  if (points.length < 2) return <div className={cn("h-10 rounded bg-white/5", className)} />;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const spread = max - min || 1;
  const path = points
    .map((value, index) => {
      const x = (index / (points.length - 1)) * 100;
      const y = 36 - ((value - min) / spread) * 32;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
  return (
    <svg className={cn("h-11 w-full overflow-visible", className)} viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
      <path d={`${path} L 100 40 L 0 40 Z`} fill={positive ? "rgba(34,197,94,.10)" : "rgba(239,68,68,.10)"} />
      <path d={path} fill="none" stroke={positive ? "var(--positive)" : "var(--negative)"} strokeWidth="2.4" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
