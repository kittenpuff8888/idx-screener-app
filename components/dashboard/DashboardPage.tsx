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
    return <div className="dashboard-summary-grid"><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>;
  }
  return (
    <section className="view active" data-view-panel="dashboard">
      <MarketToneHero />
      <section className="dashboard-summary-grid">
        <BreadthCard />
        <KSEIChanges />
        <PriorityIdeas />
        <SectorMomentum />
      </section>
      <IndexStrip />
    </section>
  );
}
