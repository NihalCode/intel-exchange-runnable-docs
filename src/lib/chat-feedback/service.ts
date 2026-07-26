import "server-only";

import { withOrganizationTransaction, type DbExecutor } from "@/lib/db/client";
import { isProductKey, type ProductKey } from "@/lib/products/registry";
import {
  applySatisfiedFeedbackToAnalytics,
  enqueueUnansweredFromNegativeFeedback,
  linkFeedback,
} from "@/lib/query-analytics/service";
import {
  deleteOwnedFeedback,
  FeedbackConflictError,
  type FeedbackRating,
  type ChatFeedbackRow,
  updateOwnedFeedback,
  upsertChatFeedback,
} from "@/lib/chat-feedback/repository";

export { FeedbackConflictError };
export type { FeedbackRating, ChatFeedbackRow };

const RATINGS = new Set<FeedbackRating>(["up", "down"]);

export function parseFeedbackRating(value: unknown): FeedbackRating | null {
  if (typeof value !== "string") return null;
  const rating = value.trim().toLowerCase() as FeedbackRating;
  return RATINGS.has(rating) ? rating : null;
}

export function parseProductId(value: unknown): ProductKey | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return isProductKey(value) ? value : null;
}

async function linkAnalyticsAndUnanswered(
  input: {
    organizationId: string;
    logicalQueryId: string;
    feedbackId: string;
    rating: FeedbackRating;
    comment?: string | null;
    userId?: string | null;
    hostname?: string | null;
    productId?: ProductKey | null;
    queryText?: string | null;
    clientIp?: string | null;
  },
  executor: DbExecutor
): Promise<void> {
  await linkFeedback(
    {
      organizationId: input.organizationId,
      logicalQueryId: input.logicalQueryId,
      feedbackId: input.feedbackId,
      rating: input.rating,
      note: input.comment?.trim() ? "comment_present" : null,
    },
    executor
  );

  if (input.rating === "down") {
    try {
      await enqueueUnansweredFromNegativeFeedback(
        {
          organizationId: input.organizationId,
          logicalQueryId: input.logicalQueryId,
          feedbackId: input.feedbackId,
          comment: input.comment,
          userId: input.userId,
          hostname: input.hostname,
          productId: input.productId,
          queryText: input.queryText,
          clientIp: input.clientIp,
        },
        executor
      );
    } catch (err) {
      console.warn(
        JSON.stringify({
          level: "warn",
          message: "unanswered_enqueue_from_feedback_failed",
          organizationId: input.organizationId,
          feedbackId: input.feedbackId,
          error: err instanceof Error ? err.message : "unknown",
        })
      );
    }
    return;
  }

  if (input.rating === "up") {
    try {
      await applySatisfiedFeedbackToAnalytics(
        {
          organizationId: input.organizationId,
          logicalQueryId: input.logicalQueryId,
          feedbackId: input.feedbackId,
          userId: input.userId,
          hostname: input.hostname,
          productId: input.productId,
        },
        executor
      );
    } catch (err) {
      console.warn(
        JSON.stringify({
          level: "warn",
          message: "answered_from_feedback_failed",
          organizationId: input.organizationId,
          feedbackId: input.feedbackId,
          error: err instanceof Error ? err.message : "unknown",
        })
      );
    }
  }
}

async function submitChatFeedbackInTx(
  input: {
    organizationId: string;
    userId: string;
    messageId: string;
    rating: FeedbackRating;
    comment?: string | null;
    conversationId?: string | null;
    turnId?: string | null;
    logicalQueryId?: string | null;
    hostname?: string | null;
    productId?: ProductKey | null;
    queryText?: string | null;
    clientIp?: string | null;
    expectedVersion?: number;
  },
  executor: DbExecutor
): Promise<ChatFeedbackRow> {
  const messageId = input.messageId.trim().slice(0, 128);
  if (!messageId) throw new FeedbackValidationError("messageId is required");

  // Prefer analytics id; fall back to message id so thumbs-down still triages.
  const logicalQueryId =
    input.logicalQueryId?.trim().slice(0, 128) ||
    (input.rating === "down" ? messageId : null);

  const row = await upsertChatFeedback(
    {
      ...input,
      messageId,
      logicalQueryId,
    },
    executor
  );

  if (row.logicalQueryId) {
    await linkAnalyticsAndUnanswered(
      {
        organizationId: input.organizationId,
        logicalQueryId: row.logicalQueryId,
        feedbackId: row.id,
        rating: row.rating,
        comment: input.comment,
        userId: input.userId,
        hostname: input.hostname,
        productId: input.productId,
        queryText: input.queryText,
        clientIp: input.clientIp,
      },
      executor
    );
  }

  return row;
}

export async function submitChatFeedback(input: {
  organizationId: string;
  userId: string;
  messageId: string;
  rating: FeedbackRating;
  comment?: string | null;
  conversationId?: string | null;
  turnId?: string | null;
  logicalQueryId?: string | null;
  hostname?: string | null;
  productId?: ProductKey | null;
  queryText?: string | null;
  clientIp?: string | null;
  expectedVersion?: number;
}): Promise<ChatFeedbackRow> {
  return withOrganizationTransaction(
    { organizationId: input.organizationId, userId: input.userId },
    (tx) => submitChatFeedbackInTx(input, tx)
  );
}

export async function patchChatFeedback(input: {
  organizationId: string;
  userId: string;
  id: string;
  rating?: FeedbackRating;
  comment?: string | null;
  expectedVersion?: number;
}): Promise<ChatFeedbackRow | null> {
  return withOrganizationTransaction(
    { organizationId: input.organizationId, userId: input.userId },
    async (tx) => {
      const row = await updateOwnedFeedback(input, tx);
      if (!row) return null;
      if (row.logicalQueryId) {
        await linkAnalyticsAndUnanswered(
          {
            organizationId: input.organizationId,
            logicalQueryId: row.logicalQueryId,
            feedbackId: row.id,
            rating: row.rating,
            comment: input.comment !== undefined ? input.comment : undefined,
          },
          tx
        );
      }
      return row;
    }
  );
}

export async function removeChatFeedback(input: {
  organizationId: string;
  userId: string;
  id: string;
}): Promise<boolean> {
  return deleteOwnedFeedback(input);
}

export class FeedbackValidationError extends Error {
  readonly code = "FEEDBACK_VALIDATION";
  constructor(message: string) {
    super(message);
    this.name = "FeedbackValidationError";
  }
}
