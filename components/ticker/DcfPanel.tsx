"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { JsonRecord, TechnicalRecord } from "@/lib/domain/types";
import { asNumber, formatPrice } from "@/lib/format/number";
import { computeDcf, costOfEquity, sensitivityGrid, DEFAULT_ASSUMPTIONS, type DcfAssumptions, type DcfInputs } from "@/lib/valuation/dcf";

// DCF valuation panel for the ticker detail page — a standard, transparent
// single-stage FCFE-style model (see lib/valuation/dcf.ts for the full
// methodology note). Every ticker-specific input (beta, Free Cash Flow,
// revenue growth, price, share count) is real, sourced from the same
// fundamental.json / technical.json already loaded for the rest of the page.
// Risk-free rate, equity risk premium, and terminal growth are macro
// assumptions by nature — shown as editable sliders with documented defaults,
// never silently invented as if they were a fetched fact.

const MONO = "var(--font-mono)";
const CARD: CSSProperties = { background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r)", boxShadow: "var(--sh, var(--shadow))", padding: "16px 18px" };
const KICKER: CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)" };
const STAT_LABEL: CSSProperties = { fontSize: 9, fontWeight: 700, letterSpacing: ".06em", color: "var(--faint)" };

function fmtBn(bn: number | null): string {
  if (bn == null || !isFinite(bn)) return "—";
  return bn >= 1000 ? `Rp ${(bn / 1000).toFixed(bn >= 100000 ? 0 : 1)} T` : `Rp ${Math.round(bn)} B`;
}
function fmtPct(v: number, d = 2): string {
  return `${v >= 0 ? "+" : "−"}${(Math.abs(v) * 100).toFixed(d)}%`;
}
function recColor(rec: "BUY" | "HOLD" | "SELL"): string {
  return rec === "BUY" ? "var(--up)" : rec === "SELL" ? "var(--down)" : "var(--flat)";
}

function Slider({ label, value, onChange, min, max, step, fmt }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number; fmt: (v: number) => string }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, fontWeight: 700, color: "var(--muted)", marginBottom: 3 }}>
        <span>{label}</span>
        <span style={{ fontFamily: MONO, color: "var(--text)" }}>{fmt(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ width: "100%", accentColor: "var(--accent)", cursor: "pointer" }} />
    </div>
  );
}

