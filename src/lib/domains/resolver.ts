import "server-only";

import { matchStaticDomainHostname } from "@/lib/domains/env-config";
import { defaultCollectionIdForProduct, normalizeHostname } from "@/lib/domains/normalize";
import {
  findActiveVerifiedDomainMappingByHostname,
  findDomainMappingByHostname,
  toResolvedHostContextFromMapping,
} from "@/lib/domains/repository";
import {
  HostResolutionError,
  type ResolvedHostContext,
} from "@/lib/domains/types";

const DEFAULT_ENV_ENVIRONMENT: ResolvedHostContext["environment"] = "production";

function envMappingId(envKey: string): string {
  return `env:${envKey}`;
}

function resolveFromStaticConfig(
  hostname: string,
  organizationId: string
): ResolvedHostContext | null {
  const match = matchStaticDomainHostname(hostname);
  if (!match) return null;

  return {
    hostname,
    organizationId,
    domainKind: match.kind,
    productId: match.productId,
    collectionId:
      match.productId != null
        ? defaultCollectionIdForProduct(match.productId)
        : null,
    environment: DEFAULT_ENV_ENVIRONMENT,
    mappingId: envMappingId(match.envKey),
    fromEnvConfig: true,
  };
}

function mappingToContext(
  mapping: Awaited<ReturnType<typeof findDomainMappingByHostname>>
): ResolvedHostContext | null {
  if (!mapping) return null;
  if (!mapping.enabled) {
    throw new HostResolutionError("DISABLED_HOST", `Host "${mapping.hostname}" is disabled.`);
  }
  if (mapping.verificationStatus !== "verified") {
    throw new HostResolutionError(
      "UNVERIFIED_HOST",
      `Host "${mapping.hostname}" is not verified.`
    );
  }
  return toResolvedHostContextFromMapping(mapping);
}

/**
 * Resolves a hostname to product/admin/auth context.
 * Checks tenant DB mappings first (when organizationId is provided), then global verified
 * mappings, then static env config (CTIX_DOMAIN, etc.). Never defaults unknown hosts to CTIX.
 */
export async function resolveHost(
  hostname: string,
  organizationId?: string
): Promise<ResolvedHostContext | null> {
  const normalized = normalizeHostname(hostname);
  if (!normalized.ok) {
    throw new HostResolutionError("INVALID_HOSTNAME", normalized.error.message);
  }

  const resolvedHostname = normalized.hostname;
  const orgId = organizationId?.trim() ?? "";

  // Fast path: pinned Vercel deployment / CTIX_DOMAIN env hosts — no DB round-trip.
  const staticEnvContext = resolveFromStaticConfig(resolvedHostname, orgId);
  if (staticEnvContext) return staticEnvContext;

  if (orgId) {
    const orgMapping = await findDomainMappingByHostname(orgId, resolvedHostname);
    const orgContext = mappingToContext(orgMapping);
    if (orgContext) return orgContext;
  }

  const globalMapping = await findActiveVerifiedDomainMappingByHostname(resolvedHostname);
  if (globalMapping) {
    return toResolvedHostContextFromMapping(globalMapping);
  }

  return null;
}

/** Like {@link resolveHost} but throws when the hostname cannot be resolved. */
export async function resolveHostOrThrow(
  hostname: string,
  organizationId?: string
): Promise<ResolvedHostContext> {
  const context = await resolveHost(hostname, organizationId);
  if (!context) {
    throw new HostResolutionError(
      "UNKNOWN_HOST",
      `No mapping found for host "${hostname.trim()}".`
    );
  }
  return context;
}
