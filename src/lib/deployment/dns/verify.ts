import "server-only";

import { promises as dns } from "node:dns";

import type { DnsCheckResult } from "@/lib/deployment/types";
import type { VercelDnsRequirement } from "@/lib/deployment/providers/types";

const TIMEOUT_MS = 5_000;

async function resolveWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("DNS lookup timed out")), TIMEOUT_MS)
    ),
  ]);
}

export async function checkDnsRecords(
  domain: string,
  requirements: VercelDnsRequirement[]
): Promise<DnsCheckResult[]> {
  const results: DnsCheckResult[] = [];
  for (const req of requirements) {
    const host = req.domain.endsWith(".") ? req.domain.slice(0, -1) : req.domain;
    const type = req.type.toUpperCase();
    let actual: string[] = [];
    try {
      if (type === "CNAME") {
        actual = await resolveWithTimeout(() => dns.resolveCname(host));
      } else if (type === "A") {
        actual = (await resolveWithTimeout(() => dns.resolve4(host))).map(String);
      } else if (type === "AAAA") {
        actual = (await resolveWithTimeout(() => dns.resolve6(host))).map(String);
      } else if (type === "TXT") {
        const txt = await resolveWithTimeout(() => dns.resolveTxt(host));
        actual = txt.map((parts) => parts.join(""));
      }
    } catch {
      actual = [];
    }
    const expected = [req.value.replace(/\.$/, "")];
    const normalizedActual = actual.map((v) => v.replace(/\.$/, "").toLowerCase());
    const matched = expected.some((e) =>
      normalizedActual.some((a) => a === e.toLowerCase() || a.endsWith(`.${e.toLowerCase()}`))
    );
    results.push({
      recordType: type as DnsCheckResult["recordType"],
      expected,
      actual,
      matched,
      checkedAt: new Date().toISOString(),
    });
  }
  return results;
}

export function allDnsChecksMatched(results: DnsCheckResult[]): boolean {
  return results.length > 0 && results.every((r) => r.matched);
}
