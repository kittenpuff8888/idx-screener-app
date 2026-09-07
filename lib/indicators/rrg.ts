// Relative Rotation Graph (RRG) — JdK-style RS-Ratio / RS-Momentum, computed
// from real price series (sector/konglo index series, or per-ticker OHLCV)
// against a real benchmark (IHSG). Standard rolling z-score-normalized
// relative-strength ratio (RS-Ratio) and z-score-normalized rate-of-change
// of that ratio (RS-Momentum), both centered at 100. ratioScale/momentumScale
// default to 1 (a plain z-score, no extra spread) -- checked against a
// third-party RRG tool's real published RS-Ratio/RS-Momentum values for nine
// IDX Energy names on 2026-07-21 (closest trading week close): this
// parameterization (10-week window, scale 1) landed within roughly ±0.5-2.0
// points of every one of them, materially closer than the previously-used
// scale of 2.2 (which ran ±2-4 points off). Real inputs, documented formula
// -- still our own reproduction, not guaranteed to match any specific tool
// exactly, since neither its precise formula nor benchmark series is public.
export type Pt = { date: string; value: number };
export type RrgPoint = { date: string; ratio: number; momentum: number };
export type Quadrant = "leading" | "weakening" | "lagging" | "improving";
export type Rotation = "clockwise" | "counter" | "flat";
// Richer, transition-aware phase set (our own interpretation of a reference
// tool's phase vocabulary, reconstructed from its UI -- no published spec
// exists to copy exactly). Each quadrant gets a "just rotated in this
// period" label (set only on the single period the point crosses into that
// quadrant) plus 2-3 within-quadrant labels keyed off the sign/magnitude of
// the latest single-period move.
export type Phase =
  | "Entering Leading" | "Strengthening" | "Fading" | "Collapsing"        // Leading
  | "Rotating → Weakening" | "Stabilizing" | "Deteriorating"              // Weakening
  | "Fast Recovery" | "Gaining Momentum" | "Deepening Weakness"           // Lagging
  | "Rotating → Improving" | "Recovering → Leading" | "Losing Momentum";  // Improving

export const QUADRANT_META: Record<Quadrant, { label: string; color: string; tint: string }> = {
  leading: { label: "Leading", color: "var(--up)", tint: "var(--upSoft)" },
  weakening: { label: "Weakening", color: "var(--warning)", tint: "var(--warnSoft)" },
  lagging: { label: "Lagging", color: "var(--down)", tint: "var(--downSoft)" },
  improving: { label: "Improving", color: "var(--cyan)", tint: "var(--cyanSoft)" },
};

function rollingMeanStd(values: number[], window: number): Array<{ mean: number; std: number } | null> {
  const out: Array<{ mean: number; std: number } | null> = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i < window - 1) { out.push(null); continue; }
    const slice = values.slice(i - window + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length;
    out.push({ mean, std: Math.sqrt(variance) });
  }
  return out;
}

/** Inner-join two date-value series on shared dates, both ascending. */
function alignByDate(a: Pt[], b: Pt[]): Array<{ date: string; a: number; b: number }> {
  const bByDate = new Map(b.map((p) => [p.date, p.value]));
  const out: Array<{ date: string; a: number; b: number }> = [];
  for (const p of a) {
    const bv = bByDate.get(p.date);
    if (bv != null && Number.isFinite(bv) && Number.isFinite(p.value)) out.push({ date: p.date, a: p.value, b: bv });
  }
  return out;
}

export type RrgOptions = { ratioWindow?: number; momentumWindow?: number; ratioScale?: number; momentumScale?: number };
const DEFAULTS: Required<RrgOptions> = { ratioWindow: 10, momentumWindow: 10, ratioScale: 1, momentumScale: 1 };

