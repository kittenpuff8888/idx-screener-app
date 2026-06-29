import { cn } from "@/lib/utils/classNames";
import { isMissing, provenance, type Cell } from "@/lib/dataReady";

/**
 * Provenance caption — source + as-of, shown beneath any data surface (§0 rule 4).
 */
export function Provenance({ source, asOf, className }: { source: string; asOf: string; className?: string }) {
  return (
    <span className={cn("text-[12px] font-medium text-faint", className)}>
      {provenance(source, asOf)}
    </span>
  );
}

/**
 * The single rendering path for a numeric/text value. Pass a Cell and a
 * formatter; a present cell renders the formatted value (mono), a missing cell
 * renders a muted "—" carrying the reason as a tooltip. There is no way to
 * print a value that did not come from a Cell.
 */
export function Metric<T>({
  label,
  cell,
  format,
  showSource = false,
  className,
  valueClassName,
}: {
  label?: string;
  cell: Cell<T>;
  format: (value: T) => string;
  /** Render the source · asOf caption inline beneath the value. */
  showSource?: boolean;
  className?: string;
  valueClassName?: string;
}) {
  const missing = isMissing(cell);
  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      {label ? <span className="text-[12px] font-medium uppercase tracking-wide text-faint">{label}</span> : null}
      {missing ? (
        <span className="font-mono text-muted" title={cell.reason} aria-label={cell.reason}>
          —
        </span>
      ) : (
        <span className={cn("font-mono text-text", valueClassName)}>{format(cell.value)}</span>
      )}
      {!missing && showSource ? <Provenance source={cell.source} asOf={cell.asOf} /> : null}
      {missing ? <span className="text-[12px] text-faint">{cell.reason}</span> : null}
    </div>
  );
}

/**
 * Compact two-column stat row (Yahoo key-statistics style). Same Cell contract.
 */
export function Stat<T>({
  label,
  cell,
  format,
  valueClassName,
}: {
  label: string;
  cell: Cell<T>;
  format: (value: T) => string;
  valueClassName?: string;
}) {
  const missing = isMissing(cell);
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-hair py-2 last:border-0">
      <span className="text-xs text-muted">{label}</span>
      {missing ? (
        <span className="font-mono text-sm text-muted" title={cell.reason}>—</span>
      ) : (
        <span className={cn("font-mono text-sm text-text", valueClassName)}>{format(cell.value)}</span>
      )}
    </div>
  );
}
