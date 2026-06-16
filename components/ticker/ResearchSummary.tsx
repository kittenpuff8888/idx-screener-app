"use client";

import { Card, CardHeader } from "@/components/shared/Card";

export function ResearchSummary({ summary }: { summary: string }) {
  return (
    <Card>
      <CardHeader kicker="Research Summary" title="Why this ticker matters" />
      <p className="text-base leading-8 text-muted">{summary}</p>
    </Card>
  );
}
