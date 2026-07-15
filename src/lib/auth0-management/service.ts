import "server-only";

import { getAppBaseUrl } from "@/lib/documentation-auth/env";
import {
  Auth0ProvisioningError,
  isProvisionalAuth0UserId,
  provisionalAuth0UserIdForEmail,
} from "@/lib/auth0-management/errors";

interface Auth0User {
  user_id: string;
  email: string;
  name?: string;
}

interface Auth0FailureBody {
  message?: string;
  error?: string;
  error_description?: string;
  statusCode?: number;
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
    throw new Auth0ProvisioningError("AUTH0_MANAGEMENT_NOT_CONFIGURED");
  }
  return { domain, clientId, clientSecret, connection, audience };
}

async function readAuth0Failure(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as Auth0FailureBody;
    return (
      body.message?.trim() ||
      body.error_description?.trim() ||
      body.error?.trim() ||
      `Auth0 HTTP ${response.status}`
    );
  } catch {
    return `Auth0 HTTP ${response.status}`;
  }
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
  if (!response.ok) {
    throw new Auth0ProvisioningError(
      "AUTH0_MANAGEMENT_UNAVAILABLE",
      await readAuth0Failure(response)
    );
  }
  const body = (await response.json()) as { access_token?: string };
  if (!body.access_token) {
    throw new Auth0ProvisioningError("AUTH0_MANAGEMENT_UNAVAILABLE");
  }
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
  if (!response.ok) {
    throw new Auth0ProvisioningError(
      "AUTH0_MANAGEMENT_UNAVAILABLE",
      await readAuth0Failure(response)
    );
  }
  const users = (await response.json()) as Auth0User[];
  return users.find((user) => user.email.toLowerCase() === email.toLowerCase()) ?? null;
}

async function resolveConnectionId(token: string, connectionName: string): Promise<string | null> {
  const response = await auth0Request(
    `/connections?name=${encodeURIComponent(connectionName)}&fields=id,name&include_fields=true`,
    token
  );
  if (!response.ok) return null;
  const connections = (await response.json()) as Array<{ id?: string; name?: string }>;
  const match = connections.find((entry) => entry.name === connectionName);
  return match?.id ?? null;
}

async function provisionViaOrganizationInvitation(input: {
  email: string;
  displayName?: string | null;
  auth0OrganizationId: string;
  token: string;
}): Promise<{ user: Auth0User; created: boolean; setupStatus: string }> {
  const cfg = config();
  const appClientId = process.env.AUTH0_CLIENT_ID?.trim();
  if (!appClientId) {
    throw new Auth0ProvisioningError(
      "AUTH0_MANAGEMENT_NOT_CONFIGURED",
      "AUTH0_CLIENT_ID is required for organization invitations."
    );
  }
  const connectionId = await resolveConnectionId(input.token, cfg.connection);
  const invitationBody: Record<string, unknown> = {
    inviter: { name: input.displayName?.trim() || "Workspace admin" },
    invitee: { email: input.email },
    client_id: appClientId,
    send_invitation_email: true,
    ttl_sec: 7 * 24 * 60 * 60,
  };
  if (connectionId) invitationBody.connection_id = connectionId;

  const invitation = await auth0Request(
    `/organizations/${encodeURIComponent(input.auth0OrganizationId)}/invitations`,
    input.token,
    { method: "POST", body: JSON.stringify(invitationBody) }
  );
  if (!invitation.ok && invitation.status !== 409) {
    throw new Auth0ProvisioningError(
      "AUTH0_ORGANIZATION_INVITATION_FAILED",
      await readAuth0Failure(invitation)
    );
  }

  const existing = await findByEmail(input.email, input.token);
  if (existing?.user_id) {
    return {
      user: existing,
      created: false,
      setupStatus: invitation.ok ? "provider_invitation_sent" : "provider_setup_pending",
    };
  }

  return {
    user: {
      user_id: provisionalAuth0UserIdForEmail(input.email),
      email: input.email,
      name: input.displayName ?? undefined,
    },
    created: true,
    setupStatus: invitation.ok ? "provider_invitation_sent" : "provider_setup_pending",
  };
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
  } else if (input.auth0OrganizationId) {
    return provisionViaOrganizationInvitation({
      email: input.email,
      displayName: input.displayName,
      auth0OrganizationId: input.auth0OrganizationId,
      token,
    });
  } else {
    throw new Auth0ProvisioningError(
      "AUTH0_USER_PROVISIONING_FAILED",
      await readAuth0Failure(createResponse)
    );
  }

  if (!user?.user_id) {
    if (input.auth0OrganizationId) {
      return provisionViaOrganizationInvitation({
        email: input.email,
        displayName: input.displayName,
        auth0OrganizationId: input.auth0OrganizationId,
        token,
      });
    }
    throw new Auth0ProvisioningError(
      "AUTH0_USER_PROVISIONING_FAILED",
      "Auth0 did not return a user id for this email."
    );
  }

  if (input.auth0OrganizationId && !isProvisionalAuth0UserId(user.user_id)) {
    const membership = await auth0Request(
      `/organizations/${encodeURIComponent(input.auth0OrganizationId)}/members`,
      token,
      { method: "POST", body: JSON.stringify({ members: [user.user_id] }) }
    );
    if (!membership.ok && membership.status !== 409) {
      throw new Auth0ProvisioningError(
        "AUTH0_ORGANIZATION_MEMBERSHIP_FAILED",
        await readAuth0Failure(membership)
      );
    }
  }

  if (!isProvisionalAuth0UserId(user.user_id)) {
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
      setupStatus: ticket.ok ? "provider_setup_created" : "provider_setup_pending",
    };
  }

  return {
    user,
    created,
    setupStatus: "provider_invitation_sent",
  };
}
