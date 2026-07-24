import "server-only";

export type OktaProvisioningConfig = {
  orgUrl: string;
  apiToken: string;
  groupId: string;
  appId?: string;
};

function stripSswsPrefix(token: string): string {
  return token.replace(/^SSWS\s+/i, "").trim();
}

/**
 * Normalize Okta org URL: HTTPS required, no trailing slash, reject admin console host.
 */
export function normalizeOktaOrgUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("OKTA_ORG_URL is required.");
  }
  const withScheme = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error("OKTA_ORG_URL is not a valid URL.");
  }
  if (url.protocol !== "https:") {
    throw new Error("OKTA_ORG_URL must use HTTPS.");
  }
  const host = url.hostname.toLowerCase();
  if (host.includes("-admin.okta.com") || host.endsWith("-admin.okta.com")) {
    throw new Error(
      "OKTA_ORG_URL must be the org URL (…okta.com), not the admin console (…-admin.okta.com)."
    );
  }
  return `${url.protocol}//${url.host}`.replace(/\/+$/, "");
}

export function getOktaOrgUrl(): string | undefined {
  const raw =
    process.env.OKTA_ORG_URL?.trim() || process.env.OKTA_DOMAIN?.trim() || "";
  if (!raw) return undefined;
  try {
    return normalizeOktaOrgUrl(raw);
  } catch {
    return undefined;
  }
}

export function getOktaApiToken(): string | undefined {
  const token = process.env.OKTA_API_TOKEN?.trim();
  if (!token) return undefined;
  const cleaned = stripSswsPrefix(token);
  return cleaned || undefined;
}

/** Okta application id (optional under Federation Broker Mode). */
export function getOktaAppId(): string | undefined {
  const id = process.env.OKTA_APP_ID?.trim();
  if (!id) return undefined;
  if (!id.startsWith("0oa")) return undefined;
  return id;
}

/**
 * Required docs group id (`00g…`). Prefer `OKTA_DOCS_GROUP_ID`; `OKTA_GROUP_ID` alias.
 */
export function getOktaGroupId(): string | undefined {
  const id =
    process.env.OKTA_DOCS_GROUP_ID?.trim() || process.env.OKTA_GROUP_ID?.trim() || "";
  if (!id) return undefined;
  if (!id.startsWith("00g")) return undefined;
  return id;
}

/**
 * Optional display name lookup when id unset (e.g. "Cyware Docs Users").
 * Prefer setting OKTA_DOCS_GROUP_ID in production.
 */
export function getOktaGroupName(): string | undefined {
  const name =
    process.env.OKTA_DOCS_GROUP_NAME?.trim() || process.env.OKTA_GROUP_NAME?.trim() || "";
  return name || undefined;
}

export function getAuth0OktaConnectionName(): string | undefined {
  return process.env.AUTH0_OKTA_CONNECTION?.trim() || undefined;
}

/** True when Okta Users API can provision invited people from Add user. */
export function isOktaProvisioningConfigured(): boolean {
  return Boolean(getOktaOrgUrl() && getOktaApiToken() && (getOktaGroupId() || getOktaGroupName()));
}

/** Branded sign-in is Okta-only when the Auth0 enterprise connection name is set. */
export function isOktaOnlySignIn(): boolean {
  return Boolean(process.env.AUTH0_OKTA_CONNECTION?.trim());
}

/**
 * Fail-closed production config for Add user. Requires a resolvable docs group.
 */
export function requireOktaProvisioningConfig(): OktaProvisioningConfig {
  const rawOrg =
    process.env.OKTA_ORG_URL?.trim() || process.env.OKTA_DOMAIN?.trim() || "";
  if (!rawOrg) {
    throw new Error("OKTA_ORG_URL is required for Add user.");
  }
  const orgUrl = normalizeOktaOrgUrl(rawOrg);
  const apiToken = getOktaApiToken();
  if (!apiToken) {
    throw new Error("OKTA_API_TOKEN is required for Add user.");
  }
  const groupId = getOktaGroupId();
  const groupName = getOktaGroupName();
  if (!groupId && !groupName) {
    throw new Error(
      "OKTA_DOCS_GROUP_ID (or OKTA_GROUP_ID) is required. Use the Cyware Docs Users group id (00g…)."
    );
  }
  const appId = getOktaAppId();
  return {
    orgUrl,
    apiToken,
    groupId: groupId || "",
    ...(appId ? { appId } : {}),
  };
}
