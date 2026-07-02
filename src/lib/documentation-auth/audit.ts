import "server-only";

import { appendAuditLog } from "@/lib/db/repository";

export async function logDocumentationAuthEvent(input: {
  action: string;
  userId?: string | null;
  actorEmail?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await appendAuditLog({
    action: input.action,
    userId: input.userId,
    actorEmail: input.actorEmail,
    metadata: input.metadata,
  });
}
