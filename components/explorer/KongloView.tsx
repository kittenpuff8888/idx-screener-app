"use client";

import { useApp } from "@/components/providers/AppProvider";
import { Card, CardHeader } from "@/components/shared/Card";

export function KongloView() {
  const { indexes, openTicker } = useApp();
  const groups = (indexes?.groups || []).filter((group) => group.section === "KONGLO INDEX");
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {groups.map((group) => (
        <Card key={group.id}>
          <CardHeader kicker="Konglo" title={group.label} />
          <p className="mb-4 text-sm text-muted">Constituent weights follow the provided KONGLO seed categories and normalized group weights.</p>
          <div className="flex flex-wrap gap-2">
            {group.constituents.slice(0, 18).map((item) => (
              <button key={item.ticker} type="button" onClick={() => openTicker(item.ticker)} className="rounded-full border border-white/10 px-3 py-1.5 text-sm font-semibold text-text hover:border-accent/40 hover:bg-accent/10">
                {item.ticker}
              </button>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
