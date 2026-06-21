export function ResearchSummary({ summary }: { summary: string }) {
  return (
    <>
      <span className="panel-kicker">Research Conclusion</span>
      <h3>Why this ticker matters</h3>
      <p>{summary}</p>
    </>
  );
}
