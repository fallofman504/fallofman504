import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every order page is per-customer and payment-sensitive, so pages render fresh on each request.
  serverExternalPackages: ["better-sqlite3", "sharp"],
};

export default nextConfig;