export function DcfPanel({ ticker, stock, fund }: { ticker: string; stock?: TechnicalRecord; fund?: JsonRecord }) {
  const inputs = useMemo<DcfInputs>(() => {
    const price = asNumber(stock?.lastPrice ?? fund?.["Price"]);
    const beta = asNumber(stock?.beta);
    const fcfTtmBn = asNumber(fund?.["Free cash flow (TTM)"]);
    const revenueGrowth = asNumber(fund?.["Revenue (Quarter YoY Growth)"]);
    const marketCapAbs = asNumber((stock?.fundamentals as JsonRecord | undefined)?.["marketCap"]);
    const sharesOutstanding = marketCapAbs != null && price != null && price > 0 ? marketCapAbs / price : null;
    return {
      ticker,
      price,
      beta,
      fcfTtmBn,
      revenueGrowth,
      sharesOutstanding,
      week52High: asNumber(fund?.["52 Week High"]),
      week52Low: asNumber(fund?.["52 Week Low"]),
      currency: "IDR",
    };
  }, [ticker, stock, fund]);

  const defaultGrowth = useMemo(() => {
    const g = inputs.revenueGrowth;
    if (g == null || !isFinite(g)) return 0.05;
    return Math.max(-0.3, Math.min(0.4, g));
  }, [inputs.revenueGrowth]);

  const [assumptions, setAssumptions] = useState<DcfAssumptions>(() => ({ ...DEFAULT_ASSUMPTIONS, fcfGrowthRate: defaultGrowth }));
  const [growthTouched, setGrowthTouched] = useState(false);
  // `fund`/`stock` load in asynchronously after mount, so the lazy useState
  // initializer above can fire before real revenue growth is available and
  // permanently lock in the 5% placeholder. Re-sync until the user manually
  // edits the slider themselves.
  useEffect(() => {
    if (!growthTouched) setAssumptions((a) => ({ ...a, fcfGrowthRate: defaultGrowth }));
  }, [defaultGrowth, growthTouched]);
  const set = (patch: Partial<DcfAssumptions>) => setAssumptions((a) => ({ ...a, ...patch }));
  const setGrowth = (v: number) => { setGrowthTouched(true); set({ fcfGrowthRate: v }); };

  const result = useMemo(() => computeDcf(inputs, assumptions), [inputs, assumptions]);
  const grid = useMemo(() => {
    if (!result.eligible) return [];
    const rateSteps = [-0.01, -0.005, 0, 0.005, 0.01];
    const growthSteps = [-0.01, -0.005, 0, 0.005, 0.01].map((d) => assumptions.terminalGrowthRate + d);
    return sensitivityGrid(inputs, assumptions, rateSteps, growthSteps);
  }, [inputs, assumptions, result.eligible]);

  return (
    <div style={{ ...CARD, marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={KICKER}>DCF VALUATION · INTRINSIC VALUE</span>
        <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: ".06em", color: "var(--accent)", background: "var(--accentSoft)", borderRadius: 5, padding: "2px 6px" }}>MODEL</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 18 }}>
        {/* assumptions column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Slider label="RISK-FREE RATE" value={assumptions.riskFreeRate} onChange={(v) => set({ riskFreeRate: v })} min={0.02} max={0.14} step={0.001} fmt={(v) => `${(v * 100).toFixed(1)}%`} />
          <Slider label="EQUITY RISK PREMIUM" value={assumptions.equityRiskPremium} onChange={(v) => set({ equityRiskPremium: v })} min={0.02} max={0.12} step={0.001} fmt={(v) => `${(v * 100).toFixed(1)}%`} />
          <Slider label="FCF GROWTH (EXPLICIT)" value={assumptions.fcfGrowthRate} onChange={setGrowth} min={-0.3} max={0.4} step={0.005} fmt={(v) => `${(v * 100).toFixed(1)}%`} />
          <Slider label="TERMINAL GROWTH" value={assumptions.terminalGrowthRate} onChange={(v) => set({ terminalGrowthRate: v })} min={0} max={0.08} step={0.001} fmt={(v) => `${(v * 100).toFixed(1)}%`} />
          <Slider label="FORECAST HORIZON" value={assumptions.forecastYears} onChange={(v) => set({ forecastYears: Math.round(v) })} min={1} max={10} step={1} fmt={(v) => `${v} years`} />
          <div style={{ fontSize: 9.5, color: "var(--faint)", lineHeight: 1.5 }}>
            FCF growth defaults to {ticker}&apos;s own real Revenue YoY growth ({inputs.revenueGrowth != null ? fmtPct(inputs.revenueGrowth) : "no data"}); the rest are macro assumptions, not per-ticker data.
          </div>
        </div>

        {/* results column */}
        <div>
          {!result.eligible ? (
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--muted)", marginBottom: 8 }}>Not eligible for a DCF under this model</div>
              {result.gates.map((g) => (
                <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--hair)", fontSize: 11 }}>
                  <span style={{ width: 14, height: 14, borderRadius: "50%", flex: "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: "#fff", background: g.pass ? "var(--up)" : "var(--down)" }}>{g.pass ? "✓" : "✕"}</span>
                  <span style={{ flex: 1, color: "var(--text)" }}>{g.label}</span>
                  <span style={{ fontFamily: MONO, color: "var(--faint)", fontSize: 10 }}>{g.detail}</span>
                </div>
              ))}
              <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 10, lineHeight: 1.5 }}>These gates test whether the model can be applied at all — not whether the stock is attractive. A failed gate means a real required input is missing or the assumptions are inconsistent (e.g. terminal growth ≥ discount rate), never a fabricated fallback.</div>
            </div>
          ) : (
            <>
              {/* verdict */}
              <div style={{ background: "var(--soft)", borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
                  <div>
                    <div style={STAT_LABEL}>RECOMMENDATION</div>
                    <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 800, color: recColor(result.recommendation), marginTop: 3 }}>{result.recommendation}</div>
                  </div>
                  <div>
                    <div style={STAT_LABEL}>FAIR VALUE / SHARE</div>
                    <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 800, marginTop: 3 }}>{formatPrice(result.fairValuePerShare)}</div>
                  </div>
                  <div>
                    <div style={STAT_LABEL}>MARKET PRICE</div>
                    <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 800, marginTop: 3 }}>{formatPrice(result.marketPrice)}</div>
                  </div>
                  <div>
                    <div style={STAT_LABEL}>UPSIDE</div>
                    <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 800, color: recColor(result.recommendation), marginTop: 3 }}>{fmtPct(result.upsidePct, 1)}</div>
                  </div>
                </div>
                {/* bear-to-bull gauge */}
                {(() => {
                  const lo = Math.min(result.bearFairValue, result.bullFairValue, result.marketPrice);
                  const hi = Math.max(result.bearFairValue, result.bullFairValue, result.marketPrice);
                  const spread = hi - lo || 1;
                  const pos = (v: number) => `${(((v - lo) / spread) * 100).toFixed(1)}%`;
                  return (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 9, color: "var(--faint)", marginBottom: 5 }}>WHERE THE MARKET PRICE SITS INSIDE THE BEAR TO BULL RANGE</div>
                      <div style={{ position: "relative", height: 8, borderRadius: 4, background: "linear-gradient(90deg,var(--down),var(--soft),var(--up))" }}>
                        <div title={`Market price ${formatPrice(result.marketPrice)}`} style={{ position: "absolute", left: pos(result.marketPrice), top: -4, width: 2, height: 16, background: "var(--text)", transform: "translateX(-1px)" }} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9.5, color: "var(--faint)", marginTop: 3, fontFamily: MONO }}>
                        <span>Bear {formatPrice(Math.min(result.bearFairValue, result.bullFairValue))}</span>
                        <span>Bull {formatPrice(Math.max(result.bearFairValue, result.bullFairValue))}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* stat row */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 14 }}>
                <div><div style={STAT_LABEL}>COST OF EQUITY</div><div style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 700, marginTop: 2 }}>{fmtPct(result.costOfEquity, 2)}</div></div>
                <div><div style={STAT_LABEL}>BETA</div><div style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 700, marginTop: 2 }}>{inputs.beta?.toFixed(3) ?? "—"}</div></div>
                <div><div style={STAT_LABEL}>FCF (TTM)</div><div style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 700, marginTop: 2 }}>{fmtBn(inputs.fcfTtmBn)}</div></div>
                <div><div style={STAT_LABEL}>EQUITY VALUE</div><div style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 700, marginTop: 2 }}>{fmtBn(result.equityValueBn)}</div></div>
              </div>

              {/* sensitivity heatmap */}
              <div>
                <div style={{ fontSize: 9, color: "var(--faint)", marginBottom: 6 }}>FAIR VALUE PER SHARE BY DISCOUNT RATE × TERMINAL GROWTH</div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ borderCollapse: "collapse", fontSize: 10.5, fontFamily: MONO, minWidth: 380 }}>
                    <thead>
                      <tr>
                        <th style={{ padding: "4px 8px", color: "var(--faint)", fontWeight: 700, textAlign: "left" }}>Ke ↓ · g →</th>
                        {grid[0]?.map((c, i) => (
                          <th key={i} style={{ padding: "4px 8px", color: "var(--faint)", fontWeight: 700 }}>{(c.growth * 100).toFixed(1)}%</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {grid.map((row, ri) => (
                        <tr key={ri}>
                          <td style={{ padding: "4px 8px", color: "var(--faint)", fontWeight: 700 }}>{(costOfEquity(inputs.beta!, row[0].rate, assumptions.equityRiskPremium) * 100).toFixed(1)}%</td>
                          {row.map((c, ci) => {
                            const isBase = ri === 2 && ci === 2;
                            return (
                              <td key={ci} style={{ padding: "4px 8px", textAlign: "center", background: isBase ? "var(--accentSoft)" : "transparent", fontWeight: isBase ? 800 : 500, borderRadius: 6 }}>
                                {c.fairValue == null ? "—" : formatPrice(c.fairValue)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ fontSize: 9, color: "var(--faint)", marginTop: 6 }}>Rows: Cost of Equity shifted ±1pp · Columns: terminal growth shifted ±1pp. Centre cell = current assumptions.</div>
              </div>
            </>
          )}
        </div>
      </div>

      <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 14, lineHeight: 1.5, borderTop: "1px solid var(--hair)", paddingTop: 10 }}>
        Single-stage FCFE-style model: {ticker}&apos;s own reported Free Cash Flow (TTM) is grown at the FCF-growth assumption for the forecast horizon, discounted at the Cost of Equity (CAPM: risk-free + beta × equity risk premium), plus a Gordon-growth terminal value — summed to Equity Value, divided by shares outstanding (derived from market cap ÷ price, both real). Beta, FCF, revenue growth, price and share count are real published fields; risk-free rate, equity risk premium and terminal growth are macro assumptions you can adjust. This is one model, not a price target — a real DCF disagrees with market price for plenty of legitimate reasons (cyclicality, growth optionality, the market pricing risks this model doesn&apos;t capture).
      </div>
    </div>
  );
}
