import "server-only";

import { redactStructuredValue } from "@/lib/enterprise/observability";

export function computeSanitizedConfigDiff(
  active: Record<string, unknown> | null,
  target: Record<string, unknown>
): Record<string, unknown> {
  const diff: Record<string, unknown> = {};
  const activeConfig = active ?? {};
  const keys = new Set([...Object.keys(activeConfig), ...Object.keys(target)]);
  for (const key of keys) {
    const before = activeConfig[key];
    const after = target[key];
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    diff[key] = { from: before ?? null, to: after ?? null };
  }
  return redactStructuredValue(diff) as Record<string, unknown>;
}
