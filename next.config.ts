import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['child_process'],
  turbopack: {},
};

export default nextConfig;
