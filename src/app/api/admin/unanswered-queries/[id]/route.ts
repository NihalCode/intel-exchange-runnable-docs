import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { UNANSWERED_QUERY_REVIEW_STATUSES } from "@/lib/domains/types";
import type { UnansweredQueryReviewStatus } from "@/lib/domains/types";
import { guardEnterpriseApi } from "@/lib/enterprise/guard";
import { updateUnansweredQueryReview } from "@/lib/query-analytics/repository";

export const runtime = "nodejs";

const STATUSES = new Set<string>(UNANSWERED_QUERY_REVIEW_STATUSES);

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const access = await guardEnterpriseApi(request, "unanswered_queries.manage");
  if (access instanceof NextResponse) return access;

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
