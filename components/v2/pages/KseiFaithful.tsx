"use client";

import { V2Shell } from "@/components/v2/V2Shell";
import { KseiPage } from "@/components/ksei/KseiPage";

// KSEI Ownership — the real-data ownership page (concentration metrics, free
// float, HHI, CR1/CR3, composition) in the prototype shell. The prototype's
// per-holder / By-Investor / Conglomerates / Changelog tabs are NOT reproduced:
// the real ksei/latest.json emits no per-holder rows or investor changes, so
// those would be empty "no data" until the Python pipeline is extended.
export function KseiFaithful() {
  return (
    <V2Shell active="ksei" title="KSEI Ownership">
      <main style={{ flex: 1, minWidth: 0, padding: "22px 30px 64px", background: "var(--bg)" }}>
        <KseiPage />
      </main>
    </V2Shell>
  );
}
