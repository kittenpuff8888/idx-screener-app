// Discounted Cash Flow valuation — a standard, single-stage FCFE-style model:
// grow the company's own reported Free Cash Flow (TTM) forward at an assumed
// rate, discount every year (plus a Gordon-growth terminal value) at the Cost
// of Equity from CAPM, sum to Equity Value, divide by share count.
//
// Deliberately uses Cost of Equity (risk-free + beta*ERP) as the single
// discount rate rather than a full WACC: the only cash-flow figure this app
// has is yfinance's reported "Free cash flow (TTM)" (operating cash flow −
// capex), which is already a levered, post-financing number — discounting it
// at WACC and then also subtracting net debt would double-count leverage.
// Discounting a levered flow at Cost of Equity and skipping the net-debt
// bridge is the internally-consistent choice for the data actually available.
//
// Every input that CAN be real, is real (beta, FCF, revenue growth, price,
// share count, 52-week range). risk-free rate, equity risk premium, and
// terminal growth are macro assumptions by nature — there is no per-ticker
// "true" value to fetch, so they are user-adjustable with sensible defaults,
// exactly like the reference tool's sliders.

export type DcfAssumptions = {
  riskFreeRate: number;      // ratio, e.g. 0.071
  equityRiskPremium: number; // ratio, e.g. 0.06
  fcfGrowthRate: number;     // ratio, explicit-forecast FCF growth (defaults from real revenue growth)
  terminalGrowthRate: number; // ratio, e.g. 0.031
  forecastYears: number;     // 1-10
};

export const DEFAULT_ASSUMPTIONS: Omit<DcfAssumptions, "fcfGrowthRate"> = {
  riskFreeRate: 0.071,
  equityRiskPremium: 0.06,
  terminalGrowthRate: 0.031,
  forecastYears: 5,
};

export type DcfInputs = {
  ticker: string;
  price: number | null;
  beta: number | null;
  fcfTtmBn: number | null;   // Free cash flow (TTM), billions IDR — real, reported
  revenueGrowth: number | null; // Revenue (Quarter YoY Growth) — real, used as the growth-slider default
  sharesOutstanding: number | null; // derived: marketCap / price (both real, raw)
  week52High: number | null;
  week52Low: number | null;
  currency: string; // always "IDR" for IDX tickers — no FX conversion needed
};

export type EligibilityGate = { id: string; label: string; pass: boolean; detail: string };

export type DcfScenario = { label: string; fairValue: number; upsidePct: number };

export type DcfResult =
  | { eligible: false; gates: EligibilityGate[] }
  | {
      eligible: true;
      gates: EligibilityGate[];
      costOfEquity: number;
      fairValuePerShare: number;
      marketPrice: number;
      upsidePct: number;
      recommendation: "BUY" | "HOLD" | "SELL";
      equityValueBn: number;
      bearFairValue: number;
      bullFairValue: number;
      cashFlows: Array<{ year: number; fcfBn: number; pv: number }>;
      terminalValueBn: number;
      pvTerminalBn: number;
    };

function gate(id: string, label: string, pass: boolean, detail: string): EligibilityGate {
  return { id, label, pass, detail };
}

/** CAPM cost of equity: risk-free + beta * ERP. */
export function costOfEquity(beta: number, riskFree: number, erp: number): number {
  return riskFree + beta * erp;
}

/** Present value of a growing-FCF projection + Gordon-growth terminal value,
    all in billions IDR (the unit the source fundamentals publish). */
function projectEquityValue(fcf0Bn: number, discountRate: number, assumptions: DcfAssumptions) {
  const { fcfGrowthRate, terminalGrowthRate, forecastYears } = assumptions;
  const cashFlows: Array<{ year: number; fcfBn: number; pv: number }> = [];
  let pvSum = 0;
  let lastFcf = fcf0Bn;
  for (let year = 1; year <= forecastYears; year += 1) {
    lastFcf = lastFcf * (1 + fcfGrowthRate);
    const pv = lastFcf / Math.pow(1 + discountRate, year);
    cashFlows.push({ year, fcfBn: lastFcf, pv });
    pvSum += pv;
  }
  const terminalValueBn = (lastFcf * (1 + terminalGrowthRate)) / (discountRate - terminalGrowthRate);
  const pvTerminalBn = terminalValueBn / Math.pow(1 + discountRate, forecastYears);
  return { equityValueBn: pvSum + pvTerminalBn, cashFlows, terminalValueBn, pvTerminalBn };
}

