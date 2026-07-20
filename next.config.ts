import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // reactCompiler adds Babel to every file and significantly slows Vercel builds.
  reactCompiler: false,
  // Let Next.js inline small SVGs/data URIs instead of extra requests.
  compress: true,
  // Ingest/Postman API routes spawn scripts/ingest.mjs — include scripts in the trace.
  outputFileTracingIncludes: {
    "/api/products/*/ingest": ["./scripts/**/*"],
    "/api/developer/postman": ["./scripts/**/*"],
  },
  async headers() {
    // Baseline defense-in-depth applied to every response. We deliberately do
    // NOT set default-src/script-src/style-src/connect-src here: the app loads
    // Pyodide from a CDN and Google Fonts, and the App Router emits inline
    // hydration + theme scripts that a nonce-less strict CSP would break under
    // SSG. The directives below add clickjacking, <base>, and plugin/object
    // protection with zero behavioral risk. frame-ancestors supersedes
    // X-Frame-Options in modern browsers.
    const baselineCsp =
      "base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'; upgrade-insecure-requests";
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: baselineCsp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
      {
        source: "/admin/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "private, no-store" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        source: "/api/admin/control-plane/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
