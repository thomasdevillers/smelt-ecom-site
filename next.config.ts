import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY: process.env.PAYSTACK_PUBLIC_KEY,
    NEXT_PUBLIC_PAYSTACK_CONFIGURED: (!!process.env.PAYSTACK_SECRET_KEY).toString(),
  }
};

export default nextConfig;
