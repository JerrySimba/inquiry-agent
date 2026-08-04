import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@inquiry/db", "@inquiry/agent", "@inquiry/channels"],
  serverExternalPackages: ["postgres", "bcryptjs"],
};

export default nextConfig;
