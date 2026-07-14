import "server-only";

import { createHmac } from "node:crypto";

import {
  decryptSecret,
  encryptSecret,
} from "@/lib/documentation-credentials/encryption";
import {
  findStoredCredential,
  markCredentialStatus,
  upsertCredential,
} from "@/lib/documentation-credentials/repository";
import type {
  CredentialMetadata,
  DocumentationProduct,
} from "@/lib/documentation-credentials/types";
import { isAllowedBaseUrl } from "@/lib/products/registry";
import { assertPublicUrl, safeFetch } from "@/lib/security/public-host";
import { maskValue } from "@/lib/security";

/**
 * Connectivity probe paths relative to each product's Open API root.
 * Absolute-from-host forms are used when the configured base has no product prefix
 * (e.g. docs hosts like csapapi.cyware.com / orchestrateapi.cyware.com).
 */
const CONNECTIVITY_SUFFIX: Record<DocumentationProduct, string> = {
  ctix: "/ping/",
  cftr: "/openapi/test-connectivity/",
  csap: "/v1/test_connectivity/",
  orchestrate: "/v1/test_connectivity/",
};

const MAX_RESPONSE_BYTES = 64 * 1024;
const TIMEOUT_MS = 10_000;

export class CredentialValidationError extends Error {
  readonly code: string;

  constructor(code: string, message = "The credentials could not be validated") {
    super(message);
    this.name = "CredentialValidationError";
    this.code = code;
  }
}

export function credentialAad(
  organizationId: string,
  userId: string,
  productId: DocumentationProduct
): string {
  return `${organizationId}:${userId}:${productId}`;
}

function normalizePathname(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "" : trimmed;
}

function joinPath(root: string, suffix: string): string {
  const left = root.replace(/\/+$/, "");
  const right = suffix.startsWith("/") ? suffix : `/${suffix}`;
  return `${left}${right}`.replace(/\/{2,}/g, "/") || "/";
}

/**
 * Build the absolute connectivity-check URL for a product + tenant base URL.
 * Handles common tenant shapes (…/ctixapi, …/cftrapi, …/csap, …/soarapi[/openapi], …/co)
 * and docs hosts without a product path prefix.
 */
export function buildConnectivityUrl(
  productId: DocumentationProduct,
  baseUrl: string
): URL {
  const base = new URL(baseUrl.trim());
  const root = normalizePathname(base.pathname);
  let pathname: string;

  switch (productId) {
    case "ctix": {
      const ctixRoot = root.endsWith("/ctixapi") ? root : root || "/ctixapi";
      pathname = joinPath(ctixRoot, CONNECTIVITY_SUFFIX.ctix);
      break;
    }
    case "cftr": {
      if (root.endsWith("/cftrapi")) {
        pathname = joinPath(root, CONNECTIVITY_SUFFIX.cftr);
      } else {
        pathname = "/cftrapi/openapi/test-connectivity/";
      }
      break;
    }
    case "csap": {
      // Docs path is csap/v1/test_connectivity/. Avoid doubling /csap when the
      // tenant base already ends with /csap.
      if (root.endsWith("/csap") || /(^|\/)csap$/i.test(root)) {
        pathname = joinPath(root, CONNECTIVITY_SUFFIX.csap);
      } else if (!root) {
        pathname = `/csap${CONNECTIVITY_SUFFIX.csap}`;
      } else if (/(^|\/)csap(\/|$)/i.test(root)) {
        pathname = joinPath(root, CONNECTIVITY_SUFFIX.csap);
      } else {
        pathname = joinPath(root, `/csap${CONNECTIVITY_SUFFIX.csap}`);
      }
      break;
    }
    case "orchestrate": {
      // Tenants commonly use …/soarapi/openapi or …/soarapi; older installs use …/co.
      if (root.endsWith("/soarapi")) {
        pathname = joinPath(root, `/openapi${CONNECTIVITY_SUFFIX.orchestrate}`);
      } else if (
        root.endsWith("/soarapi/openapi") ||
        root.endsWith("/co/openapi") ||
        root.endsWith("/co")
      ) {
        pathname = joinPath(root, CONNECTIVITY_SUFFIX.orchestrate);
      } else if (!root) {
        pathname = CONNECTIVITY_SUFFIX.orchestrate;
      } else {
        pathname = joinPath(root, CONNECTIVITY_SUFFIX.orchestrate);
      }
      break;
    }
    default: {
      pathname = CONNECTIVITY_SUFFIX[productId] ?? "/";
    }
  }

  base.pathname = pathname.endsWith("/") ? pathname : `${pathname}/`;
  base.search = "";
  base.hash = "";
  return base;
}

