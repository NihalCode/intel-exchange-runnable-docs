import "server-only";

import { getAppBaseUrl } from "@/lib/documentation-auth/env";

interface Auth0User {
  user_id: string;
  email: string;
  name?: string;
}

export function canProvisionRole(actorRole: string, targetRole: string): boolean {
  if (actorRole === "owner") return true;
  if (actorRole === "admin") return targetRole !== "owner";
  return !["admin", "owner"].includes(targetRole) && actorRole === "documentation_manager";
}

function config() {
  const domain = (
    process.env.AUTH0_ISSUER_BASE_URL ??
    process.env.AUTH0_DOMAIN ??
    ""
  )
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  const clientId = process.env.AUTH0_MANAGEMENT_CLIENT_ID?.trim();
  const clientSecret = process.env.AUTH0_MANAGEMENT_CLIENT_SECRET?.trim();
  const connection = process.env.AUTH0_DATABASE_CONNECTION?.trim();
  const audience =
    process.env.AUTH0_MANAGEMENT_AUDIENCE?.trim() || `https://${domain}/api/v2/`;
  if (!domain || !clientId || !clientSecret || !connection) {
    throw new Error("AUTH0_MANAGEMENT_NOT_CONFIGURED");
  }
  return { domain, clientId, clientSecret, connection, audience };
}

async function managementToken(): Promise<string> {
  const cfg = config();
  const response = await fetch(`https://${cfg.domain}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      audience: cfg.audience,
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("AUTH0_MANAGEMENT_UNAVAILABLE");
  const body = (await response.json()) as { access_token?: string };
  if (!body.access_token) throw new Error("AUTH0_MANAGEMENT_UNAVAILABLE");
  return body.access_token;
}

async function auth0Request(
  path: string,
  token: string,
  init: RequestInit = {}
): Promise<Response> {
  return fetch(`https://${config().domain}/api/v2${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });
}

async function findByEmail(email: string, token: string): Promise<Auth0User | null> {
  const response = await auth0Request(
    `/users-by-email?email=${encodeURIComponent(email)}`,
    token
  );
  if (!response.ok) throw new Error("AUTH0_MANAGEMENT_UNAVAILABLE");
  const users = (await response.json()) as Auth0User[];
  return users.find((user) => user.email.toLowerCase() === email.toLowerCase()) ?? null;
}

export async function provisionAuth0User(input: {
  email: string;
  displayName?: string | null;
  auth0OrganizationId?: string | null;
}): Promise<{ user: Auth0User; created: boolean; setupStatus: string }> {
  const cfg = config();
  const token = await managementToken();
  let user: Auth0User | null = null;
  let created = false;
  const createResponse = await auth0Request("/users", token, {
    method: "POST",
    body: JSON.stringify({
      connection: cfg.connection,
      email: input.email,
      name: input.displayName || undefined,
      email_verified: false,
      verify_email: true,
    }),
  });
  if (createResponse.ok) {
    user = (await createResponse.json()) as Auth0User;
    created = true;
  } else if (createResponse.status === 409) {
    user = await findByEmail(input.email, token);
  } else {
    throw new Error("AUTH0_USER_PROVISIONING_FAILED");
  }
  if (!user?.user_id) throw new Error("AUTH0_USER_PROVISIONING_FAILED");

  if (input.auth0OrganizationId) {
    const membership = await auth0Request(
      `/organizations/${encodeURIComponent(input.auth0OrganizationId)}/members`,
      token,
      { method: "POST", body: JSON.stringify({ members: [user.user_id] }) }
    );
    if (!membership.ok && membership.status !== 409) {
      throw new Error("AUTH0_ORGANIZATION_MEMBERSHIP_FAILED");
    }
  }

  const ticket = await auth0Request("/tickets/password-change", token, {
    method: "POST",
    body: JSON.stringify({
      user_id: user.user_id,
      result_url: `${getAppBaseUrl()}/auth/login`,
      mark_email_as_verified: false,
      ttl_sec: 7 * 24 * 60 * 60,
    }),
  });
  return {
    user,
    created,
    // Ticket URLs are deliberately never returned by this service.
    setupStatus: ticket.ok ? "provider_setup_created" : "provider_setup_pending",
  };
}
