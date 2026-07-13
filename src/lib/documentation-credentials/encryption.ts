import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  tag: string;
}

function encryptionKey(): Buffer {
  const encoded = process.env.DOCUMENTATION_CREDENTIAL_ENCRYPTION_KEY?.trim();
  if (!encoded) {
    if (process.env.NODE_ENV === "test") {
      return Buffer.alloc(32, 0x5a);
    }
    throw new Error("DOCUMENTATION_CREDENTIAL_ENCRYPTION_KEY is required");
  }
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error("DOCUMENTATION_CREDENTIAL_ENCRYPTION_KEY must be 32 base64-encoded bytes");
  }
  return key;
}

export function encryptSecret(secret: string, aad: string): EncryptedSecret {
  if (!secret) throw new Error("Secret key is required");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptSecret(value: EncryptedSecret, aad: string): string {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(value.iv, "base64")
  );
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(Buffer.from(value.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
