import { cn } from "@/lib/utils/classNames";
import { Provenance } from "./Metric";

/**
 * Wraps a chart. When `hasData` is false it renders the frame + a muted
 * "No data" state instead of a flat or fabricated line (§0 rule 3, §5).
 * Always shows a source · as-of caption when provided.
 */
export function ChartFrame({
  title,
  hasData,
  source,
  asOf,
  emptyReason = "No data",
  height = 220,
  toolbar,
  children,
  className,
}: {
  title?: string;
  hasData: boolean;
  source?: string;
  asOf?: string;
  emptyReason?: string;
  height?: number;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {(title || toolbar) && (
        <div className="flex items-center justify-between gap-3">
          {title ? <h4 className="text-sm font-semibold text-text">{title}</h4> : <span />}
          {toolbar}
        </div>
      )}
      <div className="relative w-full" style={{ minHeight: height }}>
        {hasData ? (
          children
        ) : (
          <div
            className="flex h-full w-full items-center justify-center rounded-md border border-dashed border-border bg-soft"
            style={{ minHeight: height }}
          >
            <span className="text-sm text-muted">{emptyReason}</span>
          </div>
        )}
      </div>
      {source ? <Provenance source={source} asOf={asOf ?? ""} /> : null}
    </div>
  );
}
