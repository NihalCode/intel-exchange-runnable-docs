import "server-only";

import { checkRateLimit } from "@/lib/documentation-auth/rate-limit";

const MUTATION_LIMIT = 30;
const MUTATION_WINDOW_MS = 60_000;

/** Rate limit privileged control-plane mutations per user and organization. */
export function checkEnterpriseMutationRateLimit(
  organizationId: string,
  userId: string
): boolean {
  return checkRateLimit(
    `enterprise-mutation:${organizationId}:${userId}`,
    MUTATION_LIMIT,
    MUTATION_WINDOW_MS
  );
}
