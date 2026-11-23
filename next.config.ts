import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.0.11", "192.168.0.13"],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
