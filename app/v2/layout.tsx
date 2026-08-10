// v2 redesign namespace (feature-flagged). Legacy AppShell chrome is bypassed
// for /v2 in components/layout/AppShell.tsx; AppProvider (real data) still wraps
// this subtree from the root layout. Each page renders its own <V2Shell>.
import "@/styles/v2.css";

export default function V2Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
