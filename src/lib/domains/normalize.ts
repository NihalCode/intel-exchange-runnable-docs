import type {
  DomainEnvironment,
  DomainKind,
  DomainMappingInput,
  DomainMappingValidationError,
  HostnameNormalizationResult,
  HostnameValidationError,
} from "@/lib/domains/types";
import { isProductKey, type ProductKey } from "@/lib/products/registry";

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /\.local$/i,
  /\.internal$/i,
  /\.localhost$/i,
];

function validationError(
  code: HostnameValidationError["code"],
  message: string
): HostnameValidationError {
  return { code, message };
}

function reject(
  input: string,
  error: HostnameValidationError
): HostnameNormalizationResult {
  return { ok: false, input, error };
}

function isPrivateOrLocalHost(hostname: string): boolean {
  return PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
}

/**
 * Normalizes a hostname for storage and lookup.
 * Lowercases, strips trailing dot, converts IDN to punycode, rejects scheme/path/query.
 */
export function normalizeHostname(
  raw: string,
  options: { allowPrivateHosts?: boolean } = {}
): HostnameNormalizationResult {
  const input = raw.trim();
  if (!input) {
    return reject(input, validationError("EMPTY", "Hostname is required."));
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(input) || input.includes("://")) {
    return reject(
      input,
      validationError("SCHEME_NOT_ALLOWED", "Hostname must not include a URL scheme.")
    );
  }
  if (input.includes("/")) {
    return reject(
      input,
      validationError("PATH_NOT_ALLOWED", "Hostname must not include a path.")
    );
  }
  if (input.includes("?")) {
    return reject(
      input,
      validationError("QUERY_NOT_ALLOWED", "Hostname must not include a query string.")
    );
  }
  if (input.includes("#")) {
    return reject(
      input,
      validationError("FRAGMENT_NOT_ALLOWED", "Hostname must not include a fragment.")
    );
  }
  if (input.includes("@")) {
    return reject(
      input,
      validationError("USERINFO_NOT_ALLOWED", "Hostname must not include userinfo.")
    );
  }
  if (input.includes("*")) {
    return reject(
      input,
      validationError("WILDCARD_NOT_ALLOWED", "Wildcard hostnames are not supported.")
    );
  }

  let candidate = input.toLowerCase().replace(/\.+$/, "");
  if (!candidate) {
    return reject(input, validationError("EMPTY", "Hostname is required."));
  }

  if (candidate.includes(":")) {
    return reject(
      input,
      validationError("PORT_NOT_ALLOWED", "Hostname must not include a port.")
    );
  }

  try {
    candidate = new URL(`http://${candidate}`).hostname.toLowerCase();
  } catch {
    return reject(input, validationError("INVALID_HOSTNAME", "Hostname is not valid."));
  }

  if (!candidate || !/^[a-z0-9.-]+$/.test(candidate) || candidate.startsWith(".") || candidate.endsWith(".")) {
    return reject(input, validationError("INVALID_HOSTNAME", "Hostname is not valid."));
  }

  const allowPrivate =
    options.allowPrivateHosts ??
    process.env.NODE_ENV !== "production";
  if (!allowPrivate && isPrivateOrLocalHost(candidate)) {
    return reject(
      input,
      validationError(
        "PRIVATE_HOST_NOT_ALLOWED",
        "Private or local hostnames are not allowed in production."
      )
    );
  }

  return { ok: true, hostname: candidate, input };
}

export function defaultCollectionIdForProduct(productId: ProductKey): string {
  return productId;
}

export function validateDomainMappingInput(
  input: DomainMappingInput
): DomainMappingValidationError | null {
  const normalized = normalizeHostname(input.hostname);
  if (!normalized.ok) {
    return {
      code: "INVALID_HOSTNAME",
      message: normalized.error.message,
    };
  }

  if (input.kind === "product") {
    if (!input.productId || !isProductKey(input.productId)) {
      return {
        code: "PRODUCT_REQUIRED",
        message: "Product domains require a valid product identifier.",
      };
    }
    const collectionId = input.collectionId?.trim();
    if (!collectionId) {
      return {
        code: "COLLECTION_REQUIRED",
        message: "Product domains require a collection identifier.",
      };
    }
    return null;
  }

  if (input.productId != null) {
    return {
      code: "PRODUCT_NOT_ALLOWED",
      message: "Admin and auth domains must not specify a product.",
    };
  }
  if (input.collectionId != null && input.collectionId.trim() !== "") {
    return {
      code: "COLLECTION_NOT_ALLOWED",
      message: "Admin and auth domains must not specify a collection.",
    };
  }
  return null;
}

export function isDomainEnvironment(value: string): value is DomainEnvironment {
  return value === "development" || value === "staging" || value === "production";
}

export function isDomainKind(value: string): value is DomainKind {
  return value === "product" || value === "admin" || value === "auth";
}
