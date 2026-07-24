import "server-only";

import { provisionalAuth0UserIdForEmail } from "@/lib/identity/broker-user-id";
import {
  getOktaApiToken,
  getOktaAppId,
  getOktaGroupId,
  getOktaGroupName,
  getOktaOrgUrl,
  isOktaProvisioningConfigured,
  requireOktaProvisioningConfig,
} from "@/lib/okta/config";
import { OktaProvisioningError } from "@/lib/okta/errors";

export type OktaUserStatus =
  | "STAGED"
  | "PROVISIONED"
  | "ACTIVE"
  | "RECOVERY"
  | "PASSWORD_EXPIRED"
  | "LOCKED_OUT"
  | "SUSPENDED"
  | "DEPROVISIONED"
  | "UNKNOWN";

export type OktaProvisioningOutcome =
  | "new_user_activation_email_sent"
  | "existing_staged_activation_email_sent"
  | "existing_provisioned_activation_email_resent"
  | "existing_recovery_activation_email_resent"
  | "existing_recovery_pending"
  | "existing_active_access_granted"
  | "existing_password_expired"
  | "existing_locked_out"
  | "existing_suspended"
  | "existing_deprovisioned_activation_email_sent";

export interface OktaUserSummary {
  id: string;
  email: string;
  status: string;
  created: boolean;
}

/** @deprecated Prefer OktaProvisionResult.outcome */
export interface OktaProvisionResult {
  user: OktaUserSummary;
  setupStatus: OktaProvisioningOutcome | string;
  hint?: string;
  oktaUserId: string;
  oktaStatus: OktaUserStatus;
  created: boolean;
  alreadyExisted: boolean;
  groupAssigned: boolean;
  activationEmailSent: boolean;
  outcome: OktaProvisioningOutcome;
  provisionalAuth0UserId: string;
}

interface OktaUserJson {
  id?: string;
  status?: string;
  profile?: { email?: string; login?: string; firstName?: string; lastName?: string };
}

interface OktaGroupJson {
  id?: string;
  profile?: { name?: string };
}

const BLOCKED_OUTCOMES = new Set<OktaProvisioningOutcome>([
  "existing_locked_out",
  "existing_suspended",
]);

function splitDisplayName(displayName?: string | null): {
  firstName: string;
  lastName: string;
} {
  const trimmed = displayName?.trim() || "";
  if (!trimmed) return { firstName: "Invited", lastName: "User" };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0]!, lastName: "User" };
  return { firstName: parts[0]!, lastName: parts.slice(1).join(" ") };
}

function asStatus(raw: string | undefined): OktaUserStatus {
  const value = (raw ?? "UNKNOWN").toUpperCase();
  const known: OktaUserStatus[] = [
    "STAGED",
    "PROVISIONED",
    "ACTIVE",
    "RECOVERY",
    "PASSWORD_EXPIRED",
    "LOCKED_OUT",
    "SUSPENDED",
    "DEPROVISIONED",
  ];
  return (known.find((s) => s === value) ?? "UNKNOWN") as OktaUserStatus;
}

export function isFederationBrokerModeAssignmentError(detail: string): boolean {
  return /Federation Broker Mode/i.test(detail);
}

