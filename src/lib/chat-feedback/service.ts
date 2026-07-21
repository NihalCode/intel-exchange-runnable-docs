import "server-only";

import { isProductKey, type ProductKey } from "@/lib/products/registry";
import { linkFeedback } from "@/lib/query-analytics/service";
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
  expectedVersion?: number;
}): Promise<ChatFeedbackRow> {
  const messageId = input.messageId.trim().slice(0, 128);
  if (!messageId) throw new FeedbackValidationError("messageId is required");

  const row = await upsertChatFeedback({
    ...input,
    messageId,
  });

  if (row.logicalQueryId) {
    await linkFeedback({
      organizationId: input.organizationId,
      logicalQueryId: row.logicalQueryId,
      feedbackId: row.id,
      rating: row.rating,
      note: input.comment?.trim() ? "comment_present" : null,
    });
  }

  return row;
}

export async function patchChatFeedback(input: {
  organizationId: string;
  userId: string;
  id: string;
  rating?: FeedbackRating;
  comment?: string | null;
  expectedVersion?: number;
}): Promise<ChatFeedbackRow | null> {
  const row = await updateOwnedFeedback(input);
  if (!row) return null;
  if (row.logicalQueryId) {
    await linkFeedback({
      organizationId: input.organizationId,
      logicalQueryId: row.logicalQueryId,
      feedbackId: row.id,
      rating: row.rating,
      note: input.comment !== undefined
        ? input.comment?.trim()
          ? "comment_present"
          : null
        : undefined,
    });
  }
  return row;
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
