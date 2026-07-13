import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export const CSRF_COOKIE_NAME = "__Host-enterprise-csrf";
export const CSRF_HEADER_NAME = "x-csrf-token";
const TOKEN_VERSION = "v1";
const DEFAULT_MAX_AGE_SECONDS = 2 * 60 * 60;

function secret(): string {
  const value =
    process.env.CSRF_SIGNING_SECRET?.trim() ||
    process.env.AUTH0_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim();
  if (!value || value.length < 32) {
    throw new Error("A CSRF signing secret of at least 32 characters is required");
  }
  return value;
}

function signature(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createCsrfToken(nowSeconds = Math.floor(Date.now() / 1000)): string {
  const payload = `${TOKEN_VERSION}.${nowSeconds}.${randomBytes(32).toString("base64url")}`;
  return `${payload}.${signature(payload)}`;
}

export function csrfCookieOptions(maxAge = DEFAULT_MAX_AGE_SECONDS) {
  return {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

function cookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=") || null;
  }
  return null;
}

function equal(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyCsrfToken(
  token: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  maxAgeSeconds = DEFAULT_MAX_AGE_SECONDS
): boolean {
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== TOKEN_VERSION) return false;
  const issuedAt = Number(parts[1]);
  if (!Number.isInteger(issuedAt)) return false;
  const age = nowSeconds - issuedAt;
  if (age < -60 || age > maxAgeSeconds) return false;
  const payload = parts.slice(0, 3).join(".");
  return equal(parts[3]!, signature(payload));
}

function expectedOrigin(request: Request): string | null {
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host")?.trim();
  if (!host) return null;
  const protocol =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    new URL(request.url).protocol.replace(":", "");
  return `${protocol}://${host}`;
}

export function validateMutationCsrf(request: Request): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) {
    return true;
  }
  const origin = request.headers.get("origin");
  const expected = expectedOrigin(request);
  if (!origin || !expected || origin !== expected) return false;

  const headerToken = request.headers.get(CSRF_HEADER_NAME);
  const cookieToken = cookieValue(
    request.headers.get("cookie"),
    CSRF_COOKIE_NAME
  );
  if (!headerToken || !cookieToken || !equal(headerToken, cookieToken)) {
    return false;
  }
  return verifyCsrfToken(headerToken);
}