export function isBlockedOktaProvisioningOutcome(outcome: string): boolean {
  return BLOCKED_OUTCOMES.has(outcome as OktaProvisioningOutcome);
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

function assertExactEmailMatch(user: OktaUserJson, email: string): void {
  const login = user.profile?.login?.trim().toLowerCase() || "";
  const profileEmail = user.profile?.email?.trim().toLowerCase() || "";
  if (login !== email && profileEmail !== email) {
    throw new OktaProvisioningError(
      "OKTA_USER_PROVISIONING_FAILED",
      "Okta returned a user that does not match the requested email."
    );
  }
}

export async function findOktaUserByLogin(login: string): Promise<OktaUserJson | null> {
  const email = login.trim().toLowerCase();
  const encoded = encodeURIComponent(email);
  const response = await oktaRequest(`/users/${encoded}`);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new OktaProvisioningError("OKTA_UNAVAILABLE", await readOktaFailure(response));
  }
  const user = (await response.json()) as OktaUserJson;
  assertExactEmailMatch(user, email);
  return user;
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
        ...(input.displayName?.trim()
          ? { displayName: input.displayName.trim() }
          : {}),
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

export async function resolveOktaDocsGroupId(): Promise<string> {
  const configured = getOktaGroupId();
  if (configured) return configured;

  const name = getOktaGroupName();
  if (!name) {
    throw new OktaProvisioningError(
      "OKTA_NOT_CONFIGURED",
      "Set OKTA_DOCS_GROUP_ID to the Cyware Docs Users group id (00g…)."
    );
  }

  const response = await oktaRequest(
    `/groups?q=${encodeURIComponent(name)}&limit=50`
  );
  if (!response.ok) {
    throw new OktaProvisioningError(
      "OKTA_GROUP_ASSIGNMENT_FAILED",
      `Could not look up Okta group "${name}": ${await readOktaFailure(response)}`
    );
  }
  const groups = (await response.json()) as OktaGroupJson[];
  const exact = groups.find(
    (g) => g.profile?.name?.trim().toLowerCase() === name.toLowerCase()
  );
  if (!exact?.id || !exact.id.startsWith("00g")) {
    throw new OktaProvisioningError(
      "OKTA_GROUP_ASSIGNMENT_FAILED",
      `No Okta group named "${name}". Set OKTA_DOCS_GROUP_ID to the group's id (Directory → Groups).`
    );
  }
  return exact.id;
}

async function assignUserToGroup(userId: string, groupId: string): Promise<void> {
  const response = await oktaRequest(
    `/groups/${encodeURIComponent(groupId)}/users/${encodeURIComponent(userId)}`,
    { method: "PUT" }
  );
  if (response.ok || response.status === 204 || response.status === 409) return;
  const detail = await readOktaFailure(response);
  if (/already|member|duplicate/i.test(detail)) return;
  throw new OktaProvisioningError("OKTA_GROUP_ASSIGNMENT_FAILED", detail);
}

async function verifyUserInGroup(userId: string, groupId: string): Promise<void> {
  const response = await oktaRequest(`/users/${encodeURIComponent(userId)}/groups`);
  if (!response.ok) {
    throw new OktaProvisioningError(
      "OKTA_GROUP_ASSIGNMENT_FAILED",
      `Could not verify docs group membership: ${await readOktaFailure(response)}`
    );
  }
  const groups = (await response.json()) as OktaGroupJson[];
  if (!groups.some((g) => g.id === groupId)) {
    throw new OktaProvisioningError(
      "OKTA_GROUP_ASSIGNMENT_FAILED",
      "Group assignment did not persist; user is not a member of the docs group."
    );
  }
}

async function assignUserToAppSoft(userId: string): Promise<string | undefined> {
  const appId = getOktaAppId();
  if (!appId) return undefined;

  const response = await oktaRequest(`/apps/${encodeURIComponent(appId)}/users`, {
    method: "POST",
    body: JSON.stringify({ id: userId, scope: "USER" }),
  });
  if (response.ok || response.status === 409) return undefined;
  const detail = await readOktaFailure(response);
  if (/already|assigned|duplicate/i.test(detail)) return undefined;
  if (isFederationBrokerModeAssignmentError(detail)) {
    return "Direct app assignment skipped (Federation Broker Mode). Group membership is required and was applied.";
  }
  return `Direct app assignment failed: ${detail}. Group membership was applied.`;
}

async function lifecycleActivate(userId: string): Promise<void> {
  const response = await oktaRequest(
    `/users/${encodeURIComponent(userId)}/lifecycle/activate?sendEmail=true`,
    { method: "POST" }
  );
  if (!response.ok) {
    throw new OktaProvisioningError("OKTA_ACTIVATION_FAILED", await readOktaFailure(response));
  }
}

async function lifecycleReactivate(userId: string): Promise<void> {
  const response = await oktaRequest(
    `/users/${encodeURIComponent(userId)}/lifecycle/reactivate?sendEmail=true`,
    { method: "POST" }
  );
  if (!response.ok) {
    throw new OktaProvisioningError("OKTA_ACTIVATION_FAILED", await readOktaFailure(response));
  }
}

/**
 * Ensure docs group membership (required). Optional app assign is soft under FBM.
 */
async function ensureDocsGroup(userId: string): Promise<{ groupId: string; hint?: string }> {
  const groupId = await resolveOktaDocsGroupId();
  await assignUserToGroup(userId, groupId);
  await verifyUserInGroup(userId, groupId);
  const hint = await assignUserToAppSoft(userId);
  return { groupId, hint };
}

function buildResult(input: {
  user: OktaUserJson;
  email: string;
  created: boolean;
  outcome: OktaProvisioningOutcome;
  activationEmailSent: boolean;
  hint?: string;
}): OktaProvisionResult {
  const status = asStatus(input.user.status);
  const provisionalAuth0UserId = provisionalAuth0UserIdForEmail(input.email);
  return {
    user: {
      id: input.user.id!,
      email: input.user.profile?.email?.trim().toLowerCase() || input.email,
      status,
      created: input.created,
    },
    setupStatus: input.outcome,
    hint: input.hint,
    oktaUserId: input.user.id!,
    oktaStatus: status,
    created: input.created,
    alreadyExisted: !input.created,
    groupAssigned: true,
    activationEmailSent: input.activationEmailSent,
    outcome: input.outcome,
    provisionalAuth0UserId,
  };
}

/**
 * Create or find Okta user, require Cyware Docs Users group, run status-specific lifecycle.
 * Does not reset passwords or factors for ACTIVE users.
 */
export async function provisionOktaUser(input: {
  email: string;
  displayName?: string | null;
}): Promise<OktaProvisionResult> {
  if (!isOktaProvisioningConfigured()) {
    throw new OktaProvisioningError("OKTA_NOT_CONFIGURED");
  }
  try {
    requireOktaProvisioningConfig();
  } catch (error) {
    throw new OktaProvisioningError(
      "OKTA_NOT_CONFIGURED",
      error instanceof Error ? error.message : undefined
    );
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

  const status = asStatus(user.status);

  // Blocked states: still attempt group for ops visibility, but do not claim sign-in ready.
  if (status === "LOCKED_OUT" || status === "SUSPENDED") {
    const { hint } = await ensureDocsGroup(user.id);
    const outcome: OktaProvisioningOutcome =
      status === "LOCKED_OUT" ? "existing_locked_out" : "existing_suspended";
    return buildResult({
      user,
      email,
      created: false,
      outcome,
      activationEmailSent: false,
      hint,
    });
  }

  const { hint } = await ensureDocsGroup(user.id);

  if (created || status === "STAGED") {
    await lifecycleActivate(user.id);
    return buildResult({
      user: { ...user, status: "STAGED" },
      email,
      created,
      outcome: created
        ? "new_user_activation_email_sent"
        : "existing_staged_activation_email_sent",
      activationEmailSent: true,
      hint,
    });
  }

  if (status === "PROVISIONED") {
    await lifecycleReactivate(user.id);
    return buildResult({
      user,
      email,
      created: false,
      outcome: "existing_provisioned_activation_email_resent",
      activationEmailSent: true,
      hint,
    });
  }

  if (status === "ACTIVE") {
    return buildResult({
      user,
      email,
      created: false,
      outcome: "existing_active_access_granted",
      activationEmailSent: false,
      hint,
    });
  }

  if (status === "PASSWORD_EXPIRED") {
    return buildResult({
      user,
      email,
      created: false,
      outcome: "existing_password_expired",
      activationEmailSent: false,
      hint,
    });
  }

  if (status === "RECOVERY") {
    try {
      await lifecycleReactivate(user.id);
      return buildResult({
        user,
        email,
        created: false,
        outcome: "existing_recovery_activation_email_resent",
        activationEmailSent: true,
        hint,
      });
    } catch {
      return buildResult({
        user,
        email,
        created: false,
        outcome: "existing_recovery_pending",
        activationEmailSent: false,
        hint,
      });
    }
  }

  if (status === "DEPROVISIONED") {
    await lifecycleActivate(user.id);
    return buildResult({
      user,
      email,
      created: false,
      outcome: "existing_deprovisioned_activation_email_sent",
      activationEmailSent: true,
      hint,
    });
  }

  // Unknown status: group assigned; do not invent an activation email.
  return buildResult({
    user,
    email,
    created: false,
    outcome: "existing_active_access_granted",
    activationEmailSent: false,
    hint:
      hint ||
      `Okta user status is ${status}; group membership was applied. Confirm the account can sign in.`,
  });
}

/**
 * For Sign up: if the email has an Okta account, send password setup when appropriate.
 */
export async function requestOktaPasswordSetupForEmail(email: string): Promise<{
  sent: boolean;
  setupStatus: string;
  hint?: string;
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
  await ensureDocsGroup(user.id);
  const status = asStatus(user.status);
  if (status === "ACTIVE") {
    return {
      sent: false,
      setupStatus: "existing_active_access_granted",
      hint: "This Okta account is already active. Sign in with your Okta password and Okta Verify.",
    };
  }
  if (status === "PROVISIONED") {
    await lifecycleReactivate(user.id);
  } else if (status === "STAGED" || status === "DEPROVISIONED") {
    await lifecycleActivate(user.id);
  } else if (status === "RECOVERY") {
    await lifecycleReactivate(user.id);
  } else {
    throw new OktaProvisioningError(
      "OKTA_ACTIVATION_FAILED",
      `Cannot send setup email for Okta status ${status}.`
    );
  }
  return { sent: true, setupStatus: "okta_activation_sent" };
}
