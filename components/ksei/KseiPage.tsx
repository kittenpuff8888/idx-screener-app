"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { Button } from "@/components/shared/Button";
import { Card, CardHeader } from "@/components/shared/Card";
import { buildInvestorDirectory } from "@/lib/data/ksei";
import type { KseiIssuer } from "@/lib/domain/types";
import { KSEIChangesLog } from "./KSEIChangesLog";
import { KSEIConcentration } from "./KSEIConcentration";
import { KSEIIssuerDrawer } from "./KSEIIssuerDrawer";
import { KSEIIssuerTable } from "./KSEIIssuerTable";
import { KSEIInvestorDrawer } from "./KSEIInvestorDrawer";

export function KseiPage() {
  const { ksei, openTicker } = useApp();
  const [issuerSearch, setIssuerSearch] = useState("");
  const [investorSearch, setInvestorSearch] = useState("");
  const [issuer, setIssuer] = useState<KseiIssuer | null>(null);
  const [investor, setInvestor] = useState<string | null>(null);
  const investorDirectory = useMemo(() => buildInvestorDirectory(ksei), [ksei]);
  const issuers = useMemo(() => {
    const needle = issuerSearch.toLowerCase().trim();
    return (ksei?.records || []).filter((item) => !needle || `${item.ticker} ${item.companyName} ${item.sector} ${item.industry}`.toLowerCase().includes(needle)).slice(0, 160);
  }, [ksei, issuerSearch]);
  const investorMatches = useMemo(() => {
    const needle = investorSearch.toLowerCase().trim();
    if (!needle) return [];
    return [...investorDirectory.keys()].filter((name) => name.toLowerCase().includes(needle)).slice(0, 20);
  }, [investorDirectory, investorSearch]);
  const investorRows = investor ? investorDirectory.get(investor) || [] : [];

  return (
    <section className="view active" data-view-panel="ownership">
      <div className="view-intro">
        <div><span className="section-kicker">OWNERSHIP INTELLIGENCE</span><h2>KSEI Ownership</h2><p>Understand who controls a company, how concentrated ownership is, and which reported holders changed in the latest snapshot.</p></div>
      </div>
      <KSEIConcentration ksei={ksei} />
      <KSEIChangesLog changes={ksei?.investorChanges || []} onTicker={openTicker} />
      <Card>
        <CardHeader kicker="Issuer Search" title="Ownership records" />
        <div className="screener-controls two-col">
          <label><span>Issuer</span><input value={issuerSearch} onChange={(event) => setIssuerSearch(event.target.value)} placeholder="Search ticker, issuer, sector, industry" /></label>
          <div className="relative">
            <label><span>Investor</span><input value={investorSearch} onChange={(event) => setInvestorSearch(event.target.value)} placeholder="Search investor name" /></label>
            {investorMatches.length ? (
              <div className="ticker-suggestions static-suggestions">
                {investorMatches.map((name) => (
                  <button key={name} type="button" onClick={() => { setInvestor(name); setInvestorSearch(""); }} className="ticker-suggestion">{name}</button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <KSEIIssuerTable rows={issuers} onIssuer={setIssuer} onTicker={openTicker} />
      </Card>
      <KSEIIssuerDrawer issuer={issuer} onClose={() => setIssuer(null)} onTicker={(ticker) => { setIssuer(null); openTicker(ticker); }} />
      <KSEIInvestorDrawer investor={investor} rows={investorRows} onClose={() => setInvestor(null)} onTicker={(ticker) => { setInvestor(null); openTicker(ticker); }} />
    </section>
  );
}
