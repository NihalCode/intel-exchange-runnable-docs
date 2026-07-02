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
};

export default nextConfig;
