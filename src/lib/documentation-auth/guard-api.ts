import { NextRequest, NextResponse } from "next/server";

import type { DocumentationPermission } from "@/lib/documentation-auth/types";
import {
  getAppSessionResult,
  requirePermission,
  requireSession,
  type AppSession,
} from "@/lib/documentation-auth/session";
import { isAuthEnabled } from "@/lib/documentation-auth/config";
import { verifyDeveloperRequest } from "@/lib/developer/access";

/** Guard documentation API routes with invite-only session + optional permission. */
export async function guardDocumentationApi(
  request: NextRequest,
  permission?: DocumentationPermission
): Promise<AppSession | NextResponse> {
  if (!isAuthEnabled()) {
    const dev = verifyDeveloperRequest(request);
    if (!dev.ok) {
      return NextResponse.json({ ok: false, error: dev.error }, { status: dev.status });
    }
    return {
      user: {
        id: "developer-token",
        auth0UserId: "developer-token",
        email: "developer@local",
        name: "Developer",
        role: "developer",
        status: "active",
      },
      authProvider: "disabled",
    };
  }

  if (permission) {
    return requirePermission(permission, request);
  }
  return requireSession(request);
}

export async function guardReadDocs(request: NextRequest): Promise<AppSession | NextResponse> {
  return guardDocumentationApi(request, "read_docs");
}

export async function guardAskAgent(request: NextRequest): Promise<AppSession | NextResponse> {
  return guardDocumentationApi(request, "ask_agent");
}

export async function guardDeveloperDiagnostics(
  request: NextRequest
): Promise<AppSession | NextResponse> {
  if (!isAuthEnabled()) {
    const dev = verifyDeveloperRequest(request);
    if (!dev.ok) {
      return NextResponse.json({ ok: false, error: dev.error }, { status: dev.status });
    }
    return {
      user: {
        id: "developer-token",
        auth0UserId: "developer-token",
        email: "developer@local",
        name: "Developer",
        role: "developer",
        status: "active",
      },
      authProvider: "disabled",
    };
  }
  return requirePermission("view_technical_diagnostics", request);
}

export async function guardSyncDocs(
  request: NextRequest
): Promise<AppSession | NextResponse> {
  return guardDocumentationApi(request, "sync_docs");
}

export async function guardManageSources(
  request: NextRequest
): Promise<AppSession | NextResponse> {
  return guardDocumentationApi(request, "manage_sources");
}

export async function getSessionOrDenied(request: NextRequest) {
  return getAppSessionResult(request);
}
