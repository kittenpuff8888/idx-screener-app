"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** /explorer was an older duplicate of the Screener; /screener is the surviving
    version (BRIEF §1 DELETE). Static export has no server redirects, so this
    route stays as a client-side redirect to keep old links and bookmarks alive. */
export default function Page() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/screener");
  }, [router]);
  return (
    <p style={{ fontSize: 13.5, color: "var(--muted)", padding: "22px 0" }}>
      Explorer has moved to the Screener. Redirecting…
    </p>
  );
}
