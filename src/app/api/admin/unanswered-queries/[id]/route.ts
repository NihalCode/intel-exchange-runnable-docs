import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { UNANSWERED_QUERY_REVIEW_STATUSES } from "@/lib/domains/types";
import type { UnansweredQueryReviewStatus } from "@/lib/domains/types";
import { appendEnterpriseAuditEvent } from "@/lib/enterprise/audit";
import { guardEnterpriseApi } from "@/lib/enterprise/guard";
import { requireEnterpriseMutationRateLimit, requireMutationCsrf } from "@/lib/enterprise/http";
import {
  getUnansweredReviewSensitive,
  updateUnansweredQueryReview,
} from "@/lib/query-analytics/repository";

export const runtime = "nodejs";

const STATUSES = new Set<string>(UNANSWERED_QUERY_REVIEW_STATUSES);

const SENSITIVE_READ_PERMISSIONS = [
  "query_analytics.read_sensitive",
  "unanswered_queries.read_sensitive",
] as const;

function statusCodeForQuery(
  queryStatus: "ok" | "not_captured" | "decrypt_failed" | "encryption_key_missing"
): string | undefined {
  if (queryStatus === "not_captured") return "NOT_CAPTURED";
  if (queryStatus === "decrypt_failed") return "DECRYPT_FAILED";
  if (queryStatus === "encryption_key_missing") return "ENCRYPTION_KEY_MISSING";
  return undefined;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (request.nextUrl.searchParams.get("sensitive") !== "1") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const access = await guardEnterpriseApi(request, SENSITIVE_READ_PERMISSIONS);
  if (access instanceof NextResponse) return access;

  const { id } = await context.params;
  const orgId = access.context.organization.id;
  const sensitive = await getUnansweredReviewSensitive({
    organizationId: orgId,
    reviewId: id,
  });
  if (!sensitive) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await appendEnterpriseAuditEvent({
    organizationId: orgId,
    actorUserId: access.context.principal.userId,
    action: "query_analytics.sensitive_read",
    resourceType: "unanswered_query_reviews",
    resourceId: id,
    outcome: "success",
    correlationId: randomUUID(),
  });

  return NextResponse.json({
    queryText: sensitive.queryText,
    clientIp: sensitive.clientIp,
    queryStatus: sensitive.queryStatus,
    ipStatus: sensitive.ipStatus,
    code: statusCodeForQuery(sensitive.queryStatus),
  });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const csrfFailure = requireMutationCsrf(request);
  if (csrfFailure) return csrfFailure;

  const access = await guardEnterpriseApi(request, "unanswered_queries.manage");
  if (access instanceof NextResponse) return access;
  const rateLimited = requireEnterpriseMutationRateLimit(access);
  if (rateLimited) return rateLimited;

  const { id } = await context.params;
  const body = (await request.json()) as { status?: string; notes?: string | null };
  const status = body.status?.trim();
  if (!status || !STATUSES.has(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const ok = await updateUnansweredQueryReview({
    organizationId: access.context.organization.id,
    id,
    status: status as UnansweredQueryReviewStatus,
    notes: body.notes,
  });
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