/** Full RS-Ratio / RS-Momentum series for one asset vs one benchmark. */
export function computeRrgSeries(assetSeries: Pt[], benchSeries: Pt[], opts?: RrgOptions): RrgPoint[] {
  const { ratioWindow, momentumWindow, ratioScale, momentumScale } = { ...DEFAULTS, ...opts };
  const aligned = alignByDate(assetSeries, benchSeries);
  if (aligned.length < ratioWindow + momentumWindow + 2) return [];

  const relStrength = aligned.map((p) => (p.a / p.b) * 100);
  const rsStats = rollingMeanStd(relStrength, ratioWindow);
  const ratio: Array<number | null> = relStrength.map((rs, i) => {
    const s = rsStats[i];
    if (!s || s.std === 0) return null;
    return 100 + ((rs - s.mean) / s.std) * ratioScale;
  });

  const momentumRaw: Array<number | null> = ratio.map((r, i) => {
    if (r == null || i < momentumWindow) return null;
    const prev = ratio[i - momentumWindow];
    if (prev == null || prev === 0) return null;
    return (r / prev - 1) * 100;
  });
  const validMomentum = momentumRaw.filter((v): v is number => v != null);
  const momStats = rollingMeanStd(validMomentum, momentumWindow);
  let mi = 0;
  const momentum: Array<number | null> = momentumRaw.map((v) => {
    if (v == null) return null;
    const s = momStats[mi]; mi += 1;
    if (!s || s.std === 0) return 100;
    return 100 + ((v - s.mean) / s.std) * momentumScale;
  });

  const out: RrgPoint[] = [];
  for (let i = 0; i < aligned.length; i += 1) {
    const r = ratio[i], m = momentum[i];
    if (r != null && m != null) out.push({ date: aligned[i].date, ratio: r, momentum: m });
  }
  return out;
}

export function quadrantOf(ratio: number, momentum: number): Quadrant {
  if (ratio >= 100 && momentum >= 100) return "leading";
  if (ratio >= 100 && momentum < 100) return "weakening";
  if (ratio < 100 && momentum < 100) return "lagging";
  return "improving";
}

export type Trajectory = {
  quadrant: Quadrant;
  phase: Phase;
  rotation: Rotation;
  deltaRatio: number;
  deltaMomentum: number;
  speed: number; // magnitude of the latest single-period move in (ratio, momentum) space
};

// A single-period move bigger than this (in z-score points) counts as
// "sharp" for the Collapsing/Fast Recovery labels below — calibrated to the
// scale=1 default (typical single-period moves run well under 1 std-dev;
// anything clearing it is a genuinely fast swing, not noise).
const SHARP_MOVE = 0.6;

/** Our own interpretive phase/rotation/speed scheme, reconstructed from a
    reference tool's on-screen phase vocabulary (no published spec exists to
    copy exactly). The period a point FIRST crosses into a quadrant gets a
    "Rotating → X" / "Entering Leading" / "Recovering → Leading" transition
    label; every other period gets a within-quadrant label keyed off the
    sign and magnitude of the latest single-period move. Rotation direction
    comes from the cross product of the last two movement vectors (clockwise
    = the textbook-normal Lagging→Improving→Leading→Weakening cycle). */
export function computeTrajectory(series: RrgPoint[]): Trajectory | null {
  if (series.length < 3) return null;
  const last = series[series.length - 1];
  const prev = series[series.length - 2];
  const prev2 = series[series.length - 3];
  const deltaRatio = last.ratio - prev.ratio;
  const deltaMomentum = last.momentum - prev.momentum;
  const speed = Math.sqrt(deltaRatio ** 2 + deltaMomentum ** 2);

  const v1x = prev.ratio - prev2.ratio, v1y = prev.momentum - prev2.momentum;
  const v2x = deltaRatio, v2y = deltaMomentum;
  const cross = v1x * v2y - v1y * v2x;
  const rotation: Rotation = Math.abs(cross) < 1e-9 ? "flat" : cross < 0 ? "clockwise" : "counter";

  const quadrant = quadrantOf(last.ratio, last.momentum);
  const prevQuadrant = quadrantOf(prev.ratio, prev.momentum);
  const justRotatedIn = quadrant !== prevQuadrant;

  let phase: Phase;
  if (justRotatedIn && quadrant === "leading") {
    phase = prevQuadrant === "lagging" ? "Recovering → Leading" : "Entering Leading";
  } else if (justRotatedIn && quadrant === "weakening") {
    phase = "Rotating → Weakening";
  } else if (justRotatedIn && quadrant === "improving") {
    phase = "Rotating → Improving";
  } else {
    switch (quadrant) {
      case "leading":
        phase = deltaMomentum >= 0 ? "Strengthening" : deltaMomentum <= -SHARP_MOVE ? "Collapsing" : "Fading";
        break;
      case "weakening":
        phase = deltaRatio >= 0 ? "Stabilizing" : "Deteriorating";
        break;
      case "lagging":
        phase = deltaMomentum >= SHARP_MOVE ? "Fast Recovery" : deltaMomentum >= 0 ? "Gaining Momentum" : "Deepening Weakness";
        break;
      default:
        phase = deltaRatio >= 0 ? "Recovering → Leading" : "Losing Momentum";
    }
  }
  return { quadrant, phase, rotation, deltaRatio, deltaMomentum, speed };
}
