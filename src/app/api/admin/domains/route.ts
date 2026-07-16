import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  createDomainMapping,
  listDomainMappings,
  updateDomainMapping,
  DomainMappingVersionConflictError,
} from "@/lib/domains/repository";
import { guardEnterpriseApi } from "@/lib/enterprise/guard";
import { requireMutationCsrf } from "@/lib/enterprise/http";
import { isProductKey } from "@/lib/products/registry";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const access = await guardEnterpriseApi(request, "domains.read");
  if (access instanceof NextResponse) return access;
  const mappings = await listDomainMappings(access.context.organization.id);
  return NextResponse.json({ mappings });
}

export async function POST(request: NextRequest) {
  const csrfFailure = requireMutationCsrf(request);
  if (csrfFailure) return csrfFailure;
  const access = await guardEnterpriseApi(request, "domains.manage");
  if (access instanceof NextResponse) return access;

  const body = (await request.json()) as {
    hostname?: string;
    kind?: "product" | "admin" | "auth";
    productId?: string;
    environment?: string;
    enabled?: boolean;
  };

  const hostname = body.hostname?.trim();
  if (!hostname) {
    return NextResponse.json({ error: "hostname is required" }, { status: 400 });
  }
  const kind = body.kind ?? "product";
  if (kind === "product" && body.productId && !isProductKey(body.productId)) {
    return NextResponse.json({ error: "Invalid productId" }, { status: 400 });
  }

  try {
    const mapping = await createDomainMapping({
      organizationId: access.context.organization.id,
      userId: access.session.user.id,
      mapping: {
        hostname,
        kind,
        productId: kind === "product" && body.productId && isProductKey(body.productId)
          ? body.productId
          : null,
        environment: (body.environment as "development" | "staging" | "production") ?? "production",
        isPrimary: false,
        enabled: body.enabled !== false,
      },
    });
    return NextResponse.json({ mapping }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Create failed" },
      { status: 400 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const csrfFailure = requireMutationCsrf(request);
  if (csrfFailure) return csrfFailure;
  const access = await guardEnterpriseApi(request, "domains.manage");
  if (access instanceof NextResponse) return access;

  const body = (await request.json()) as {
    id?: string;
    expectedVersion?: number;
    enabled?: boolean;
    verificationStatus?: "pending" | "verified" | "failed";
  };

  if (!body.id || typeof body.expectedVersion !== "number") {
    return NextResponse.json({ error: "id and expectedVersion required" }, { status: 400 });
  }

  try {
    const mapping = await updateDomainMapping({
      organizationId: access.context.organization.id,
      userId: access.session.user.id,
      id: body.id,
      expectedVersion: body.expectedVersion,
      patch: {
        enabled: body.enabled,
        verificationStatus: body.verificationStatus,
      },
    });
    return NextResponse.json({ mapping });
  } catch (err) {
    if (err instanceof DomainMappingVersionConflictError) {
      return NextResponse.json({ error: "Version conflict" }, { status: 409 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Update failed" },
      { status: 400 }
    );
  }
}
