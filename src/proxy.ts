import type { NextRequest } from "next/server";

import { runDocumentationAuthProxy } from "@/lib/documentation-auth/proxy-auth";

export async function proxy(request: NextRequest) {
  return runDocumentationAuthProxy(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|auth(?:/|$)|.*\\.(?:png|svg|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
