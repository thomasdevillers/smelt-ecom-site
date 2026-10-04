import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  experimental: {
    // Ship CSS in <style> tags instead of render-blocking <link> requests.
    inlineCss: true,
  },
};

export default nextConfig;
