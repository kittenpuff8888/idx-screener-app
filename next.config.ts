import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: isProd ? "/IDXScreener" : "",
  assetPrefix: isProd ? "/IDXScreener/" : "",
  images: { unoptimized: true },
  env: {
    NEXT_PUBLIC_BASE_PATH: isProd ? "/IDXScreener" : "",
  },
};

export default nextConfig;