export function computeDcf(inputs: DcfInputs, assumptions: DcfAssumptions): DcfResult {
  const { price, beta, fcfTtmBn, sharesOutstanding } = inputs;
  const gates: EligibilityGate[] = [
    gate("price", "Market price available", price != null && price > 0, price != null ? `Rp ${price}` : "no data"),
    gate("beta", "Beta available", beta != null, beta != null ? beta.toFixed(3) : "no data"),
    gate("fcf", "Positive reported Free Cash Flow (TTM)", fcfTtmBn != null && fcfTtmBn > 0, fcfTtmBn != null ? `${fcfTtmBn.toFixed(0)} Bn IDR` : "no data — FCFF/DCF is not meaningful without a positive base cash flow"),
    gate("shares", "Share count derivable", sharesOutstanding != null && sharesOutstanding > 0, sharesOutstanding != null ? sharesOutstanding.toLocaleString() : "no data"),
  ];
  const passed = gates.every((g) => g.pass);
  if (!passed) return { eligible: false, gates };

  const ke = costOfEquity(beta!, assumptions.riskFreeRate, assumptions.equityRiskPremium);
  const rateGate = gate("rate", "Discount rate exceeds terminal growth", ke > assumptions.terminalGrowthRate, `Cost of equity ${(ke * 100).toFixed(2)}% vs terminal growth ${(assumptions.terminalGrowthRate * 100).toFixed(2)}%`);
  const allGates = [...gates, rateGate];
  if (!rateGate.pass) return { eligible: false, gates: allGates };

  const base = projectEquityValue(fcfTtmBn!, ke, assumptions);
  const fairValuePerShare = (base.equityValueBn * 1e9) / sharesOutstanding!;
  const upsidePct = (fairValuePerShare - price!) / price!;
  const recommendation = upsidePct >= 0.1 ? "BUY" : upsidePct <= -0.1 ? "SELL" : "HOLD";

  // Bear/bull range: terminal growth held constant, discount rate shifted
  // ±1.5pp — a simple, transparent way to show the spread without a full
  // scenario engine (matches the reference's bear-to-bull gauge).
  const bear = projectEquityValue(fcfTtmBn!, ke + 0.015, assumptions);
  const bull = projectEquityValue(fcfTtmBn!, Math.max(ke - 0.015, assumptions.terminalGrowthRate + 0.005), assumptions);

  return {
    eligible: true,
    gates: allGates,
    costOfEquity: ke,
    fairValuePerShare,
    marketPrice: price!,
    upsidePct,
    recommendation,
    equityValueBn: base.equityValueBn,
    bearFairValue: (bear.equityValueBn * 1e9) / sharesOutstanding!,
    bullFairValue: (bull.equityValueBn * 1e9) / sharesOutstanding!,
    cashFlows: base.cashFlows,
    terminalValueBn: base.terminalValueBn,
    pvTerminalBn: base.pvTerminalBn,
  };
}

/** Fair value per share across a discount-rate x terminal-growth grid, for the
    sensitivity heatmap. Cells where the rate doesn't exceed the growth are
    marked invalid rather than showing a divergent/negative number. */
export function sensitivityGrid(
  inputs: DcfInputs,
  base: DcfAssumptions,
  rateSteps: number[],
  growthSteps: number[],
): Array<Array<{ rate: number; growth: number; fairValue: number | null }>> {
  const { beta, fcfTtmBn, sharesOutstanding, price } = inputs;
  if (beta == null || fcfTtmBn == null || sharesOutstanding == null || price == null) return [];
  return rateSteps.map((rateDelta) =>
    growthSteps.map((growth) => {
      const ke = costOfEquity(beta, base.riskFreeRate + rateDelta, base.equityRiskPremium);
      if (ke <= growth) return { rate: base.riskFreeRate + rateDelta, growth, fairValue: null };
      const proj = projectEquityValue(fcfTtmBn, ke, { ...base, terminalGrowthRate: growth });
      return { rate: base.riskFreeRate + rateDelta, growth, fairValue: (proj.equityValueBn * 1e9) / sharesOutstanding };
    }),
  );
}
