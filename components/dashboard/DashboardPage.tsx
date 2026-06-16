"use client";

import { useApp } from "@/components/providers/AppProvider";
import { SkeletonCard } from "@/components/shared/SkeletonCard";
import { BreadthCard } from "./BreadthCard";
import { IndexStrip } from "./IndexStrip";
import { KSEIChanges } from "./KSEIChanges";
import { MarketToneHero } from "./MarketToneHero";
import { PriorityIdeas } from "./PriorityIdeas";
import { SectorMomentum } from "./SectorMomentum";

export function DashboardPage() {
  const { loading, bundle } = useApp();
  if (loading && !bundle) {
    return <div className="grid gap-4 md:grid-cols-2"><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>;
  }
  return (
    <div className="page-stack">
      <div className="page-title">
        <div>
          <h1>Research Dashboard</h1>
          <p>Start here to understand the market story, breadth, sector leadership, ownership changes, and what to inspect next.</p>
        </div>
      </div>
      <MarketToneHero />
      <IndexStrip />
      <div className="panel-grid">
        <BreadthCard />
        <SectorMomentum />
        <KSEIChanges />
      </div>
      <PriorityIdeas />
    </div>
  );
}
