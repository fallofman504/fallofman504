import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page here is per-customer and payment-sensitive, so pages render
  // fresh on each request instead of using Cache Components.
  serverExternalPackages: ["better-sqlite3"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
