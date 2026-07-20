import "server-only";

import { createHmac } from "node:crypto";

import { buildConnectivityUrl } from "@/lib/documentation-credentials/connectivity";
import {
  NOT_STORED_ACCESS_ID,
  markCredentialStatus,
  upsertCredential,
} from "@/lib/documentation-credentials/repository";
import type {
  CredentialMetadata,
  DocumentationProduct,
} from "@/lib/documentation-credentials/types";
import { isAllowedBaseUrl } from "@/lib/products/registry";
import { assertPublicUrl, safeFetch } from "@/lib/security/public-host";

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

export { buildConnectivityUrl };

/** Match Postman / client auth-gen (+20). Cyware caps Expires at now+30s; +30 fails under mild clock skew. */
const EXPIRES_OFFSET_SECONDS = 20;

function authQuery(accessId: string, secretKey: string): URLSearchParams {
  const expires = Math.floor(Date.now() / 1000) + EXPIRES_OFFSET_SECONDS;
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
  const accessId = input.accessId.trim();
  const secretKey = input.secretKey.trim();
  let baseUrl = input.baseUrl.trim().replace(/\/+$/, "");
  // http→https redirects drop the auth query; probe HTTPS directly.
  if (baseUrl.startsWith("http://")) {
    baseUrl = `https://${baseUrl.slice("http://".length)}`;
  }
  if (!isAllowedBaseUrl(input.productId, baseUrl)) {
    throw new CredentialValidationError(
      "BASE_URL_NOT_ALLOWED",
      "Base URL is not allowed for this product. Use a Cyware tenant Open API URL (for Orchestrate: …/soarapi/openapi or …/co)."
    );
  }
  const target = buildConnectivityUrl(input.productId, baseUrl);
  await assertPublicUrl(target);
  target.search = authQuery(accessId, secretKey).toString();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let valid = false;
  let failureCode: string | null = null;
  try {
    // Preserve AccessID/Signature/Expires across same-host redirects (Location often omits them).
    let current = target;
    let response: Response | null = null;
    for (let hop = 0; hop < 4; hop += 1) {
      await assertPublicUrl(current);
      response = await safeFetch(current.toString(), {
        signal: controller.signal,
        maxRedirects: 0,
        headers: { Accept: "application/json" },
      });
      if (response.status < 300 || response.status >= 400) break;
      const location = response.headers.get("location");
      if (!location) break;
      const next = new URL(location, current);
      if (next.hostname.toLowerCase() !== current.hostname.toLowerCase()) break;
      if (!next.search) next.search = current.search;
      current = next;
      response = null;
    }
    if (!response) {
      failureCode = "CONNECTIVITY_FAILED";
    } else {
      await consumeLimited(response);
      valid = response.status >= 200 && response.status < 300;
      if (!valid) failureCode = "PROVIDER_REJECTED";
    }
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
    accessIdMasked: NOT_STORED_ACCESS_ID,
    status: valid ? "valid" : "invalid",
    validatedAt: new Date().toISOString(),
    validationErrorCode: failureCode,
  });
}

/** Credentials are memory-only in the browser; server never retains Access ID or Secret Key. */
export async function loadCredentialMaterial(
  input: {
    organizationId: string;
    userId: string;
    productId: DocumentationProduct;
  }
): Promise<{ baseUrl: string; accessId: string; secretKey: string } | null> {
  void input;
  return null;
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
