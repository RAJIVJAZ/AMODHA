import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // The paid membership was replaced by milk subscriber benefits.
    return [
      { source: "/membership", destination: "/milk-subscription", permanent: true },
      // Easy-to-type addresses for the wholesale (B2B) app and the sales team's app.
      { source: "/b2b", destination: "/trade", permanent: false },
      { source: "/b2b/:path*", destination: "/trade/:path*", permanent: false },
      { source: "/wholesale/app", destination: "/trade", permanent: false },
    ];
  },
};

export default nextConfig;
