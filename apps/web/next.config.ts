import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  transpilePackages: ["@inquiry/db", "@inquiry/agent", "@inquiry/channels"],
  serverExternalPackages: ["postgres", "bcryptjs"],
  // Monorepo: resolve workspace packages from repo root on Vercel
  outputFileTracingRoot: path.join(__dirname, "../.."),
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
