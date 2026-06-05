// Generates Intel Exchange Open API auth params (AccessID, Signature, Expires)
// using the HMAC-SHA1 algorithm described in the Authentication section.
// Uses the browser's built-in Web Crypto API — no external library needed.

export interface AuthParams {
  accessId: string;
  signature: string;
  expires: number;
}

export async function generateAuthParams(
  accessId: string,
  secretKey: string,
  expiryOffsetSeconds = 20
): Promise<AuthParams> {
  const expires = Math.floor(Date.now() / 1000) + expiryOffsetSeconds;
  const toSign = `${accessId}\n${expires}`;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secretKey),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const raw = await crypto.subtle.sign("HMAC", key, enc.encode(toSign));
  const base64 = btoa(String.fromCharCode(...new Uint8Array(raw)));

  return { accessId, signature: base64, expires };
}
