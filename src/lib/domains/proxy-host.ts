import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { hostContextRequestHeaders } from "@/lib/domains/host-headers";
import {
  hasConfiguredAdminDomain,
  isDomainRoutingEnabled,
  isSeparateAdminDomainEnabled,
} from "@/lib/domains/feature-gates";
import { isSingleProductDeployment } from "@/lib/deployment/resolve-app-product-id";
import { trustedRequestHostname } from "@/lib/domains/request-host";
import {
  crossProductPathMismatch,
  isAdminPathOnProductHost,
  isProductContentPath,
  productHostDocsRewrite,
} from "@/lib/domains/route-rewrite";
import { resolveHost } from "@/lib/domains/resolver";
import { adminDashboardUrl, productOriginUrl } from "@/lib/domains/urls";
import { HostResolutionError } from "@/lib/domains/types";

function attachHostHeaders(
  request: NextRequest,
  authResponse: NextResponse,
  extraHeaders: Record<string, string>,
  rewriteUrl?: URL
): NextResponse {
  const requestHeaders = new Headers(request.headers);
  for (const [key, value] of Object.entries(extraHeaders)) {
    requestHeaders.set(key, value);
  }
  requestHeaders.set("x-pathname", request.nextUrl.pathname + request.nextUrl.search);

  const response = rewriteUrl
    ? NextResponse.rewrite(rewriteUrl, { request: { headers: requestHeaders } })
    : NextResponse.next({ request: { headers: requestHeaders } });

  authResponse.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "x-middleware-next") response.headers.set(key, value);
  });
  return response;
}

export async function applyHostRouting(
  request: NextRequest,
  authResponse: NextResponse
): Promise<NextResponse | null> {
  const routingActive = isDomainRoutingEnabled() || isSingleProductDeployment();
  if (!routingActive) return null;

  const hostname = trustedRequestHostname(request);
  const { pathname } = request.nextUrl;

  let hostContext;
  try {
    hostContext = await resolveHost(hostname);
  } catch (error) {
    if (error instanceof HostResolutionError) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: 404 }
        );
      }
      return NextResponse.rewrite(new URL("/access/disabled", request.url));
    }
    // DB unavailable in proxy — skip host routing instead of failing the request.
    return attachHostHeaders(request, authResponse, {});
  }

  if (!hostContext) {
    if (isSingleProductDeployment() && hostname.endsWith(".vercel.app")) {
      return null;
    }
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unknown host", code: "UNKNOWN_HOST" }, { status: 404 });
    }
    return NextResponse.rewrite(new URL("/access/disabled", request.url));
  }

  const contextHeaders = hostContextRequestHeaders(hostContext);

  if (hostContext.domainKind === "admin") {
    if (isSeparateAdminDomainEnabled() && isProductContentPath(pathname)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (pathname === "/" || pathname === "") {
      return attachHostHeaders(request, authResponse, contextHeaders, new URL("/admin", request.url));
    }
    if (!pathname.startsWith("/admin") && !pathname.startsWith("/api/") && !pathname.startsWith("/auth")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return attachHostHeaders(request, authResponse, contextHeaders);
  }

  if (hostContext.domainKind === "product") {
    if (isAdminPathOnProductHost(pathname)) {
      const redirectAdminElsewhere =
        isSeparateAdminDomainEnabled() && hasConfiguredAdminDomain();
      if (redirectAdminElsewhere) {
        return NextResponse.redirect(
          adminDashboardUrl(pathname + request.nextUrl.search)
        );
      }
      return attachHostHeaders(request, authResponse, contextHeaders);
    }
    if (crossProductPathMismatch(pathname, hostContext)) {
      const target = hostContext.productId ? productOriginUrl(hostContext.productId) : null;
      if (target) return NextResponse.redirect(new URL(pathname, target));
      return NextResponse.json({ error: "Product mismatch" }, { status: 403 });
    }
    const rewritePath = productHostDocsRewrite(pathname, hostContext);
    if (rewritePath === "__CROSS_PRODUCT_MISMATCH__") {
      return NextResponse.json({ error: "Product mismatch" }, { status: 403 });
    }
    if (rewritePath) {
      const rewrite = new URL(rewritePath + request.nextUrl.search, request.url);
      return attachHostHeaders(request, authResponse, contextHeaders, rewrite);
    }
  }

  return attachHostHeaders(request, authResponse, contextHeaders);
}
