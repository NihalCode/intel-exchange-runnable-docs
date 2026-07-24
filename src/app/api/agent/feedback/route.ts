import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { guardAskAgent } from "@/lib/documentation-auth/guard-api";
import { isAuthEnabled } from "@/lib/documentation-auth/config";
import { isAnonymousViewerSession } from "@/lib/documentation-auth/anonymous-viewer";
import { checkRateLimit } from "@/lib/documentation-auth/rate-limit";
import {
  FeedbackConflictError,
  FeedbackValidationError,
  parseFeedbackRating,
  parseProductId,
  submitChatFeedback,
} from "@/lib/chat-feedback/service";
import { ensureAnonymousFeedbackPrincipal } from "@/lib/chat-feedback/anonymous-principal";
import {
  resolveChatFeedbackEnabled,
  resolveRecaptchaProtectionEnabled,
} from "@/lib/domains/feature-gates-resolve";
import { requireMutationCsrf } from "@/lib/enterprise/http";
import {
  OrganizationContextError,
  resolveOrganizationContextOrBootstrap,
} from "@/lib/enterprise/organization-context";
import { trustedHostnameFromHeaders } from "@/lib/domains/request-host";
import { verifyRecaptchaToken } from "@/lib/recaptcha/verify";
import { resolveTrustedClientIp } from "@/lib/security/client-ip";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
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
    const context = isAnonymousViewerSession(session)
      ? await ensureAnonymousFeedbackPrincipal(session)
      : await resolveOrganizationContextOrBootstrap(session);

    const enabled = await resolveChatFeedbackEnabled({
      organizationId: context.organization.id,
      role: context.principal.role,
    });
    if (!enabled) {
      return NextResponse.json(
        { error: "Feature unavailable", code: "FEATURE_DISABLED" },
        { status: 403 }
      );
    }

    const body = (await request.json()) as {
      messageId?: string;
      rating?: string;
      comment?: string | null;
      conversationId?: string | null;
      turnId?: string | null;
      logicalQueryId?: string | null;
      productId?: string | null;
      recaptchaToken?: string | null;
      expectedVersion?: number;
    };

    const rating = parseFeedbackRating(body.rating);
    if (!rating) {
      return NextResponse.json({ error: "Invalid rating" }, { status: 400 });
    }
    if (!body.messageId?.trim()) {
      return NextResponse.json({ error: "messageId is required" }, { status: 400 });
    }

    const recaptchaEnabled = await resolveRecaptchaProtectionEnabled({
      organizationId: context.organization.id,
      role: context.principal.role,
    });
    if (recaptchaEnabled) {
      const verified = await verifyRecaptchaToken({
        token: body.recaptchaToken,
        expectedAction: "feedback_submit",
        remoteIp: resolveTrustedClientIp(request.headers),
        failSoft: true,
      });
      if (!verified.ok) {
        return NextResponse.json(
          { error: "reCAPTCHA verification failed", code: "RECAPTCHA_FAILED" },
          { status: 403 }
        );
      }
      if (
        verified.degraded &&
        !checkRateLimit(`feedback-degraded:${session.user.id}`, 8, 60_000)
      ) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429 });
      }
    }

    const hostname = trustedHostnameFromHeaders(request.headers) ?? null;
    const row = await submitChatFeedback({
      organizationId: context.organization.id,
      userId: context.principal.userId,
      messageId: body.messageId,
      rating,
      comment: body.comment,
      conversationId: body.conversationId ?? null,
      turnId: body.turnId ?? null,
      logicalQueryId: body.logicalQueryId ?? null,
      hostname,
      productId: parseProductId(body.productId),
      expectedVersion: body.expectedVersion,
    });

    return NextResponse.json({
      id: row.id,
      rating: row.rating,
      version: row.version,
      messageId: row.messageId,
    });
  } catch (error) {
    if (error instanceof FeedbackValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof FeedbackConflictError) {
      return NextResponse.json({ error: "Version conflict" }, { status: 409 });
    }
    if (error instanceof OrganizationContextError) {
      return NextResponse.json(
        {
          error:
            "Workspace session is not ready for feedback. Sign in again, then retry.",
          code: "ORG_CONTEXT_REQUIRED",
        },
        { status: 403 }
      );
    }
    console.error(
      JSON.stringify({
        level: "error",
        message: "chat_feedback_save_failed",
        error: error instanceof Error ? error.message : "unknown",
      })
    );
    return NextResponse.json({ error: "Failed to save feedback" }, { status: 500 });
  }
}