function authQuery(accessId: string, secretKey: string): URLSearchParams {
  const expires = Math.floor(Date.now() / 1000) + 30;
  const signature = createHmac("sha1", secretKey)
    .update(`${accessId}\n${expires}`)
    .digest("base64");
  return new URLSearchParams({
    AccessID: accessId,
    Signature: signature,
    Expires: String(expires),
  });
}

async function consumeLimited(response: Response): Promise<void> {
  if (!response.body) return;
  const reader = response.body.getReader();
  let received = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    received += value?.byteLength ?? 0;
    if (received > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      return;
    }
  }
}

export async function validateAndStoreCredential(input: {
  organizationId: string;
  userId: string;
  productId: DocumentationProduct;
  baseUrl: string;
  accessId: string;
  secretKey: string;
}): Promise<CredentialMetadata> {
  const baseUrl = input.baseUrl.trim().replace(/\/+$/, "");
  if (!isAllowedBaseUrl(input.productId, baseUrl)) {
    throw new CredentialValidationError(
      "BASE_URL_NOT_ALLOWED",
      "Base URL is not allowed for this product. Use a Cyware tenant Open API URL (for Orchestrate: …/soarapi/openapi or …/co)."
    );
  }
  const target = buildConnectivityUrl(input.productId, baseUrl);
  await assertPublicUrl(target);
  target.search = authQuery(input.accessId, input.secretKey).toString();

  const encrypted = encryptSecret(
    JSON.stringify({ accessId: input.accessId, secretKey: input.secretKey }),
    credentialAad(input.organizationId, input.userId, input.productId)
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let valid = false;
  let failureCode: string | null = null;
  try {
    const response = await safeFetch(target.toString(), {
      signal: controller.signal,
      maxRedirects: 3,
      headers: { Accept: "application/json" },
    });
    await consumeLimited(response);
    valid = response.status >= 200 && response.status < 300;
    if (!valid) failureCode = "PROVIDER_REJECTED";
  } catch (error) {
    failureCode =
      error instanceof Error && error.name === "AbortError"
        ? "VALIDATION_TIMEOUT"
        : "CONNECTIVITY_FAILED";
  } finally {
    clearTimeout(timeout);
  }

  return upsertCredential({
    organizationId: input.organizationId,
    userId: input.userId,
    productId: input.productId,
    baseUrl,
    accessIdMasked: maskValue(input.accessId),
    secretCiphertext: encrypted.ciphertext,
    secretIv: encrypted.iv,
    secretTag: encrypted.tag,
    status: valid ? "valid" : "invalid",
    validatedAt: new Date().toISOString(),
    validationErrorCode: failureCode,
  });
}

export async function loadCredentialMaterial(input: {
  organizationId: string;
  userId: string;
  productId: DocumentationProduct;
}): Promise<{ baseUrl: string; accessId: string; secretKey: string } | null> {
  const stored = await findStoredCredential(
    input.organizationId,
    input.userId,
    input.productId
  );
  if (
    !stored ||
    stored.status !== "valid" ||
    (stored.expiresAt && new Date(stored.expiresAt) <= new Date()) ||
    !stored.secretCiphertext ||
    !stored.secretIv ||
    !stored.secretTag
  ) {
    return null;
  }
  const plaintext = decryptSecret(
    {
      ciphertext: stored.secretCiphertext,
      iv: stored.secretIv,
      tag: stored.secretTag,
    },
    credentialAad(input.organizationId, input.userId, input.productId)
  );
  const material = JSON.parse(plaintext) as { accessId?: string; secretKey?: string };
  return material.accessId && material.secretKey
    ? { baseUrl: stored.baseUrl, accessId: material.accessId, secretKey: material.secretKey }
    : null;
}

export async function invalidateRejectedCredential(input: {
  organizationId: string;
  userId: string;
  productId: DocumentationProduct;
}): Promise<void> {
  await markCredentialStatus(
    input.organizationId,
    input.userId,
    input.productId,
    "invalid",
    "PROVIDER_REJECTED"
  );
}
