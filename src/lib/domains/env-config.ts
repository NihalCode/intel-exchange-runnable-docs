import { cleanEnvValue } from "@/lib/documentation-auth/env";
import { resolveAppProductId } from "@/lib/deployment/resolve-app-product-id";
import type { DomainKind } from "@/lib/domains/types";
import { isProductKey, PRODUCT_KEYS, type ProductKey } from "@/lib/products/registry";

export interface StaticDomainConfig {
  ctix: string | null;
  cftr: string | null;
  csap: string | null;
  orchestrate: string | null;
  admin: string | null;
  auth: string | null;
}

const PRODUCT_ENV_KEYS: Record<ProductKey, keyof StaticDomainConfig> = {
  ctix: "ctix",
  cftr: "cftr",
  csap: "csap",
  orchestrate: "orchestrate",
};

/** Reads configured product/admin/auth hostnames from environment variables. */
export function getStaticDomainConfig(): StaticDomainConfig {
  return {
    ctix: cleanEnvValue(process.env.CTIX_DOMAIN),
    cftr: cleanEnvValue(process.env.CFTR_DOMAIN),
    csap: cleanEnvValue(process.env.CSAP_DOMAIN),
    orchestrate: cleanEnvValue(process.env.ORCHESTRATE_DOMAIN),
    admin: cleanEnvValue(process.env.ADMIN_DOMAIN),
    auth: cleanEnvValue(process.env.AUTH_DOMAIN),
  };
}

export interface StaticHostnameMatch {
  kind: DomainKind;
  productId: ProductKey | null;
  envKey: keyof StaticDomainConfig;
}

/** Returns the static env mapping for an already-normalized hostname, if any. */
export function matchStaticDomainHostname(hostname: string): StaticHostnameMatch | null {
  const normalized = hostname.toLowerCase();
  const config = getStaticDomainConfig();

  const pinned = resolveAppProductId();
  if (pinned) {
    const deploymentHosts = [
      cleanEnvValue(process.env.APP_CANONICAL_DOMAIN),
      cleanEnvValue(process.env.VERCEL_URL),
      config[PRODUCT_ENV_KEYS[pinned]],
    ];
    for (const host of deploymentHosts) {
      if (host && host.toLowerCase() === normalized) {
        return { kind: "product", productId: pinned, envKey: PRODUCT_ENV_KEYS[pinned] };
      }
    }
    try {
      const base = cleanEnvValue(process.env.APP_BASE_URL) ?? cleanEnvValue(process.env.AUTH0_BASE_URL);
      if (base) {
        const baseHost = new URL(base.startsWith("http") ? base : `https://${base}`).hostname.toLowerCase();
        if (baseHost === normalized) {
          return { kind: "product", productId: pinned, envKey: PRODUCT_ENV_KEYS[pinned] };
        }
      }
    } catch {
      // ignore malformed APP_BASE_URL
    }
    const vercelPrefix = `cyware-docs-${pinned}`;
    if (
      normalized.endsWith(".vercel.app") &&
      (normalized === `${vercelPrefix}.vercel.app` ||
        normalized.startsWith(`${vercelPrefix}-`))
    ) {
      return { kind: "product", productId: pinned, envKey: PRODUCT_ENV_KEYS[pinned] };
    }
  }

  for (const productId of PRODUCT_KEYS) {
    const configured = config[PRODUCT_ENV_KEYS[productId]];
    if (configured && configured.toLowerCase() === normalized) {
      return { kind: "product", productId, envKey: PRODUCT_ENV_KEYS[productId] };
    }
  }

  if (config.admin && config.admin.toLowerCase() === normalized) {
    return { kind: "admin", productId: null, envKey: "admin" };
  }

  if (config.auth && config.auth.toLowerCase() === normalized) {
    return { kind: "auth", productId: null, envKey: "auth" };
  }

  return null;
}

export function configuredProductHostnames(): Partial<Record<ProductKey, string>> {
  const config = getStaticDomainConfig();
  const result: Partial<Record<ProductKey, string>> = {};
  for (const productId of PRODUCT_KEYS) {
    const hostname = config[PRODUCT_ENV_KEYS[productId]];
    if (hostname) result[productId] = hostname;
  }
  return result;
}

export function isConfiguredProductId(value: string): value is ProductKey {
  return isProductKey(value);
}
