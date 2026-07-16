import type { ProductKey } from "@/lib/products/registry";

export type DomainKind = "product" | "admin" | "auth";

export type DomainEnvironment = "development" | "staging" | "production";

export type VerificationStatus = "pending" | "verified" | "failed" | "disabled";

export type TlsStatus = "pending" | "active" | "failed" | "expired";

export type UnansweredQueryReviewStatus =
  | "open"
  | "triaged"
  | "resolved"
  | "dismissed";

export interface DomainCollectionMapping {
  id: string;
  organizationId: string;
  hostname: string;
  kind: DomainKind;
  productId: ProductKey | null;
  collectionId: string | null;
  environment: DomainEnvironment;
  isPrimary: boolean;
  enabled: boolean;
  verificationStatus: VerificationStatus;
  tlsStatus: TlsStatus;
  version: number;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResolvedHostContext {
  hostname: string;
  organizationId: string;
  domainKind: DomainKind;
  productId: ProductKey | null;
  collectionId: string | null;
  environment: DomainEnvironment;
  mappingId: string;
  /** `true` when resolved from static env config rather than the database. */
  fromEnvConfig: boolean;
}

export type HostnameValidationErrorCode =
  | "EMPTY"
  | "SCHEME_NOT_ALLOWED"
  | "PATH_NOT_ALLOWED"
  | "QUERY_NOT_ALLOWED"
  | "FRAGMENT_NOT_ALLOWED"
  | "USERINFO_NOT_ALLOWED"
  | "PORT_NOT_ALLOWED"
  | "WILDCARD_NOT_ALLOWED"
  | "INVALID_HOSTNAME"
  | "PRIVATE_HOST_NOT_ALLOWED";

export interface HostnameValidationError {
  code: HostnameValidationErrorCode;
  message: string;
}

export interface HostnameNormalizationSuccess {
  ok: true;
  hostname: string;
  /** Original input after trim (before normalization). */
  input: string;
}

export interface HostnameNormalizationFailure {
  ok: false;
  input: string;
  error: HostnameValidationError;
}

export type HostnameNormalizationResult =
  | HostnameNormalizationSuccess
  | HostnameNormalizationFailure;

export type DomainMappingValidationErrorCode =
  | "INVALID_HOSTNAME"
  | "PRODUCT_REQUIRED"
  | "COLLECTION_REQUIRED"
  | "PRODUCT_NOT_ALLOWED"
  | "COLLECTION_NOT_ALLOWED"
  | "DUPLICATE_HOSTNAME"
  | "INVALID_PRODUCT";

export interface DomainMappingValidationError {
  code: DomainMappingValidationErrorCode;
  message: string;
}

export interface DomainMappingInput {
  hostname: string;
  kind: DomainKind;
  productId?: ProductKey | null;
  collectionId?: string | null;
  environment: DomainEnvironment;
  isPrimary?: boolean;
  enabled?: boolean;
  verificationStatus?: VerificationStatus;
  tlsStatus?: TlsStatus;
}

export type HostResolutionErrorCode =
  | "INVALID_HOSTNAME"
  | "UNKNOWN_HOST"
  | "DISABLED_HOST"
  | "UNVERIFIED_HOST";

export class HostResolutionError extends Error {
  readonly code: HostResolutionErrorCode;

  constructor(code: HostResolutionErrorCode, message: string) {
    super(message);
    this.name = "HostResolutionError";
    this.code = code;
  }
}
