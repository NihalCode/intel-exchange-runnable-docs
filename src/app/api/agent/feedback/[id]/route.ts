import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { guardAskAgent } from "@/lib/documentation-auth/guard-api";
import { isAuthEnabled } from "@/lib/documentation-auth/config";
import { checkRateLimit } from "@/lib/documentation-auth/rate-limit";
import {
  FeedbackConflictError,
  parseFeedbackRating,
  patchChatFeedback,
  removeChatFeedback,
} from "@/lib/chat-feedback/service";
import { resolveChatFeedbackEnabled } from "@/lib/domains/feature-gates-resolve";
import { requireMutationCsrf } from "@/lib/enterprise/http";
import { resolveOrganizationContext } from "@/lib/enterprise/organization-context";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await guardAskAgent(request);
  if (session instanceof NextResponse) return session;

  if (isAuthEnabled()) {
    const csrfFailure = requireMutationCsrf(request);
    if (csrfFailure) return csrfFailure;
  }

  if (!checkRateLimit(`feedback:${session.user.id}`, 20, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const orgContext = await resolveOrganizationContext(session);
    const enabled = await resolveChatFeedbackEnabled({
      organizationId: orgContext.organization.id,
      role: orgContext.principal.role,
    });
    if (!enabled) {
      return NextResponse.json(
        { error: "Feature unavailable", code: "FEATURE_DISABLED" },
        { status: 403 }
      );
    }

    const { id } = await context.params;
    const body = (await request.json()) as {
      rating?: string;
      comment?: string | null;
      expectedVersion?: number;
    };
    const rating = body.rating != null ? parseFeedbackRating(body.rating) : undefined;
    if (body.rating != null && !rating) {
      return NextResponse.json({ error: "Invalid rating" }, { status: 400 });
    }

    const row = await patchChatFeedback({
      organizationId: orgContext.organization.id,
      userId: session.user.id,
      id,
      rating: rating ?? undefined,
      comment: body.comment,
      expectedVersion: body.expectedVersion,
    });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({
      id: row.id,
      rating: row.rating,
      version: row.version,
      messageId: row.messageId,
    });
  } catch (error) {
    if (error instanceof FeedbackConflictError) {
      return NextResponse.json({ error: "Version conflict" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to update feedback" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await guardAskAgent(request);
  if (session instanceof NextResponse) return session;

  if (isAuthEnabled()) {
    const csrfFailure = requireMutationCsrf(request);
    if (csrfFailure) return csrfFailure;
  }

  if (!checkRateLimit(`feedback:${session.user.id}`, 20, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const orgContext = await resolveOrganizationContext(session);
    const enabled = await resolveChatFeedbackEnabled({
      organizationId: orgContext.organization.id,
      role: orgContext.principal.role,
    });
    if (!enabled) {
      return NextResponse.json(
        { error: "Feature unavailable", code: "FEATURE_DISABLED" },
        { status: 403 }
      );
    }

    const { id } = await context.params;
    const ok = await removeChatFeedback({
      organizationId: orgContext.organization.id,
      userId: session.user.id,
      id,
    });
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete feedback" }, { status: 500 });
  }
}
