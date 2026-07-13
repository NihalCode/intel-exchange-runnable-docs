export const DOCUMENTATION_PRODUCTS = ["ctix", "cftr", "orchestrate", "csap"] as const;
export type DocumentationProduct = (typeof DOCUMENTATION_PRODUCTS)[number];

export type CredentialStatus =
  | "pending"
  | "valid"
  | "invalid"
  | "revoked"
  | "expired";

export interface CredentialMetadata {
  id: string;
  organizationId: string;
  userId: string;
  productId: DocumentationProduct;
  baseUrl: string;
  accessIdMasked: string;
  status: CredentialStatus;
  authorizedScopes: string[];
  validatedAt: string | null;
  expiresAt: string | null;
  validationErrorCode: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface StoredCredential extends CredentialMetadata {
  secretCiphertext: string | null;
  secretIv: string | null;
  secretTag: string | null;
  vaultRef: string | null;
}

export function isDocumentationProduct(value: string): value is DocumentationProduct {
  return DOCUMENTATION_PRODUCTS.includes(value as DocumentationProduct);
}
