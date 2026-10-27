import type { NextConfig } from "next";

const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-eval' 'unsafe-inline' https://js.yoco.com;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  img-src 'self' blob: data: https://images.unsplash.com https://*.yoco.com;
  font-src 'self' https://fonts.gstatic.com;
  connect-src 'self' https://payments.yoco.com https://pay.yoco.com https://c.yoco.com https://js.yoco.com;
  frame-src 'self' https://payments.yoco.com https://pay.yoco.com https://c.yoco.com https://js.yoco.com;
  object-src 'none';
  base-uri 'self';
  form-action 'self' https://payments.yoco.com https://pay.yoco.com https://c.yoco.com;
  frame-ancestors 'none';
  upgrade-insecure-requests;
`.replace(/\n/g, "");

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: cspHeader,
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value:
              'camera=(), microphone=(), geolocation=(), payment=(self "https://payments.yoco.com" "https://pay.yoco.com" "https://c.yoco.com" "https://js.yoco.com")',
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
