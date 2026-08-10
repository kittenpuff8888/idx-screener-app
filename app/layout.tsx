import type { Metadata } from "next";
import { AppProvider } from "@/components/providers/AppProvider";
import { AppShell } from "@/components/layout/AppShell";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "8888 Screener",
  description: "Institutional IDX equity screener — wealth doesn't wander. It lands.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AppProvider>
          <AppShell>{children}</AppShell>
        </AppProvider>
      </body>
    </html>
  );
}
