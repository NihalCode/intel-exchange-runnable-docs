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
    return [
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
