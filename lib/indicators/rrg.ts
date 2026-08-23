// Relative Rotation Graph (RRG) — JdK-style RS-Ratio / RS-Momentum, computed
// from real price series (sector/konglo index series, or per-ticker OHLCV)
// against a real benchmark (IHSG). This is OUR OWN implementation of the
// standard concept — a rolling z-score-normalized relative-strength ratio
// (RS-Ratio) and a z-score-normalized rate-of-change of that ratio
// (RS-Momentum), both centered at 100 — not a reverse-engineered copy of any
// specific commercial tool's proprietary smoothing constants. Real inputs,
// documented formula, reproducible.

export type Pt = { date: string; value: number };
export type RrgPoint = { date: string; ratio: number; momentum: number };
export type Quadrant = "leading" | "weakening" | "lagging" | "improving";
export type Rotation = "clockwise" | "counter" | "flat";
export type Phase =
  | "Strengthening" | "Fading"           // Leading
  | "Stabilizing" | "Deteriorating"      // Weakening
  | "Gaining Momentum" | "Deepening Weakness" // Lagging
  | "Building Momentum" | "Losing Momentum";  // Improving

export const QUADRANT_META: Record<Quadrant, { label: string; color: string }> = {
  leading: { label: "Leading", color: "var(--up)" },
  weakening: { label: "Weakening", color: "var(--warning, #b45309)" },
  lagging: { label: "Lagging", color: "var(--down)" },
  improving: { label: "Improving", color: "var(--accent)" },
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
const DEFAULTS: Required<RrgOptions> = { ratioWindow: 10, momentumWindow: 10, ratioScale: 2.2, momentumScale: 2.2 };

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
  const momStats = rollingMeanStd(validMomentum, ratioWindow);
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

/** Our own interpretive phase/rotation/speed scheme — not a copy of any
    specific tool's proprietary rules. Quadrant + the sign of the latest
    single-period change decides the phase label; rotation direction comes
    from the cross product of the last two movement vectors (clockwise =
    the textbook-normal Lagging→Improving→Leading→Weakening cycle). */
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
  let phase: Phase;
  switch (quadrant) {
    case "leading": phase = deltaMomentum >= 0 ? "Strengthening" : "Fading"; break;
    case "weakening": phase = deltaRatio >= 0 ? "Stabilizing" : "Deteriorating"; break;
    case "lagging": phase = deltaMomentum >= 0 ? "Gaining Momentum" : "Deepening Weakness"; break;
    default: phase = deltaRatio >= 0 ? "Building Momentum" : "Losing Momentum";
  }
  return { quadrant, phase, rotation, deltaRatio, deltaMomentum, speed };
}
