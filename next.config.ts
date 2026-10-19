import type { NextConfig } from "next";

// Sent with every page. No other site may show these pages inside a frame (stops "clickjacking" of the
// staff, sales and wholesale apps); invoice links' tokens are not passed on to other sites in the
// Referer header; browsers must not guess file types; and the site is only used over HTTPS.
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), browsing-topics=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
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
