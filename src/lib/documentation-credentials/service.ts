import "server-only";

import { createHmac } from "node:crypto";

import { listConnectivityProbeUrls } from "@/lib/documentation-credentials/connectivity";
import {
  NOT_STORED_ACCESS_ID,
  markCredentialStatus,
  upsertCredential,
} from "@/lib/documentation-credentials/repository";
import type {
  CredentialMetadata,
  DocumentationProduct,
} from "@/lib/documentation-credentials/types";
import { disallowedBaseUrlMessage, isAllowedBaseUrl, normalizeProductBaseUrl } from "@/lib/products/registry";
import { isCftrDocsHostBase } from "@/lib/run-feedback";
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

export { buildConnectivityUrl, listConnectivityProbeUrls } from "@/lib/documentation-credentials/connectivity";

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

async function consumeLimited(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      received += value.byteLength;
      if (received <= MAX_RESPONSE_BYTES) chunks.push(value);
      if (received > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        break;
      }
    }
  }
  const merged = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(merged);
}

function looksLikeCloudflareBlock(status: number, body: string): boolean {
  if (status !== 403 && status !== 401) return false;
  const sample = body.slice(0, 2000).toLowerCase();
  return (
    sample.includes("cloudflare") ||
    sample.includes("cf-ray") ||
    sample.includes("attention required") ||
    sample.includes("access denied")
  );
}

async function probeWithAuth(
  target: URL,
  auth: URLSearchParams,
  signal: AbortSignal
): Promise<{ status: number; body: string }> {
  let current = new URL(target.toString());
  current.search = auth.toString();

  for (let hop = 0; hop < 4; hop += 1) {
    await assertPublicUrl(current);
    const response = await safeFetch(current.toString(), {
      signal,
      maxRedirects: 0,
      headers: { Accept: "*/*" },
    });
    if (response.status < 300 || response.status >= 400) {
      const body = await consumeLimited(response);
      return { status: response.status, body };
    }
    const location = response.headers.get("location");
    if (!location) {
      const body = await consumeLimited(response);
      return { status: response.status, body };
    }
    const next = new URL(location, current);
    if (next.hostname.toLowerCase() !== current.hostname.toLowerCase()) {
      const body = await consumeLimited(response);
      return { status: response.status, body };
    }
    if (!next.search) next.search = current.search;
    current = next;
  }
  return { status: 0, body: "" };
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
  let baseUrl = normalizeProductBaseUrl(input.productId, input.baseUrl);
  // http→https redirects drop the auth query; probe HTTPS directly.
  if (baseUrl.startsWith("http://")) {
    baseUrl = `https://${baseUrl.slice("http://".length)}`;
  }

  if (input.productId === "cftr" && isCftrDocsHostBase(baseUrl)) {
    throw new CredentialValidationError(
      "DOCS_HOST_NOT_ALLOWED",
      "https://cftrapi.cyware.com is the CFTR docs site, not a live API. Use your tenant URL ending in /cftrapi (https://YOUR-TENANT.cyware.com/cftrapi)."
    );
  }

  if (!isAllowedBaseUrl(input.productId, baseUrl)) {
    throw new CredentialValidationError(
      "BASE_URL_NOT_ALLOWED",
      disallowedBaseUrlMessage(input.productId)
    );
  }

  const probes = listConnectivityProbeUrls(input.productId, baseUrl);
  const auth = authQuery(accessId, secretKey);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let valid = false;
  let failureCode: string | null = null;
  try {
    let sawProviderReject = false;
    let sawCloudflare = false;
    let sawReachable = false;

    for (const probe of probes) {
      try {
        const { status, body } = await probeWithAuth(probe, auth, controller.signal);
        if (status >= 200 && status < 300) {
          valid = true;
          failureCode = null;
          break;
        }
        if (status > 0) sawReachable = true;
        if (looksLikeCloudflareBlock(status, body)) {
          sawCloudflare = true;
          continue;
        }
        if (status === 401 || status === 403) {
          sawProviderReject = true;
          continue;
        }
        if (status === 404) {
          // Wrong path shape — try the next candidate.
          continue;
        }
        if (status >= 400) {
          sawProviderReject = true;
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          failureCode = "VALIDATION_TIMEOUT";
          break;
        }
        // Try next probe path on network / DNS failures for alternate shapes.
      }
    }

    if (!valid && !failureCode) {
      if (sawCloudflare) failureCode = "CLOUDFLARE_BLOCKED";
      else if (sawProviderReject) failureCode = "PROVIDER_REJECTED";
      else if (sawReachable) failureCode = "PROVIDER_REJECTED";
      else failureCode = "CONNECTIVITY_FAILED";
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
