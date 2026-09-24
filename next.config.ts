import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV === "development";
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-src 'self'",
  // Intentionally open: the widget is meant to be embeddable on any site,
  // not just autreymill.org. This does remove clickjacking-style protection
  // for the iframe views (/embed) — a deliberate tradeoff for a
  // general-purpose embeddable widget, decided 2026-08-07.
  "frame-ancestors *",
  ...(isDevelopment ? [] : ["upgrade-insecure-requests"]),
].join("; ");

export const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

const nextConfig: NextConfig = {
  images: {
    // The app only ships small, trusted local logos. Serving them directly
    // removes an unnecessary runtime image-decoding surface.
    unoptimized: true,
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
