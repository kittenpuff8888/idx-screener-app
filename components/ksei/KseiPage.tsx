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
    <div className="page-stack">
      <div className="page-title">
        <div>
          <h1>KSEI Ownership</h1>
          <p>Understand who controls a company, how concentrated ownership is, and which reported holders changed in the latest snapshot.</p>
        </div>
      </div>
      <KSEIConcentration ksei={ksei} />
      <KSEIChangesLog changes={ksei?.investorChanges || []} onTicker={openTicker} />
      <Card>
        <CardHeader kicker="Issuer Search" title="Ownership records" />
        <div className="mb-4 grid gap-3 md:grid-cols-2">
          <input value={issuerSearch} onChange={(event) => setIssuerSearch(event.target.value)} placeholder="Search ticker, issuer, sector, industry" className="min-h-10 rounded-md border border-white/10 bg-surface-2 px-3 text-sm text-text focus:border-accent focus:outline-none" />
          <div className="relative">
            <input value={investorSearch} onChange={(event) => setInvestorSearch(event.target.value)} placeholder="Search investor name" className="min-h-10 w-full rounded-md border border-white/10 bg-surface-2 px-3 text-sm text-text focus:border-accent focus:outline-none" />
            {investorMatches.length ? (
              <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-lg border border-white/10 bg-surface shadow-terminal">
                {investorMatches.map((name) => (
                  <button key={name} type="button" onClick={() => { setInvestor(name); setInvestorSearch(""); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-accent/10">{name}</button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <KSEIIssuerTable rows={issuers} onIssuer={setIssuer} onTicker={openTicker} />
      </Card>
      <KSEIIssuerDrawer issuer={issuer} onClose={() => setIssuer(null)} onTicker={(ticker) => { setIssuer(null); openTicker(ticker); }} />
      <KSEIInvestorDrawer investor={investor} rows={investorRows} onClose={() => setInvestor(null)} onTicker={(ticker) => { setInvestor(null); openTicker(ticker); }} />
    </div>
  );
}
