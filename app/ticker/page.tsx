import { Suspense } from "react";
import { TickerResearch } from "@/components/ticker/TickerResearch";

// useSearchParams needs a Suspense boundary under static export.
export default function TickerPage() {
  return (
    <Suspense fallback={<section />}>
      <TickerResearch />
    </Suspense>
  );
}
