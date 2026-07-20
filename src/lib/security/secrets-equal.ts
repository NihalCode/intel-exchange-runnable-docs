import { timingSafeEqual } from "node:crypto";

/** Constant-time compare for shared secrets (rejects length mismatches safely). */
export function secretsEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
