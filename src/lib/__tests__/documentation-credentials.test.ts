import { afterEach, describe, expect, it } from "vitest";

import {
  decryptSecret,
  encryptSecret,
} from "@/lib/documentation-credentials/encryption";
import { toCredentialMetadata } from "@/lib/documentation-credentials/repository";

describe("documentation credential encryption", () => {
  afterEach(() => {
    delete process.env.DOCUMENTATION_CREDENTIAL_ENCRYPTION_KEY;
  });

  it("round-trips AES-256-GCM with authenticated context", () => {
    process.env.DOCUMENTATION_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const encrypted = encryptSecret("never-return-this", "org:user:ctix");
    expect(encrypted.ciphertext).not.toContain("never-return-this");
    expect(decryptSecret(encrypted, "org:user:ctix")).toBe("never-return-this");
    expect(() => decryptSecret(encrypted, "org:other:ctix")).toThrow();
  });

  it("never serializes encrypted secret fields as metadata", () => {
    const metadata = toCredentialMetadata({
      id: "credential",
      organizationId: "org",
      userId: "user",
      productId: "ctix",
      baseUrl: "https://tenant.cyware.com/ctixapi",
      accessIdMasked: "ab••cd",
      secretCiphertext: "ciphertext",
      secretIv: "iv",
      secretTag: "tag",
      vaultRef: null,
      status: "valid",
      authorizedScopes: [],
      validatedAt: null,
      expiresAt: null,
      validationErrorCode: null,
      version: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(JSON.stringify(metadata)).not.toContain("ciphertext");
    expect(metadata).not.toHaveProperty("secretTag");
  });
});
