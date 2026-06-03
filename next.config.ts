import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // reactCompiler adds Babel to every file and significantly slows Vercel builds.
  reactCompiler: false,
  // Let Next.js inline small SVGs/data URIs instead of extra requests.
  compress: true,
};

export default nextConfig;
