import "server-only";

import {
  getOktaApiToken,
  getOktaAppId,
  getOktaOrgUrl,
  isOktaProvisioningConfigured,
} from "@/lib/okta/config";
import { OktaProvisioningError } from "@/lib/okta/errors";

export interface OktaUserSummary {
  id: string;
  email: string;
  status: string;
  created: boolean;
}

interface OktaUserJson {
  id?: string;
  status?: string;
  profile?: { email?: string; login?: string };
}

function splitDisplayName(displayName?: string | null): {
  firstName: string;
  lastName: string;
} {
  const trimmed = displayName?.trim() || "";
  if (!trimmed) return { firstName: "Invited", lastName: "User" };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "User" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

async function oktaRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const orgUrl = getOktaOrgUrl();
  const token = getOktaApiToken();
  if (!orgUrl || !token) {
    throw new OktaProvisioningError("OKTA_NOT_CONFIGURED");
  }
  return fetch(`${orgUrl}/api/v1${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `SSWS ${token}`,
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
}

async function readOktaFailure(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      errorSummary?: string;
      errorCode?: string;
      errorCauses?: Array<{ errorSummary?: string }>;
    };
    const cause = body.errorCauses?.map((c) => c.errorSummary).filter(Boolean).join("; ");
    return (
      cause ||
      body.errorSummary?.trim() ||
      body.errorCode?.trim() ||
      `Okta HTTP ${response.status}`
    );
  } catch {
    return `Okta HTTP ${response.status}`;
  }
}

export async function findOktaUserByLogin(login: string): Promise<OktaUserJson | null> {
  const encoded = encodeURIComponent(login.trim().toLowerCase());
  const response = await oktaRequest(`/users/${encoded}`);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new OktaProvisioningError("OKTA_UNAVAILABLE", await readOktaFailure(response));
  }
  return (await response.json()) as OktaUserJson;
}

async function createStagedOktaUser(input: {
  email: string;
  displayName?: string | null;
}): Promise<OktaUserJson> {
  const email = input.email.trim().toLowerCase();
  const { firstName, lastName } = splitDisplayName(input.displayName);
  const response = await oktaRequest("/users?activate=false", {
    method: "POST",
    body: JSON.stringify({
      profile: {
        firstName,
        lastName,
        email,
        login: email,
      },
    }),
  });
  if (!response.ok) {
    throw new OktaProvisioningError(
      "OKTA_USER_PROVISIONING_FAILED",
      await readOktaFailure(response)
    );
  }
  return (await response.json()) as OktaUserJson;
}

async function assignUserToApp(userId: string): Promise<void> {
  const appId = getOktaAppId();
  if (!appId) throw new OktaProvisioningError("OKTA_NOT_CONFIGURED");
  const response = await oktaRequest(`/apps/${encodeURIComponent(appId)}/users`, {
    method: "POST",
    body: JSON.stringify({
      id: userId,
      scope: "USER",
    }),
  });
  // 200/201 success; 409 already assigned is fine
  if (response.ok || response.status === 409) return;
  // Okta sometimes returns 400 when already assigned with a specific message
  const detail = await readOktaFailure(response);
  if (/already|assigned|duplicate/i.test(detail)) return;
  throw new OktaProvisioningError("OKTA_APP_ASSIGNMENT_FAILED", detail);
}

/**
 * Send activation (STAGED) or reset-password email so the user can set a password.
 * Does not complete an app OIDC session — they must Sign in afterward.
 */
export async function sendOktaPasswordSetupEmail(userId: string, status: string): Promise<boolean> {
  const normalized = status.toUpperCase();
  const path =
    normalized === "STAGED" || normalized === "PROVISIONED"
      ? `/users/${encodeURIComponent(userId)}/lifecycle/activate?sendEmail=true`
      : `/users/${encodeURIComponent(userId)}/lifecycle/reset_password?sendEmail=true`;
  const response = await oktaRequest(path, { method: "POST" });
  if (response.ok) return true;
  // Already active + recent reset may 403; surface as soft failure to caller
  if (response.status === 403 || response.status === 400) {
    throw new OktaProvisioningError("OKTA_ACTIVATION_FAILED", await readOktaFailure(response));
  }
  throw new OktaProvisioningError("OKTA_ACTIVATION_FAILED", await readOktaFailure(response));
}

/**
 * Create (or find) Okta user, assign docs app, send password-setup email.
 */
export async function provisionOktaUser(input: {
  email: string;
  displayName?: string | null;
}): Promise<{ user: OktaUserSummary; setupStatus: string }> {
  if (!isOktaProvisioningConfigured()) {
    throw new OktaProvisioningError("OKTA_NOT_CONFIGURED");
  }

  const email = input.email.trim().toLowerCase();
  let created = false;
  let user = await findOktaUserByLogin(email);
  if (!user?.id) {
    user = await createStagedOktaUser(input);
    created = true;
  }
  if (!user.id) {
    throw new OktaProvisioningError("OKTA_USER_PROVISIONING_FAILED", "Okta returned no user id");
  }

  await assignUserToApp(user.id);

  let setupStatus = "okta_provisioned";
  try {
    const sent = await sendOktaPasswordSetupEmail(user.id, user.status ?? "STAGED");
    if (sent) setupStatus = "okta_activation_sent";
  } catch (error) {
    if (error instanceof OktaProvisioningError && !created) {
      // Existing user may already have a password — still provisioned/assigned
      setupStatus = "okta_provisioned";
    } else if (error instanceof OktaProvisioningError) {
      setupStatus = "okta_activation_pending";
    } else {
      throw error;
    }
  }

  return {
    user: {
      id: user.id,
      email: user.profile?.email?.trim().toLowerCase() || email,
      status: user.status ?? "UNKNOWN",
      created,
    },
    setupStatus,
  };
}

/**
 * For Sign up: if the email has an Okta account, send password setup / reset email.
 */
export async function requestOktaPasswordSetupForEmail(email: string): Promise<{
  sent: boolean;
  setupStatus: string;
}> {
  if (!isOktaProvisioningConfigured()) {
    throw new OktaProvisioningError("OKTA_NOT_CONFIGURED");
  }
  const normalized = email.trim().toLowerCase();
  const user = await findOktaUserByLogin(normalized);
  if (!user?.id) {
    throw new OktaProvisioningError(
      "OKTA_USER_PROVISIONING_FAILED",
      "No Okta account found for this email. Ask an administrator to Add user first."
    );
  }
  await assignUserToApp(user.id);
  await sendOktaPasswordSetupEmail(user.id, user.status ?? "STAGED");
  return { sent: true, setupStatus: "okta_activation_sent" };
}
