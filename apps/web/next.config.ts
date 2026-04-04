import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a minimal self-contained build in .next/standalone
  // Required for the Docker multi-stage image (no node_modules at runtime)
  output: "standalone",
};

export default nextConfig;
