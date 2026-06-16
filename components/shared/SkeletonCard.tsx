import { Card } from "./Card";

export function SkeletonCard() {
  return (
    <Card>
      <div className="h-4 w-32 animate-pulse rounded bg-white/10" />
      <div className="mt-5 h-8 w-3/4 animate-pulse rounded bg-white/10" />
      <div className="mt-3 h-4 w-full animate-pulse rounded bg-white/10" />
      <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-white/10" />
    </Card>
  );
}
