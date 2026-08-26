import type { NextConfig } from "next";

// Cloudflare Pages serves this site from the domain root, unlike the old
// GitHub Pages project-site hosting (username.github.io/IDXScreener/) this
// config used to target with a subpath prefix.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  env: {
    NEXT_PUBLIC_BASE_PATH: "",
  },
};

export default nextConfig;
