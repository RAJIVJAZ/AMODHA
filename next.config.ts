import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // The paid membership was replaced by milk subscriber benefits.
    return [{ source: "/membership", destination: "/milk-subscription", permanent: true }];
  },
};

export default nextConfig;
